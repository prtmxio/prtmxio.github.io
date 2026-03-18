# CLIP: Contrastive Language-Image Pre-Training

> Radford et al., OpenAI, 2021

---

## The Problem It Solves

Before CLIP, vision models were trained on fixed label sets. You'd train a ResNet on ImageNet's 1000 classes; it learns to distinguish cats from dogs, but only those exact 1000 things. Want it to recognise "a dog wearing a hat"? Retrain from scratch. The labels were a hard ceiling.

CLIP's insight: instead of predicting a discrete label, predict whether a given image and a given sentence **go together**. This sounds simple, but it completely changes what the model learns. Instead of "this is a cat (class 47)", it learns "this image is semantically close to this sentence". The entire structure of human language becomes the supervision signal: 400 million image-text pairs scraped from the internet.

---

## Intuition First

Imagine projecting every image and every sentence into the same room, a 512-dimensional space. CLIP's training goal is:

- Pull matching pairs (an image of a dog + "a photo of a dog") **close together**
- Push non-matching pairs (an image of a dog + "a photo of a car") **far apart**

After training, things that mean the same thing end up in the same neighbourhood, regardless of whether they're expressed as pixels or words. That's why you can type "a rainy street at night" and retrieve images that match; the text and the images are in the same space, measured by the same ruler (cosine similarity).

---

## Architecture

CLIP is two encoders trained jointly. Neither is novel on its own; what's novel is the training objective connecting them.

```
[Image] ──→ Image Encoder ──→ e_i ∈ ℝ^512  (L2-normalised)
                                        ↘
                                         dot product → similarity score
                                        ↗
[Text]  ──→ Text Encoder  ──→ z_i ∈ ℝ^512  (L2-normalised)
```

### Image Encoder: ViT-B/32

The ViT (Vision Transformer, Dosovitskiy et al.) treats an image as a sequence of patches, just like a sentence is a sequence of words.

1. **Patch embedding**: split the 224×224 image into 32×32 patches → 7×7 = 49 patches
2. **Linear projection**: each patch (32×32×3 = 3072 pixels) → 768-dim vector
3. **Prepend [CLS] token**: a learnable vector placed at position 0
4. **Add positional embeddings**: learned 2D position info added to each patch embedding
5. **Transformer encoder**: 12 layers of multi-head self-attention + MLP
6. **Take [CLS] output**: the CLS token attends to all patches, aggregating global image meaning
7. **Linear projection**: 768 → 512 (the shared embedding dimension)

```
Image (224×224×3)
  → split into 49 patches of 32×32×3
  → embed each patch: Linear(3072 → 768)
  → + positional embedding
  → prepend [CLS]
  → Transformer (depth=12, heads=12, dim=768)
  → take output at [CLS] position
  → W_I ∈ ℝ^{768×512}  (visual projection)
  → L2 normalise
  → e_i ∈ ℝ^512
```

### Text Encoder: GPT-2-style Transformer

1. **BPE tokenisation**: text → token IDs (vocabulary size 49,408)
2. **Max 77 tokens** (hard context window limit)
3. **Token embeddings + positional embeddings**
4. **Transformer encoder**: 12 layers with **causal (masked) self-attention**: each token attends only to previous tokens
5. **Take output at [EOS] position**: the last token aggregates the full sentence
6. **Linear projection**: 512 → 512 (text projection)

```
Text string
  → BPE tokenise → [49406, ..., 49407]  (SOS...EOS)
  → token embed + positional embed
  → Transformer (depth=12, heads=8, dim=512)
  → take output at [EOS] token
  → W_T ∈ ℝ^{512×512}  (text projection)
  → L2 normalise
  → z_i ∈ ℝ^512
```

---

## Training Objective

This is the core. For a batch of N image-text pairs {(I_1, T_1), ..., (I_N, T_N)}:

**Step 1: embed everything**

$$e_i = \text{normalise}(W_I \cdot \text{ImageEncoder}(I_i)) \in \mathbb{R}^{512}$$

$$z_i = \text{normalise}(W_T \cdot \text{TextEncoder}(T_i)) \in \mathbb{R}^{512}$$

**Step 2: build the N×N similarity matrix**

