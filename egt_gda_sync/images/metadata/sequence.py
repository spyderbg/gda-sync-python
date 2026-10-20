"""One description of an animation, from ordered representative frames."""
from io import BytesIO
import math
from pathlib import Path

from PIL import Image, ImageDraw

from egt_gda_sync.app.errors import AppError

SAMPLE_LIMIT = 12


def sample_indices(count: int) -> list[int]:
    """Evenly cover the complete animation, including its first and last frame."""
    if count <= SAMPLE_LIMIT:
        return list(range(count))
    return [round(index * (count - 1) / (SAMPLE_LIMIT - 1)) for index in range(SAMPLE_LIMIT)]


def manifest(sequence: dict) -> dict:
    return {key: value for key, value in sequence.items() if key not in ('files', 'descriptors')}


def storyboard(sequence: dict, read_image) -> tuple[bytes, dict, list[int]]:
    """Crop atlas frames before fitting them into a labeled chronological grid."""
    indices = sample_indices(len(sequence['frames']))
    if not indices:
        raise AppError('The animation has no frames')
    columns = min(4, len(indices))
    cell_width, cell_height = 288, 246
    sheet = Image.new('RGB', (columns * cell_width, math.ceil(len(indices) / columns) * cell_height), '#ededf2')
    draw = ImageDraw.Draw(sheet)
    last_path, last_pixels = None, None
    properties = None
    for tile, index in enumerate(indices):
        frame = sequence['frames'][index]
        path = Path(sequence['files'][frame['path']])
        if path != last_path:
            data, _facts = read_image(path)
            with Image.open(BytesIO(data)) as image:
                last_pixels = image.convert('RGBA')
            last_path = path
        pixels = last_pixels.copy()
        if crop := frame.get('source'):
            x, y, width, height = (crop[key] for key in ('x', 'y', 'w', 'h'))
            if width <= 0 or height <= 0 or x < 0 or y < 0 or x + width > pixels.width or y + height > pixels.height:
                raise AppError(f'Invalid source rectangle in animation frame {index + 1}')
            pixels = pixels.crop((x, y, x + width, y + height))
        if properties is None:
            properties = {'filename': sequence.get('id') or 'animation', 'width': pixels.width, 'height': pixels.height,
                          'transparency': pixels.getchannel('A').getextrema()[0] < 255}
        else:
            properties['transparency'] |= pixels.getchannel('A').getextrema()[0] < 255
        pixels.thumbnail((cell_width - 24, cell_height - 48), Image.Resampling.LANCZOS)
        left, top = (tile % columns) * cell_width, (tile // columns) * cell_height
        sheet.paste(pixels, (left + (cell_width - pixels.width) // 2, top + 30 + (cell_height - 42 - pixels.height) // 2), pixels)
        elapsed = index * sequence['frameTime']
        draw.text((left + 10, top + 8), f'Frame {index + 1}/{len(sequence["frames"])}  |  {elapsed} ms', fill='#30344a')
    output = BytesIO()
    sheet.save(output, format='PNG')
    return output.getvalue(), properties, indices


def instruction(sequence: dict, indices: list[int]) -> str:
    return (
        f'This contact sheet shows one animation, {sequence.get("id") or "unnamed"}, in playback order '
        f'from left to right and top to bottom. It has {len(sequence["frames"])} frames, '
        f'{sequence["frameTime"]} milliseconds per frame, loopCount={sequence["loopCount"]}, '
        f'loopTo={sequence.get("loopTo")}. Shown frame numbers: {[index + 1 for index in indices]}. '
        'Write ONE description of the whole animation: its subject, appearance, motion, and changes over time. '
        'Do not describe the contact sheet, frame labels, grid, or gray presentation background as part of the artwork. '
        'Use objects and tags for the animation as a whole. Text means text in the artwork, not the frame labels. '
        'These are representative samples; acknowledge uncertainty and do not invent unseen intermediate action.'
    )
