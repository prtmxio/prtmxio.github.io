# Synapse: Building a Local Multimodal Pipeline on a 4 GB GPU

---

## Why I Built This

Most tutorials on diffusion models or VLMs assume you have a cloud GPU, or at least 16 GB of VRAM. I had a laptop with an RTX 2050 (4 GB of VRAM). And I wanted to actually understand these systems, not just call an API.

The goal was a pipeline that could do three things, end to end, locally:

1. **Understand** what's in an image, not just a label but a dense semantic description
2. **Retrieve** visually and semantically similar images from a library using that understanding
3. **Generate** a new image inspired by what it found

Perceive → Retrieve → Generate. I called it Synapse because it's about connections: between concepts, between modalities, between a query and its semantic neighbourhood.

The hard constraint: everything had to fit inside 4 GB of VRAM, run fully offline, and be fast enough to actually use.

---

## The Architecture

```
[Input: image or text prompt]
            │
            ▼
    ┌───────────────────┐
    │  Stage 1 — Scry   │  (only if --image)
    │  SmolVLM-500M     │  image → semantic anchor
    │  1.04 GB VRAM     │
    └────────┬──────────┘
             │ "A busy street market at dusk, with
             │  vendors selling produce under orange
             │  awnings, pedestrians casting long shadows."
             ▼
    ┌───────────────────┐
    │  Stage 2 — Find   │
    │  CLIP ViT-B/32    │  anchor/prompt → 512-dim vector
    │  0.31 GB VRAM     │  → HNSW ANN search → top-K images
    └────────┬──────────┘
             │ [market_scene.jpg, evening_crowd.jpg, ...]
             ▼
    ┌───────────────────┐
    │  Stage 3 — Make   │
    │  SD-Turbo         │  anchor/prompt → generated image
    │  1.70 GB VRAM     │  1 denoising step
    └────────┬──────────┘
             │
             ▼
    outputs/make_<timestamp>.png
```

Three models, three different architectures, three different jobs - and they can't all be in VRAM simultaneously: 1.04 + 0.31 + 1.70 = 3.05 GB, which sounds fine, but PyTorch's allocator has overhead and the RTX 2050 needs headroom to avoid OOM during inference. The solution is a staged handoff.

---

## Stage 1 - Scry: From Pixels to Language

### The Model

SmolVLM-500M-Instruct (HuggingFace, 2024) is a 500M parameter vision-language model. It's built from two components:

- **SigLIP vision encoder**: takes the image, splits it into patches, runs them through a ViT, produces a sequence of visual tokens
- **SmolLM2 language model**: takes the visual tokens as context and generates text token by token

The architecture is similar to LLaVA: a frozen or lightly tuned vision encoder feeding into a language model via a projection layer. The LM is conditioned on vision tokens through cross-attention or token prepending, depending on the architecture version.

At 500M parameters in bfloat16 (2 bytes per parameter), the model occupies:

$$500 \times 10^6 \times 2 \text{ bytes} = 1.0 \text{ GB}$$

Which lands at ~1.04 GB in practice with KV cache and activation memory.

### Why bfloat16 and not float16?

Both are 16-bit formats, but they differ in how the bits are allocated:

| Format | Sign | Exponent | Mantissa |
|--------|------|----------|----------|
| float32 | 1 | 8 | 23 |
| float16 | 1 | 5 | 10 |
| bfloat16 | 1 | 8 | 7 |

bfloat16 keeps the same exponent range as float32 (handles values from ~1e-38 to ~3e38), but with less precision. float16 has a much smaller range (~6e-5 to ~65504); values outside that range underflow to zero or overflow to inf. For LLMs and VLMs, the activations can be large, so bfloat16 is safer. SD-Turbo uses float16 because its activations are better controlled.

### What It Produces

The Scryer runs the model with a structured prompt:

> "Describe this image in flowing prose. Focus on the objects, setting, colours, and relationships between elements. Do not use bullet points. Write 3–4 complete sentences only."

The output is trimmed to the last complete sentence, no mid-phrase cuts. This produces what I call a **semantic anchor**: a dense, structured natural language description that captures the meaningful content of the image.

The anchor is the information bridge. It carries the semantic meaning of the image into the retrieval and generation stages in a format both CLIP and SD-Turbo can use.

---

## Stage 2 - Find: Semantic Retrieval

### The Problem with Naive Search

If you wanted to find images similar to a query, the obvious approach is: encode everything, compare everything. For a library of N images and a query vector `q`, compute N dot products and take the top K.

This works at N=100. At N=5000, it's 5000 dot products, still fast. At N=100,000, it's starting to matter. At N=10 million (real retrieval systems), brute force is hopeless.