$$S_{ij} = e_i \cdot z_j \quad \in [-1, 1]$$

Since both vectors are L2-normalised, the dot product equals cosine similarity. The diagonal `S_ii` should be high (matching pairs), off-diagonal `S_ij (i≠j)` should be low.

**Step 3: contrastive (InfoNCE) loss**

$$\mathcal{L} = -\frac{1}{2N} \sum_{i=1}^{N} \left[ \log \frac{e^{S_{ii}/\tau}}{\sum_{j=1}^{N} e^{S_{ij}/\tau}} + \log \frac{e^{S_{ii}/\tau}}{\sum_{j=1}^{N} e^{S_{ji}/\tau}} \right]$$

- First term: for each image, find its matching text among all N texts
- Second term: for each text, find its matching image among all N images
- τ (tau) is a **learned temperature**: it sharpens or softens the distribution
- The loss is symmetric: we're doing image→text and text→image retrieval simultaneously

Intuitively: for each image in the batch, the model sees N sentences. One of them is the correct caption. The model needs to assign the highest similarity score to the correct one. With N=32,768 (CLIP used very large batches), this is a hard 32,768-way classification problem, which forces the model to build very precise representations.

**Why this works:** the only way to solve this at scale is to learn the actual semantic content of the image. "Dog wearing red hat" can't be distinguished from "Dog wearing blue hat" without understanding colour. The model can't cheat with texture shortcuts; the text forces semantic precision.

---

## The Embedding Space

After training, the space has a useful property: **linearity of meaning**.

Because the loss operates purely via dot products on normalised vectors, the geometry encodes semantics:

- `e("a dog") ≈ e("a puppy")`: synonyms cluster together
- `e("a dog") + e("wearing a hat") ≈ e("a dog wearing a hat")`: composition works
- `e(image_of_dog) ≈ e("a photo of a dog")`: modalities collapse

This is exactly why CLIP works so well for retrieval. The 512-dim sphere is a universal semantic address space.

### Why Cosine Similarity (not Euclidean)?

L2 distance in high dimensions is dominated by vector magnitude; a long vector far from the origin is "far" from everything. Cosine similarity ignores magnitude and measures only angle. After normalisation (all vectors sit on the unit sphere), cosine similarity = dot product, and it measures purely directional agreement, i.e., semantic agreement.

In our codebase:
```python
features = self.model.visual_projection(out.pooler_output)
return F.normalize(features, dim=-1)  # projects to unit sphere
# then: dot(img_vec, text_vec) == cosine_similarity
```

---

## Zero-Shot Transfer

The main use case: CLIP can classify images it was never explicitly trained to classify.

For a dataset with classes ["cat", "dog", "car"]:
1. Encode each class name as text: `z_cat = encode("a photo of a cat")`, etc.
2. Encode the query image: `e_img`
3. Predict: `argmax_c (e_img · z_c)`

No finetuning. No retraining. The model just checks which class label is semantically nearest to the image. On ImageNet, CLIP (ViT-L/14) achieves ~76% zero-shot accuracy, comparable to a fully supervised ResNet-50.

---

## What CLIP Does Not Learn

- **Spatial reasoning**: "a cat to the left of a dog": CLIP struggles here because the ViT patch attention doesn't explicitly model position relationships
- **Counting**: "three dogs" vs "two dogs": often fails
- **Negation**: "a photo without a cat": very poorly handled
- **Fine-grained text**: reading text within images, subtle visual differences

These are the limits of the contrastive objective; it doesn't need to understand these to assign correct captions at scale.

---

## Why It Matters for Synapse

In Synapse's `find.py`, CLIP is doing two things:

1. **Index time** (`index.py`): encode every image in the library → 512-dim vector → store in HNSW graph
2. **Query time**: encode the text anchor from SmolVLM (or a user prompt) → 512-dim vector → search HNSW for nearest neighbours

The key insight: **the anchor sentence and the database images are in the same embedding space**. A sentence describing a rainy street and a photograph of a rainy street end up near each other on the 512-dim sphere, not because they look alike (one is text, one is pixels), but because CLIP was trained to make that so.

That's the entire premise of the retrieval stage. CLIP is the bridge between language and vision.
