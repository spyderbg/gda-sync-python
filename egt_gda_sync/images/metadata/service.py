"""Editable image sidecars and one persistent worker for all local model work.

Jobs snapshot workspace roots, model settings and input revisions at submission.
They never follow the currently selected workspace. Each ImageSeq has one shared
description and one queued job. Pending jobs of the same operation/model run
together to avoid repeatedly loading the vision and diffusion models.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
import mimetypes
import os
from pathlib import Path
import tempfile
import threading
import uuid

from PIL import Image

from egt_gda_sync.app.errors import AppError
from egt_gda_sync.images.dds import decode_dds
from .analyzer import ImageAnalyzer
from .config import DEFAULTS, _merge, load_config
from .comfy import ComfyGenerator
from .generator import ImageGenerator
from .sequence import instruction as sequence_instruction, manifest, storyboard

EXTENSIONS = {'.dds', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tga', '.tif', '.tiff'}
MAX_METADATA = 1024 * 1024
MAX_IMAGE = 64 * 1024 * 1024
TERMINAL = {'succeeded', 'skipped', 'failed', 'cancelled'}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def revision(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else ''


def checked(path: str | Path, root: str | Path) -> Path:
    """Confine reads and writes to a captured root, without following symbolic links."""
    root = Path(root).resolve()
    path = Path(os.path.abspath(path))
    if not path.is_relative_to(root) or path.resolve() != path:
        raise AppError('Image metadata must stay inside the workspace resources folder, without symbolic links')
    return path


def sidecar(source: Path) -> Path:
    return Path(f'{source}.json')


def target_paths(target: Path | dict, root: Path) -> tuple[Path, Path, Path, dict | None]:
    source = checked(target['source'] if isinstance(target, dict) else target, root)
    path = checked(target['path'] if isinstance(target, dict) else sidecar(source), root)
    return source, path, checked(f'{path}.generated.png', root), target.get('sequence') if isinstance(target, dict) else None


def target_key(target: Path | dict) -> str:
    return target['file'] if isinstance(target, dict) else str(target)


def sequence_metadata(value: dict, sequence: dict) -> dict:
    value = deepcopy(value)
    samples = value.get('sequence', {}).get('sampledFrames')
    value['sequence'] = manifest(sequence)
    if samples is not None:
        value['sequence']['sampledFrames'] = samples
    return value


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False, suffix='.tmp') as handle:
            temporary = Path(handle.name)
            json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write('\n')
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def validate_metadata(value: object) -> dict:
    if not isinstance(value, dict) or type(value.get('schema_version')) is not int or value['schema_version'] != 1:
        raise AppError('Expected schema_version 1 image metadata')
    image, generation, analysis = (value.get(name) for name in ('image', 'generation', 'analysis'))
    if not all(isinstance(part, dict) for part in (image, generation, analysis)):
        raise AppError('Metadata must contain image, generation and analysis objects')
    for name, fields, multiple in (('image', image, 1), ('generation', generation, 32)):
        for key in ('width', 'height'):
            number = fields.get(key)
            if type(number) is not int or not 0 < number <= 16384 or number % multiple:
                raise AppError(f'{name}.{key} must be a positive integer up to 16384, divisible by {multiple}')
        if fields['width'] * fields['height'] > 64 * 1024 * 1024:
            raise AppError(f'{name} dimensions are too large')
    if type(image.get('transparency')) is not bool:
        raise AppError('image.transparency must be true or false')
    for key in ('description', 'scene', 'text'):
        if not isinstance(analysis.get(key), str):
            raise AppError(f'analysis.{key} must be text')
    for key in ('tags', 'objects'):
        if not isinstance(analysis.get(key), list) or any(not isinstance(item, str) for item in analysis[key]):
            raise AppError(f'analysis.{key} must be a list of strings')
    if 'prompt' in generation and (not isinstance(generation['prompt'], str) or not generation['prompt'].strip()):
        raise AppError('The generation prompt must not be empty')
    if not analysis['description'].strip() and not generation.get('prompt', '').strip():
        raise AppError('Enter a description or generation prompt')
    try:
        encoded = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
    except (ValueError, TypeError) as error:
        raise AppError('Metadata must contain valid JSON values') from error
    if len(encoded) > MAX_METADATA:
        raise AppError('The metadata is too large')
    return value


def image_data(source: Path) -> tuple[bytes, dict]:
    if source.stat().st_size > MAX_IMAGE:
        raise AppError('The image is too large to analyze (maximum 64 MiB)')
    original = source.read_bytes()
    data = decode_dds(original) if source.suffix.lower() == '.dds' else original
    with Image.open(BytesIO(data)) as pixels:
        if pixels.width * pixels.height > 64 * 1024 * 1024:
            raise AppError('The image dimensions are too large to analyze')
        rgba = pixels.convert('RGBA')
        properties = {'filename': source.name, 'width': pixels.width, 'height': pixels.height,
                      'transparency': rgba.getchannel('A').getextrema()[0] < 255,
                      'mime_type': 'image/vnd-ms.dds' if source.suffix.lower() == '.dds' else mimetypes.guess_type(source.name)[0],
                      'size_bytes': len(original), 'sha256': hashlib.sha256(original).hexdigest()}
        output = BytesIO()
        rgba.save(output, format='PNG')
    return output.getvalue(), properties


def blank_metadata(filename: str, properties: dict | None = None) -> dict:
    image = properties or {'filename': filename, 'width': 1024, 'height': 1024, 'transparency': False}
    return {'schema_version': 1, 'image': image,
            'generation': {'width': (image['width'] + 31) // 32 * 32, 'height': (image['height'] + 31) // 32 * 32},
            'model': 'manual', 'created_at': now(),
            'analysis': {'description': '', 'scene': '', 'objects': [], 'tags': [], 'text': ''}}


class MetadataLibrary:
    """One serial model queue shared by every workspace in this application."""

    def __init__(self, home: str, operation_lock: threading.Lock):
        self.home = Path(home)
        self.config_path = Path(os.environ.get('IMAGE_ANALYZER_CONFIG', self.home / 'image-analyzer.json')).expanduser().resolve()
        self.queue_path = self.home / 'image-jobs.json'
        self.operation_lock = operation_lock
        self.condition = threading.Condition(threading.RLock())
        self.stopping = threading.Event()
        self.cancels: dict[str, threading.Event] = {}
        self.thread: threading.Thread | None = None
        self.jobs: list[dict] = []
        self.last_group = None
        self.lease = None
        self.started = False

    def start(self) -> None:
        with self.condition:
            if self.started:
                return
            if self.thread is not None and self.thread.is_alive():
                raise AppError('The previous image worker is still shutting down', 409)
            self.thread = None
            self.stopping.clear()
            self.home.mkdir(parents=True, exist_ok=True)
            # The development supervisor and CLI also construct Libraries. Only
            # a serving backend owns the queue, protected against a second process.
            lease = (self.home / 'image-model-queue.lock').open('a+b')
            try:
                if os.name == 'nt':
                    import msvcrt  # pylint: disable=import-error  # Only available on Windows.
                    lease.seek(0)
                    if not lease.read(1):
                        lease.write(b'0')
                        lease.flush()
                    lease.seek(0)
                    msvcrt.locking(lease.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(lease.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as error:
                lease.close()
                raise AppError('Another backend already owns the image generation queue', 409) from error
            self.lease = lease
            self.started = True
            try:
                if self.queue_path.exists():
                    self.jobs = json.loads(self.queue_path.read_text(encoding='utf-8'))
                    for job in self.jobs:
                        if job['state'] in ('running', 'cancelling'):
                            job.update(state='failed', error='The application stopped during this job. Queue it again.', finishedAt=now())
                    self._persist()
            except Exception:
                self._release_lease()
                self.started = False
                raise
            self._wake()

    def _wake(self) -> None:
        if self.thread is None and any(job['state'] == 'queued' for job in self.jobs):
            self.thread = threading.Thread(target=self._worker, name='image-model-queue', daemon=True)
            self.thread.start()
        self.condition.notify_all()

    def settings(self) -> dict:
        with self.condition:
            try:
                values = load_config(self.config_path) if self.config_path.exists() else deepcopy(DEFAULTS)
            except ValueError as error:
                raise AppError(str(error)) from error
            return {'path': str(self.config_path), 'settings': values}

    def save_settings(self, values: dict) -> dict:
        validated = deepcopy(DEFAULTS)
        try:
            _merge(validated, values)
            ImageAnalyzer(**{key: validated['analysis'][key] for key in ('base_url', 'model', 'timeout', 'max_tokens')})
            remote = validated['remote']
            ImageAnalyzer(**{key: remote['analysis'][key] for key in ('base_url', 'model', 'timeout', 'max_tokens')})
            generator = ComfyGenerator(remote['generation'])
            if remote['generation']['enabled'] or remote['generation']['workflow'].strip():
                generator.validate()
        except ValueError as error:
            raise AppError(str(error)) from error
        with self.condition:
            atomic_json(self.config_path, validated)
        return self.settings()

    def _persist(self) -> None:
        # Keep all live jobs and the most recent 1000 completed jobs across restarts.
        finished = [job for job in self.jobs if job['state'] in TERMINAL][-1000:]
        self.jobs = [job for job in self.jobs if job['state'] not in TERMINAL or job in finished]
        atomic_json(self.queue_path, self.jobs)

    def status(self, workspace: str) -> dict:
        with self.condition:
            jobs = [deepcopy(job) for job in self.jobs if job['workspace'] == workspace]
            for job in jobs:
                settings = job.pop('settings', {})
                operation = 'analysis' if job['kind'] == 'metadata' else 'generation'
                remote = settings.get('remote', {}).get(operation, {})
                selected = remote if remote.get('enabled') else settings.get(operation, {})
                job['model'] = (selected.get('model', '') if operation == 'analysis' else
                                'ComfyUI' if remote.get('enabled') else Path(selected.get('diffusion_model', '')).name)
                job.pop('sequence', None)
                job.pop('group', None)
                job.pop('expected', None)
            return {'jobs': jobs, 'running': any(job['state'] in ('running', 'cancelling') for job in jobs),
                    'queued': sum(job['state'] == 'queued' for job in jobs)}

    def document(self, target: Path | dict, root: Path, *, draft: bool = True) -> dict:
        source, path, output, sequence = target_paths(target, root)
        value = None
        source_error = None
        if path.exists():
            if path.stat().st_size > MAX_METADATA:
                raise AppError('The metadata file is too large')
            try:
                value = json.loads(path.read_text(encoding='utf-8'))
                if not isinstance(value, dict):
                    raise ValueError('Expected a metadata object')
                # Legacy image-analyzer files can omit newer editable fields.
                image = value.setdefault('image', {})
                image.setdefault('transparency', False)
                image.setdefault('width', DEFAULTS['generation']['width'])
                image.setdefault('height', DEFAULTS['generation']['height'])
                value.setdefault('generation', {'width': (image.get('width', 1024) + 31) // 32 * 32,
                                                'height': (image.get('height', 1024) + 31) // 32 * 32})
                validate_metadata(value)
            except (ValueError, TypeError, AttributeError) as error:
                raise AppError(f'Cannot read metadata {path.name}: {error}') from error
        elif draft:
            properties = None
            if source.is_file():
                try:
                    properties = storyboard(sequence, image_data)[1] if sequence else image_data(source)[1]
                except (OSError, ValueError, AppError) as error:
                    source_error = f'Cannot read source pixels: {error}. You can still create metadata manually.'
            value = blank_metadata(source.name, properties)
            if sequence:
                value = sequence_metadata(value, sequence)
        return {'file': target_key(target), 'path': str(path), 'exists': path.exists(), 'revision': revision(path),
                'kind': 'sequence' if sequence else 'image',
                'metadata': value, 'generated': str(output) if output.is_file() else None, 'sourceError': source_error}

    def save(self, target: Path | dict, root: Path, metadata: dict, expected: str) -> dict:
        _source, path, _output, sequence = target_paths(target, root)
        if sequence:
            metadata = sequence_metadata(metadata, sequence)
        validate_metadata(metadata)
        with self.operation_lock, self.condition:
            checked(path, root)
            if revision(path) != expected:
                raise AppError('The metadata changed. Reload it before saving.', 409)
            atomic_json(path, metadata)
        return self.document(target, root)

    def enqueue(self, workspace: str, root: Path, game: Path, sources: list[Path | dict], kind: str, *, overwrite: bool = False) -> dict:
        return self._enqueue(workspace, root, game, sources, kind, overwrite=overwrite)

    def _enqueue(self, workspace: str, root: Path, game: Path, sources: list[Path | dict], kind: str, *,
                 overwrite: bool = False, retry_job: dict | None = None) -> dict:
        if not self.started:
            self.start()
        if kind not in ('metadata', 'image'):
            raise AppError('Choose metadata analysis or image generation')
        settings = self.settings()['settings']
        operation = 'analysis' if kind == 'metadata' else 'generation'
        remote = settings['remote'][operation]
        operation_settings = remote if remote['enabled'] else settings[operation]
        group = json.dumps([kind, 'remote' if remote['enabled'] else 'local', operation_settings], sort_keys=True)
        keep_original = kind == 'image' and operation_settings['keep_original']
        batch = uuid.uuid4().hex
        jobs = []
        # Validate the entire submission before queueing its first job.
        unique = {target_key(target): target for target in sources}
        for target in unique.values():
            source, path, output, sequence = target_paths(target, root)
            if source.suffix.lower() not in EXTENSIONS:
                raise AppError(f'Unsupported image type: {source.suffix}')
            if kind == 'metadata' and not source.is_file():
                raise AppError(f'The source image does not exist: {source.name}')
            if kind == 'image':
                if not path.is_file():
                    raise AppError(f'Create metadata first: {source.name}')
                self.document(target, root, draft=False)
            jobs.append({'id': uuid.uuid4().hex, 'batch': batch, 'workspace': workspace,
                         'root': str(root), 'game': str(game), 'source': str(source), 'metadata': str(path),
                         'output': str(output), 'kind': kind, 'state': 'queued', 'createdAt': now(),
                         'settings': settings, 'group': group, 'overwrite': overwrite,
                         'expected': {'source': revision(source), 'metadata': revision(path), 'output': revision(output)}})
            jobs[-1]['target'] = target_key(target)
            if sequence:
                jobs[-1]['sequence'] = deepcopy(sequence)
                jobs[-1]['label'] = sequence['id'] or sequence['paths'][0]
                inputs = {*sequence['files'].values(), *sequence.get('descriptors', [])}
                jobs[-1]['expected']['inputs'] = {str(checked(file, root)): revision(checked(file, root)) for file in inputs}
                if kind == 'metadata' and any(not Path(file).is_file() for file in sequence['files'].values()):
                    raise AppError('All animation frame files must exist before analysis')
            original = checked(output.with_name(f'{output.stem}.original.png'), root)
            jobs[-1]['expected']['original'] = revision(original)
        with self.condition:
            submitted = []
            for job in jobs:
                existing = next((old for old in self.jobs if old['kind'] == kind and old['metadata'] == job['metadata']
                                 and old['state'] not in TERMINAL), None)
                if existing:
                    if retry_job is not None:
                        raise AppError('This image already has an active job', 409)
                    submitted.append(existing['id'])
                    continue
                destination = Path(job['metadata'] if kind == 'metadata' else job['output'])
                original = destination.with_name(f'{destination.stem}.original.png')
                if not overwrite and (destination.exists() or (keep_original and original.exists())):
                    job.update(state='skipped', finishedAt=now(), message='Existing output kept')
                if retry_job is not None:
                    job['id'] = retry_job['id']
                    self.jobs.remove(retry_job)
                    retry_job.clear()
                    retry_job.update(job)
                    job = retry_job
                self.jobs.append(job)
                submitted.append(job['id'])
            self._persist()
            self._wake()
        return {**self.status(workspace), 'submitted': submitted}

    def retry(self, workspace: str, job_id: str, *, force: bool = False) -> dict:
        """Requeue the same job last (first in the UI), refreshing inputs and settings."""
        with self.condition:
            job = next((job for job in self.jobs if job['id'] == job_id and job['workspace'] == workspace), None)
            if job is None:
                raise AppError('Image job not found', 404)
            if force and (job['state'] != 'skipped' or job['kind'] != 'image'):
                raise AppError('Only skipped image generation jobs can be force regenerated', 409)
            if not force and job['state'] not in ('failed', 'cancelled'):
                raise AppError('Only failed or cancelled image jobs can be retried', 409)
            target = {'file': job.get('target', job['source']), 'source': job['source'],
                      'path': job['metadata'], 'sequence': job.get('sequence')}
            return self._enqueue(workspace, Path(job['root']), Path(job['game']), [target], job['kind'],
                                 overwrite=force or job['overwrite'], retry_job=job)

    def cancel(self, workspace: str, job_id: str) -> dict:
        with self.condition:
            job = next((job for job in self.jobs if job['id'] == job_id and job['workspace'] == workspace), None)
            if job is None:
                raise AppError('Image job not found', 404)
            if job['state'] == 'queued':
                job.update(state='cancelled', finishedAt=now())
            elif job['state'] in ('running', 'cancelling'):
                job['state'] = 'cancelling'
                self.cancels[job_id].set()
            self._persist()
        return self.status(workspace)

    def cancel_all(self, workspace: str) -> dict:
        # Hold the worker's lock so no pending job starts between cancellations.
        with self.condition:
            for job in self.jobs:
                if job['workspace'] != workspace:
                    continue
                if job['state'] == 'queued':
                    job.update(state='cancelled', finishedAt=now())
                elif job['state'] in ('running', 'cancelling'):
                    job['state'] = 'cancelling'
                    self.cancels[job['id']].set()
            self._persist()
        return self.status(workspace)

    def _worker(self) -> None:
        while not self.stopping.is_set():
            with self.condition:
                pending = [job for job in self.jobs if job['state'] == 'queued']
                if not pending:
                    self.condition.wait(timeout=1)
                    continue
                job = next((job for job in pending if job['group'] == self.last_group), pending[0])
                self.last_group = job['group']
                cancel = self.cancels[job['id']] = threading.Event()
                job.update(state='running', startedAt=now())
                self._persist()
            failure = None
            try:
                self._run(job, cancel)
            except Exception as error:  # A failed file must not stop the queue.
                failure = str(error)
            finally:
                with self.condition:
                    job.update(state='cancelled' if cancel.is_set() or self.stopping.is_set() else
                               'failed' if failure is not None else 'succeeded', finishedAt=now())
                    if failure is not None:
                        job['error'] = failure
                    self.cancels.pop(job['id'], None)
                    self._persist()
        self._release_lease()

    def _release_lease(self) -> None:
        with self.condition:
            if self.lease is not None:
                self.lease.close()
                self.lease = None
                self.started = False

    def _run(self, job: dict, cancel: threading.Event) -> None:
        root = Path(job['root'])
        source, path, output = (checked(job[key], root) for key in ('source', 'metadata', 'output'))
        expected = job['expected']
        def inputs_unchanged():
            return all(revision(checked(file, root)) == digest for file, digest in expected.get('inputs', {}).items())

        if revision(path) != expected['metadata'] or revision(source) != expected['source'] or not inputs_unchanged():
            raise AppError('An input changed while this job was queued. Queue it again.')
        analysis, generation = job['settings']['analysis'], job['settings']['generation']
        remote = job['settings'].get('remote', DEFAULTS['remote'])
        if job['kind'] == 'metadata' and remote['analysis']['enabled']:
            analysis = remote['analysis']
            api_key = os.environ.get(analysis['api_key_env']) if analysis['api_key_env'] else None
        else:
            api_key = os.environ.get('LM_STUDIO_API_KEY')
        analyzer = ImageAnalyzer(**{key: analysis[key] for key in ('base_url', 'model', 'timeout', 'max_tokens')},
                                 api_key=api_key)
        if job['kind'] == 'metadata':
            sequence = job.get('sequence')
            if sequence:
                data, properties, indices = storyboard(sequence, lambda file: image_data(checked(file, root)))
            else:
                data, properties = image_data(source)
            if analysis['load_model']:
                analyzer.load_model(unload_others=analysis['unload_others'])
            value = (analyzer.analyze(source, data=data, instruction=sequence_instruction(sequence, indices)) if sequence
                     else analyzer.analyze(source, data=data))
            value['image'] = properties
            # Render a single new image at a frame's dimensions, not at the contact sheet's size.
            value['generation'] = {'width': (properties['width'] + 31) // 32 * 32,
                                   'height': (properties['height'] + 31) // 32 * 32}
            if sequence:
                value = sequence_metadata(value, sequence)
                value['sequence']['sampledFrames'] = indices
            validate_metadata(value)
            with self.operation_lock, self.condition:
                if cancel.is_set() or self.stopping.is_set():
                    return
                checked(path, root)
                if revision(source) != expected['source'] or revision(path) != expected['metadata'] or not inputs_unchanged():
                    raise AppError('The image or metadata changed during analysis. Existing files were kept.', 409)
                atomic_json(path, value)
        else:
            remote_generation = remote['generation']['enabled']
            if remote_generation:
                generation = {**generation, **remote['generation']}
                api_key = os.environ.get(generation['api_key_env']) if generation['api_key_env'] else None
                generator = ComfyGenerator(generation, api_key=api_key)
            else:
                generator = ImageGenerator(generation['diffusion_model'], generation['text_encoder'], generation['vae'],
                                           executable=generation['sd_cli'], timeout=generation['timeout'])
            generator.validate()
            # Generate privately from a snapshot. Publish only after rechecking every input and output.
            with tempfile.TemporaryDirectory(prefix='image-job-') as directory:
                snapshot, rendered = Path(directory) / 'metadata.json', Path(directory) / 'image.png'
                target = {'file': job.get('target', str(source)), 'source': str(source), 'path': str(path), 'sequence': job.get('sequence')}
                atomic_json(snapshot, self.document(target, root, draft=False)['metadata'])
                if not remote_generation and generation['unload_lm_studio']:
                    analyzer.unload_all_models()
                generator.generate(snapshot, rendered, width=generation['width'], height=generation['height'],
                                   steps=generation['steps'], seed=generation['seed'], cfg_scale=generation['cfg_scale'],
                                   keep_original=generation['keep_original'], cancel=cancel)
                with self.operation_lock, self.condition:
                    if cancel.is_set() or self.stopping.is_set():
                        return
                    checked(output, root)
                    if (revision(path) != expected['metadata'] or revision(output) != expected['output']
                            or revision(source) != expected['source'] or not inputs_unchanged()):
                        raise AppError('The metadata or generated image changed during generation. Existing files were kept.', 409)
                    original = checked(output.with_name(f'{output.stem}.original.png'), root)
                    if generation['keep_original'] and revision(original) != expected.get('original', ''):
                        raise AppError('The original render changed during generation. Existing files were kept.', 409)
                    output.parent.mkdir(parents=True, exist_ok=True)
                    files = [(output, rendered)]
                    if generation['keep_original']:
                        files.append((original, rendered.with_name('image.original.png')))
                    self._publish_images(files)

    @staticmethod
    def _publish_images(files: list[tuple[Path, Path]]) -> None:
        """Stage output on its filesystem, restoring prior bytes if publishing fails."""
        staged, replaced, previous = {}, [], {}
        try:
            for target, source in files:
                previous[target] = target.read_bytes() if target.exists() else None
                with tempfile.NamedTemporaryFile(dir=target.parent, delete=False, suffix='.tmp') as handle:
                    staged[target] = Path(handle.name)
                    handle.write(source.read_bytes())
            for target, temporary in staged.items():
                os.replace(temporary, target)
                replaced.append(target)
        except Exception:
            for target in reversed(replaced):
                if previous[target] is None:
                    target.unlink(missing_ok=True)
                else:
                    target.write_bytes(previous[target])
            raise
        finally:
            for temporary in staged.values():
                temporary.unlink(missing_ok=True)

    def close(self) -> None:
        self.stopping.set()
        with self.condition:
            for cancel in self.cancels.values():
                cancel.set()
            self.condition.notify_all()
        if self.thread is not None:
            self.thread.join(timeout=6)
        else:
            self._release_lease()