The HNSW (Hierarchical Navigable Small World) index solves this with approximate nearest neighbour (ANN) search. Instead of checking all N vectors, it builds a graph and traverses it.

### HNSW: The Graph Structure

HNSW builds a multi-layer graph. At each layer, nodes are vectors and edges connect nearby vectors. The top layer is sparse (long-range connections), the bottom layer is dense (short-range connections). Think of it like a transport network: motorways at the top, local roads at the bottom.

At query time:
1. Enter the graph at a random entry point at the top layer
2. Greedily move toward the query vector (pick the neighbour most similar to the query)
3. Drop to the next layer and repeat, now with more nodes available
4. At the bottom layer, do a local exhaustive search in a small neighbourhood

Time complexity: `O(log N)` instead of `O(N)`. For N=5000, this seems like overkill; the speedup over brute force is maybe 10-50ms. But the architecture is already correct for when the library scales.

**Index parameters:**
- `space="cosine"`: distance metric is `1 - cosine_similarity`
- `dim=512`: CLIP ViT-B/32 output dimension
- `M=16`: each node has up to 16 bidirectional connections. More connections → better recall, more RAM
- `ef_construction=200`: during build, how many candidate neighbours to consider before selecting M. Higher → better graph quality, slower build
- `ef=50`: at query time, size of the candidate pool. Must be ≥ K (top-K requested)

### The CLIP Bridge

The retrieval only works because of CLIP's shared embedding space. At index time, every image in the library is encoded to a 512-dim unit vector:

$$e_i = \text{normalise}(W_I \cdot \text{ViT}(I_i)) \in \mathbb{R}^{512}$$

At query time, the semantic anchor (text) is encoded:

$$z = \text{normalise}(W_T \cdot \text{TextTransformer}(T)) \in \mathbb{R}^{512}$$

The dot product `e_i · z = cos(θ)` measures semantic agreement between the image and the text, because CLIP's contrastive training pulled matching image-text pairs toward each other on the 512-dim unit sphere.

The HNSW search returns the K image vectors whose angle to `z` is smallest: the K images most semantically aligned with the anchor.

### The 77-Token Limit

CLIP's text encoder has a hard context window of 77 tokens (a design choice inherited from GPT-2). SmolVLM's anchor can easily run to 100–150 tokens. Feeding a 150-token string to CLIP doesn't crash; it silently truncates to 77 tokens, but the truncation happens at a byte level, potentially cutting mid-word or mid-concept.

The fix is a word-level truncation before passing to CLIP:

```python
def _clip_truncate(text: str, max_words: int = 55) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    truncated = " ".join(words[:max_words])
    # trim to last complete sentence
    for end in (".", "!", "?"):
        last = truncated.rfind(end)
        if last != -1:
            return truncated[:last + 1].strip()
    return truncated.strip()
```

55 words → ~70 tokens (English words average ~1.3 tokens each) → safely under 77. Trimming to a sentence boundary means the text fed to both CLIP and SD-Turbo is always semantically complete, no dangling clauses.

### Caching the Index

The HNSW index and the path metadata are loaded once at `Finder.__init__()`, not per query. The disk read is ~50–200ms depending on index size. If you loaded it every call, a 10-query session would waste 0.5–2 seconds on pure disk I/O.

```python
# In __init__ — once
self.index = hnswlib.Index(space="cosine", dim=512)
self.index.load_index(INDEX_PATH)
with open(META_PATH) as f:
    self.metadata = json.load(f)

# In query_index — per call, ~1ms
labels, distances = self.index.knn_query(query_vec, k=top_k)
```

HNSW returns **cosine distances** (lower = more similar). We convert to similarities for display:

$$\text{similarity} = 1 - \text{distance}$$

A distance of 0.05 → similarity 0.95 (very close match). In practice, CLIP similarities in the real world sit around 0.20–0.40 for genuine matches; the embedding space is large and the distribution is spread.

---

## Stage 3 - Make: Generation

### SD-Turbo

SD-Turbo (Stability AI, 2023) is Stable Diffusion 1.x distilled to run in **a single denoising step** via adversarial training. Standard SD 1.5 needs 50 DDIM steps, meaning 50 sequential UNet forward passes. SD-Turbo needs 1.

The distillation works by training a student model (the same U-Net architecture) to produce, in one step, output that a discriminator can't distinguish from multi-step outputs of the teacher. It's GAN training applied to diffusion. The result is a model that has baked multi-step refinement into a single forward pass.

The pipeline at inference:

