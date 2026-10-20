"""Local vision analysis and diffusion generation, adapted from the image-analyzer project.

The service module adds asset resolution, DDS support, editable sidecars and a
single persistent queue. No model downloads or cloud services are required.
"""

from .analyzer import AnalysisError, ImageAnalyzer
from .generator import ImageGenerator, prompt_from_meta

__all__ = ['AnalysisError', 'ImageAnalyzer', 'ImageGenerator', 'prompt_from_meta']
