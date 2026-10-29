"""Run an API-format workflow on a remote, self-hosted ComfyUI server."""
from __future__ import annotations

from copy import deepcopy
from io import BytesIO
import json
import math
from pathlib import Path
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen
import uuid

from PIL import Image

from .analyzer import AnalysisError
from .generator import generation_options_from_meta, prompt_from_meta, render_dimensions_from_meta

MAX_RESPONSE = 64 * 1024 * 1024


class ComfyGenerator:
    """Submit, poll and download only this job's configured output node."""

    def __init__(self, settings: dict, *, api_key: str | None = None):
        self.settings = settings
        self.api_key = api_key
        self.base_url = settings['base_url'].rstrip('/')
        parsed = urlsplit(self.base_url)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.query or parsed.fragment:
            raise ValueError('ComfyUI base_url must be an HTTP or HTTPS URL without a query or fragment')
        if not math.isfinite(settings['timeout']) or settings['timeout'] <= 0:
            raise ValueError('ComfyUI timeout must be positive')
        self.workflow = None

    def validate(self) -> None:
        try:
            workflow = json.loads(self.settings['workflow'])
        except (TypeError, ValueError) as error:
            raise ValueError('ComfyUI workflow must be valid JSON exported with Export (API)') from error
        if not isinstance(workflow, dict) or not workflow or any(
                not isinstance(node, dict) or not isinstance(node.get('class_type'), str)
                or not isinstance(node.get('inputs'), dict) for node in workflow.values()):
            raise ValueError('ComfyUI workflow must be an API-format object of nodes, not the UI workflow format')
        for field, inputs in (('prompt_node', ('text',)), ('size_node', ('width', 'height')),
                              ('sampler_node', ('steps', 'cfg')), ('output_node', ())):
            key = self.settings[field]
            if field == 'sampler_node' and not key:
                continue
            node = workflow.get(key)
            if not isinstance(node, dict) or any(name not in node['inputs'] for name in inputs):
                raise ValueError(f'ComfyUI {field} must name a node with inputs: {", ".join(inputs) or "image output"}')
            if field == 'sampler_node' and not any(name in node['inputs'] for name in ('seed', 'noise_seed')):
                raise ValueError('ComfyUI sampler_node must have a seed or noise_seed input; leave it empty to keep workflow settings')
        self.workflow = workflow

    def _request(self, endpoint: str, payload: dict | None = None, *, raw: bool = False,
                 timeout: float | None = None):
        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'
        request = Request(f'{self.base_url}/{endpoint}', headers=headers,
                          data=json.dumps(payload).encode() if payload is not None else None)
        try:
            with urlopen(request, timeout=timeout or min(30, self.settings['timeout'])) as response:
                content = response.read(MAX_RESPONSE + 1)
            if len(content) > MAX_RESPONSE:
                raise AnalysisError('ComfyUI response exceeds 64 MB')
            if raw:
                return content
            value = json.loads(content)
            if not isinstance(value, dict):
                raise ValueError('expected a JSON object')
            return value
        except HTTPError as error:
            raise AnalysisError(f'ComfyUI returned HTTP {error.code}: {error.read(2000).decode(errors="replace")}') from error
        except (URLError, TimeoutError, OSError) as error:
            raise AnalysisError(f'Cannot reach ComfyUI at {self.base_url}: {error}') from error
        except (ValueError, UnicodeError) as error:
            raise AnalysisError('ComfyUI returned invalid JSON') from error

    def generate(self, meta_path: str | Path, output_path: str | Path, *, width: int = 1024,
                 height: int = 1024, cancel: threading.Event | None = None, **_options) -> Path:
        self.validate()
        width, height, transparency = generation_options_from_meta(meta_path, width=width, height=height)
        render_width, render_height = render_dimensions_from_meta(meta_path, width=width, height=height)
        workflow = deepcopy(self.workflow)
        workflow[self.settings['prompt_node']]['inputs']['text'] = prompt_from_meta(meta_path)
        workflow[self.settings['size_node']]['inputs'].update(width=render_width, height=render_height)
        if self.settings['sampler_node']:
            inputs = workflow[self.settings['sampler_node']]['inputs']
            inputs.update(steps=self.settings['steps'], cfg=self.settings['cfg_scale'])
            # -1 requests a fresh seed, as for sd-cli.
            seed = self.settings['seed']
            inputs['seed' if 'seed' in inputs else 'noise_seed'] = uuid.uuid4().int % (2 ** 63) if seed < 0 else seed
        if cancel is not None and cancel.is_set():
            raise AnalysisError('ComfyUI generation cancelled')
        deadline = time.monotonic() + self.settings['timeout']
        result = self._request('prompt', {'prompt': workflow, 'client_id': str(uuid.uuid4())})
        prompt_id = result.get('prompt_id')
        if not isinstance(prompt_id, str) or not prompt_id:
            raise AnalysisError(f'ComfyUI rejected the workflow: {json.dumps(result)[:2000]}')
        try:
            while True:
                if cancel is not None and cancel.is_set():
                    raise AnalysisError('ComfyUI generation cancelled')
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise AnalysisError('ComfyUI generation timed out; increase remote.generation.timeout')
                history = self._request(f'history/{quote(prompt_id, safe="")}', timeout=min(30, remaining)).get(prompt_id)
                if history is not None:
                    if not isinstance(history, dict):
                        raise AnalysisError('ComfyUI returned invalid job history')
                    status = history.get('status', {})
                    if status.get('status_str') == 'error':
                        raise AnalysisError(f'ComfyUI workflow failed: {json.dumps(status.get("messages", []))[:2000]}')
                    outputs = history.get('outputs', {}).get(self.settings['output_node'], {}).get('images', [])
                    if outputs:
                        image = outputs[0]
                        if not isinstance(image, dict) or not isinstance(image.get('filename'), str):
                            raise AnalysisError('ComfyUI returned an invalid image output')
                        query = urlencode({key: image.get(key, '') for key in ('filename', 'subfolder', 'type')})
                        data = self._request(f'view?{query}', raw=True, timeout=min(30, max(0.1, deadline - time.monotonic())))
                        break
                    raise AnalysisError('ComfyUI workflow completed without an image at the configured output node')
                if cancel is not None:
                    cancel.wait(min(0.5, remaining))
                else:
                    time.sleep(min(0.5, remaining))
        except AnalysisError:
            # Delete only our pending prompt. Never interrupt a different user's running workflow.
            try:
                self._request('queue', {'delete': [prompt_id]})
            except AnalysisError:
                pass
            raise
        if cancel is not None and cancel.is_set():
            raise AnalysisError('ComfyUI generation cancelled')
        destination = Path(output_path)
        try:
            with Image.open(BytesIO(data)) as rendered:
                rendered.load()
                pixels = rendered.convert('RGBA')
            if transparency:
                minimum, maximum = pixels.getchannel('A').getextrema()
                if minimum == 255 or maximum == 0:
                    raise AnalysisError('ComfyUI workflow did not produce a visible transparent image; use an RGBA workflow')
            else:
                pixels = Image.alpha_composite(Image.new('RGBA', pixels.size, 'white'), pixels).convert('RGB')
            if self.settings['keep_original']:
                # Store a PNG even when a custom output node returned another format.
                with Image.open(BytesIO(data)) as original:
                    original.save(destination.with_name(f'{destination.stem}.original.png'), format='PNG')
            if pixels.size != (width, height):
                pixels = pixels.resize((width, height), Image.Resampling.LANCZOS)
            pixels.save(destination, format='PNG')
        except (OSError, ValueError) as error:
            raise AnalysisError(f'Cannot read ComfyUI generated image: {error}') from error
        return destination