```
[text prompt]
    → CLIP text encoder → 77 × 768 token embeddings
    → random latent z_T ~ N(0, I) of shape [1, 4, 64, 64]
    → UNet (1 step, guidance_scale=0.0)
    → denoised latent z_0 of shape [1, 4, 64, 64]
    → VAE decoder
    → image of shape [3, 512, 512]
```

The image lives in **latent space** during diffusion (64×64×4), not pixel space (512×512×3). The VAE compresses a 512×512 image by a factor of 8 spatially (512→64) and expands channels (3→4), giving a ~48× reduction in spatial dimension. This is why diffusion in latent space is fast; the U-Net operates on 64×64 feature maps, not 512×512.

### Why `guidance_scale=0.0`

Classifier-Free Guidance (CFG) works by running the U-Net twice per step: once conditioned on the prompt, once with a null/empty prompt, then interpolating:

$$\hat{\varepsilon} = \varepsilon_\theta(x_t, \emptyset) + w \cdot (\varepsilon_\theta(x_t, c) - \varepsilon_\theta(x_t, \emptyset))$$

where `w` is the guidance scale. Higher `w` → stronger prompt adherence, but also more artifacts.

SD-Turbo was adversarially trained to produce quality outputs in one step **without** CFG. The guidance is baked into the weights. Running CFG on top (two UNet passes, extrapolation) contradicts the training distribution and degrades output. `guidance_scale=0.0` means: use only the conditional prediction directly. One UNet pass, no extrapolation.

### Temperature

Standard SD-Turbo is deterministic given a seed; the same prompt + seed always produces the same image. This is useful for reproducibility but limits creative exploration.

The naive approach would be to add noise at the input (the initial latent `z_T`). The problem: SD-Turbo was trained with `z_T ~ N(0, σ²I)` where `σ ≈ 14.6` (the terminal noise level). The U-Net has learned to denoise specifically from this distribution. Scaling or shifting the input noise moves it outside the training distribution → garbage predictions → NaN in fp16 → black image.

The correct approach: add noise **after** denoising, in the clean latent space:

$$z_0' = z_0 + \mathcal{N}(0,\, (\tau \cdot 0.5)^2 \mathbf{I})$$

The denoised latent `z_0` is in a well-conditioned range (~[-3, 3]). The VAE decoder is smooth and well-trained on nearby points. Small perturbations produce visually varied but structurally coherent outputs; the semantic content is preserved (still a street, still at dusk) but texture, lighting, and fine detail vary.

The scale is remapped to match the LLM convention:

| Temperature | `noise_std` | Effect |
|---|---|---|
| 0.0 | 0.0 | Deterministic, same seed same image |
| 0.3 | 0.15 | Subtle variation in texture and colour |
| 0.7 | 0.35 | Noticeable variation, same structure |
| 1.0 | 0.5 | Strong variation, may drift from prompt |

```python
if temperature > 0.0:
    # get the clean latent before VAE
    result = pipe(..., output_type="latent")
    z_0 = result.images
    noise_std = temperature * 0.5
    z_0 = z_0 + torch.randn_like(z_0) * noise_std
    # decode manually
    decoded = pipe.vae.decode(z_0 / pipe.vae.config.scaling_factor).sample
    image = pipe.image_processor.postprocess(decoded, output_type="pil")[0]
```

---

## The Engineering Problem: VRAM Budget

This is where things got annoying. Three models, one GPU, 4 GB.

| Model | VRAM |
|---|---|
| SmolVLM-500M (bfloat16) | 1.04 GB |
| CLIP ViT-B/32 (float16) | 0.31 GB |
| SD-Turbo (float16) | 1.70 GB |
| **Total if all loaded** | **3.05 GB** |

3.05 GB sounds fine for a 4 GB card. But PyTorch's CUDA memory allocator keeps a cache of free blocks rather than immediately returning them to the OS. After inference, `torch.cuda.empty_cache()` is needed to actually release the memory. Without it, 1.04 + 0.31 + 1.70 GB actually occupies more than the sum due to fragmentation and allocator overhead.

The solution: **staged loading with explicit VRAM handoff**.

```python
# Stage 1+2: co-load Scryer + Finder (1.35 GB total — fits comfortably)
scryer = Scryer()   # 1.04 GB
finder = Finder()   # 0.31 GB  →  1.35 GB total

anchor = scryer.scry(image)
results = finder.query_index(anchor)

scryer.unload()  # del self.model + torch.cuda.empty_cache()
finder.unload()  # del self.model + torch.cuda.empty_cache()
# VRAM now: ~0.1 GB (residual allocator)

# Stage 3: load Maker alone (1.70 GB — now has full headroom)
maker = Maker()
out = maker.make_and_save(prompt)
maker.unload()
```

