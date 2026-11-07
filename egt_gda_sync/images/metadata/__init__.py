"""Describe images with a local vision model and generate images from their descriptions.

Adapted from the image-analyzer project, whose metadata and configuration formats are kept. The service module adds
asset resolution, DDS support, editable metadata stored outside the resources folder and a single persistent queue.
No model downloads or cloud services are required.
"""

from .describer import ImageDescriber, ModelError
from .generator import ImageGenerator, prompt_from_meta

__all__ = ['ImageDescriber', 'ImageGenerator', 'ModelError', 'prompt_from_meta']
