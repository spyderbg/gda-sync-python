"""The GPU algorithms of the image matching: CLIP and DINOv2 embeddings, made in batches on a CUDA device, and the
exact nearest neighbours of a set of embeddings by cosine similarity.

torch and transformers are optional, installed with pip install -e ".[gpu]", and not part of the packaged executables.
The models download from the Hugging Face Hub on first use and are then read from its cache. Without the packages, a
CUDA device or the models, load_embedder says why, and the image matching goes on with the CPU algorithms.
"""

from __future__ import annotations

import os
import sys

import numpy as np

# Each model, with the normalization of the images it was trained on. Inputs are 224 × 224 RGB images.
MODELS = {
    "clip": {"name": "openai/clip-vit-base-patch32",
             "mean": (0.48145466, 0.4578275, 0.40821073), "std": (0.26862954, 0.26130258, 0.27577711)},
    "dinov2": {"name": "facebook/dinov2-small", "mean": (0.485, 0.456, 0.406), "std": (0.229, 0.224, 0.225)},
}
BATCH_SIZE = 32
SEARCH_CHUNK = 1024  # query embeddings compared with all targets at a time


class Embedder:
    """The models on the GPU. embed turns images into normalized embeddings, and nearest finds the closest targets."""

    def __init__(self, torch, models: dict, device: str):
        self.torch = torch
        self.models = models
        self.device = device
        self.device_name = torch.cuda.get_device_name(device)

    def embed(self, images: np.ndarray) -> dict[str, np.ndarray]:
        """The normalized float32 embedding of each (224, 224, 3) uint8 RGB image, by model."""
        torch = self.torch
        found: dict[str, list[np.ndarray]] = {key: [] for key in self.models}
        with torch.inference_mode():
            for start in range(0, len(images), BATCH_SIZE):
                batch = torch.from_numpy(np.ascontiguousarray(images[start:start + BATCH_SIZE])).to(self.device)
                pixels = batch.permute(0, 3, 1, 2).float().div_(255)
                for key, (model, mean, std) in self.models.items():
                    values = ((pixels - mean) / std).half()
                    if key == "clip":
                        # The image embedding of CLIP: its projected pooled output. transformers 4 and 5 agree on these.
                        vectors = model.visual_projection(model.vision_model(pixel_values=values).pooler_output)
                    else:
                        # DINOv2's class token after its final layer norm.
                        vectors = model(pixel_values=values).pooler_output
                    vectors = torch.nn.functional.normalize(vectors.float(), dim=1)
                    found[key].append(vectors.cpu().numpy())
        return {key: np.concatenate(parts) if parts else np.zeros((0, 0), np.float32) for key, parts in found.items()}

    def nearest(self, queries: np.ndarray, targets: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
        """The k targets with the highest cosine similarity to each query, highest first: their indices and similarities.
        An exact search, like FAISS IndexFlatIP with normalized embeddings."""
        torch = self.torch
        k = min(k, len(targets))
        if not len(queries) or not k:
            return np.zeros((len(queries), 0), np.int64), np.zeros((len(queries), 0), np.float32)
        indices, values = [], []
        with torch.inference_mode():
            stored = torch.from_numpy(targets).to(self.device).half()
            for start in range(0, len(queries), SEARCH_CHUNK):
                chunk = torch.from_numpy(queries[start:start + SEARCH_CHUNK]).to(self.device).half()
                top = torch.topk((chunk @ stored.T).float(), k, dim=1)
                indices.append(top.indices.cpu().numpy())
                values.append(top.values.cpu().numpy())
        return np.concatenate(indices), np.concatenate(values)

    def close(self) -> None:
        self.models.clear()
        self.torch.cuda.empty_cache()


def load_embedder() -> tuple[Embedder | None, str | None]:
    """The embedder on the first CUDA device, or None and why it is unavailable."""
    if getattr(sys, "frozen", False):
        return None, "the packaged executable has no GPU algorithms; run the app from a Python environment with the gpu extra"
    try:
        import torch
        import transformers
    except ImportError as error:
        return None, f'torch and transformers are not installed (pip install -e ".[gpu]"): {error}'
    if not torch.cuda.is_available():
        return None, "torch finds no CUDA GPU"
    # The models' download progress and loading messages would break the report command's progress line.
    os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
    transformers.utils.logging.set_verbosity_error()
    transformers.utils.logging.disable_progress_bar()
    import huggingface_hub
    huggingface_hub.utils.logging.set_verbosity_error()
    # transformers 5 renamed torch_dtype to dtype.
    dtype = {"dtype" if int(transformers.__version__.split(".")[0]) >= 5 else "torch_dtype": torch.float16}
    device = "cuda"
    models = {}
    try:
        for key, model in MODELS.items():
            cls = transformers.CLIPModel if key == "clip" else transformers.AutoModel
            try:
                # A model in the Hugging Face cache loads without the network; the first run downloads it.
                loaded = cls.from_pretrained(model["name"], local_files_only=True, **dtype)
            except OSError:
                loaded = cls.from_pretrained(model["name"], **dtype)
            mean = torch.tensor(model["mean"], device=device).view(1, 3, 1, 1)
            std = torch.tensor(model["std"], device=device).view(1, 3, 1, 1)
            models[key] = (loaded.to(device).eval(), mean, std)
    except Exception as error:  # A download, a missing cache with HF_HUB_OFFLINE, or the device's memory.
        models.clear()
        return None, f"the models could not be loaded: {type(error).__name__}: {error}"
    return Embedder(torch, models, device), None