Scryer and Finder are co-loaded because 1.04 + 0.31 = 1.35 GB fits alongside each other with room to spare, and co-loading saves one load cycle (~2–3 seconds). They're both unloaded before Maker loads, giving SD-Turbo the full budget.

### The Offline Fix

All three brain modules set `HF_HUB_OFFLINE=1` to prevent network calls. The critical bug I hit: the env var was being set **after** the `import transformers` statement. Python executes imports immediately, and HuggingFace Hub reads `HF_HUB_OFFLINE` at import time. By the time the env var was set, the library had already initialised without it.

Fix: set `os.environ["HF_HUB_OFFLINE"] = "1"` **before** any transformers/diffusers import:

```python
import os
os.environ["HF_HUB_OFFLINE"] = "1"  # ← must be here

import torch                          # ← not here
from transformers import CLIPModel   # ← definitely not here
```

Ordering of `os.environ` relative to imports is a silent footgun in Python. The interpreter doesn't warn you, it just hits the network.

---

## Two Pipeline Modes

The pipeline supports two entry points depending on what you have:

**Image mode** (`--image`): you have an image and want to understand + retrieve + generate from it. All three stages run. SmolVLM produces the semantic anchor, which drives both the retrieval query and the generation prompt. Latency: ~12–14s.

**Prompt mode** (`--prompt`): you have a text description and want to retrieve similar images and generate from it. Stage 1 (Scryer) is skipped entirely; SmolVLM never loads, never occupies VRAM. CLIP encodes the text directly, retrieval runs, then generation. Latency: ~6–10s.

The latency gap (~5s) is almost entirely SmolVLM's load + inference time. In prompt mode, the VRAM budget is also lower: CLIP (0.31 GB) → unload → SD-Turbo (1.70 GB), with more headroom throughout.

You can combine both: `--image --prompt` uses the image for retrieval context (SmolVLM generates the anchor for the HNSW query) but lets the user-written prompt steer generation. Useful when you want to find images related to a scene, but generate something compositionally different.

---

## Latency Breakdown

On RTX 2050, cold start:

| Step | Time |
|---|---|
| Python / uv startup | ~0.5s |
| SmolVLM load | ~3.0s |
| SmolVLM inference (captioning) | ~2.0s |
| SmolVLM unload + cache clear | ~0.3s |
| CLIP load | ~1.5s |
| HNSW query (encode + search) | ~0.1s |
| CLIP unload + cache clear | ~0.3s |
| SD-Turbo load | ~7.0s |
| SD-Turbo inference (1 step) | ~0.5s |
| VAE decode | ~0.3s |
| **Total (image mode)** | **~12–14s** |
| **Total (prompt mode)** | **~6–10s** |

SD-Turbo's load time (~7s) dominates. This is unavoidable cold-start cost: 1.7 GB of weights moving from disk to VRAM. The inference itself is 0.5s (one UNet pass in fp16 on a 64×64 latent). The load/inference ratio is 14:1; the model spends more time loading than thinking.

The path to lower latency is keeping models resident across runs (daemon mode), not faster inference.

---

## What I Learned

A few things that weren't obvious from papers alone:

**VRAM is not additive**. Two models at 1.0 GB each don't neatly use 2.0 GB. PyTorch's allocator, activation memory during inference, and the GPU driver's own overhead all take a cut. Budget 15–20% above the sum of model weights.

**Environment variables and import order matter**. Python doesn't run your file top-to-bottom conceptually; imports trigger library initialization code immediately. Any library configuration via env vars must precede the import, not follow it.

**The score function is the unifying idea in diffusion**. DDPM, DDIM, probability flow ODEs; they all reduce to the same underlying concept: estimate `∇_x log p_t(x)` and use it to reverse the diffusion process. The noise prediction network `ε_θ` literally is a scaled, negated score network. Once I understood that, the jump from DDPM to DDIM to continuous-time SDEs became one coherent story.

**CLIP's embedding space is genuinely shared**. I was sceptical that a text description of an image and the image itself would end up in the same neighbourhood. Testing it: an anchor like "a person riding a bicycle on a city street" retrieving images of cyclists, made the contrastive training objective click in a concrete way. The shared space isn't approximate; it's precise enough to drive useful retrieval.

**Latent-space noise is the right place for temperature**. The naive approach (scale input noise) breaks the model entirely: black image in fp16. Moving the perturbation to after denoising, in the clean latent before the VAE, works because the VAE decoder has been trained on a smooth distribution of latent codes. The temperature idea from language models (scaling logits before softmax) has a geometric analogue: perturbing the point on the data manifold that the model predicted, rather than the input to the denoising process.
