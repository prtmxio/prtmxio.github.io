# Diffusion Models — DDPM, DDIM, and Score Matching

> Ho et al. (DDPM, 2020) · Song et al. (DDIM, 2020) · Song & Ermon (Score Matching, 2019–2021)

---

## The Big Idea

All three of these are trying to solve the same problem: **how do you generate a realistic image from random noise?**

The answer diffusion models give: learn the reverse of a destruction process. If you know how to slowly destroy an image by adding noise step by step, then learning the reverse of that process means learning how to generate images. It sounds roundabout, but it works better than anything before it.

The three methods covered here are:
- **DDPM** — the original formulation, probabilistic, slow (1000 steps)
- **DDIM** — reframes the same model as deterministic, can skip steps (~50 steps)
- **Score Matching** — the deeper theory underlying both, connects diffusion to gradient fields of probability distributions

---

## DDPM — Denoising Diffusion Probabilistic Models

### Intuition

Imagine you have a photo of a dog. You add a tiny bit of Gaussian noise. Then a bit more. Then more. After 1000 steps of this, you have pure white noise — completely unrecognisable. The original structure is gone.

Now the question: can we learn to **reverse** this process? If we know what "slightly noisy dog photo" looks like at step 999, can we predict what it looked like at step 998?

DDPM says: train a neural network to predict the noise that was added at each step. If you can predict the noise, you can subtract it. Do that 1000 times starting from pure noise, and you've generated an image.

### The Forward Process

The forward process `q` defines how to add noise. It's a fixed Markov chain — no learnable parameters.

At each step t, we take the previous image and add a small amount of Gaussian noise:

$$q(x_t \mid x_{t-1}) = \mathcal{N}\left(x_t;\ \sqrt{1 - \beta_t}\, x_{t-1},\ \beta_t \mathbf{I}\right)$$

- `β_t` is the **variance schedule** — how much noise to add at step t
- `√(1-β_t)` scales the signal down slightly so total variance doesn't explode
- Typical schedule: `β_1 = 0.0001` (tiny) to `β_T = 0.02` (more) over T=1000 steps

**The nice closed-form trick**: you don't need to apply this T times. You can jump directly from `x_0` to `x_t` in one shot.

Define `αt = 1 - βt` and `ᾱt = ∏_{s=1}^{t} αs` (cumulative product). Then:

$$q(x_t \mid x_0) = \mathcal{N}\left(x_t;\ \sqrt{\bar{\alpha}_t}\, x_0,\ (1 - \bar{\alpha}_t)\mathbf{I}\right)$$

Or in reparameterised form (which is how you actually compute it):

$$x_t = \sqrt{\bar{\alpha}_t}\, x_0 + \sqrt{1 - \bar{\alpha}_t}\, \varepsilon, \quad \varepsilon \sim \mathcal{N}(0, \mathbf{I})$$

This is the **most important equation in DDPM**. It says: a noisy image at any step t is just a weighted sum of the clean image and pure noise. When t=0, `ᾱ_0 = 1`, so `x_0 = x_0`. When t=T, `ᾱ_T ≈ 0`, so `x_T ≈ ε` — pure noise. The weights shift gradually from signal to noise.

### The Reverse Process

The reverse process `p_θ` is what we learn. We want to go from `x_T` (noise) back to `x_0` (clean image).

$$p_\theta(x_{t-1} \mid x_t) = \mathcal{N}\left(x_{t-1};\ \mu_\theta(x_t, t),\ \Sigma_\theta(x_t, t)\right)$$

The true reverse posterior (given `x_0`, which we don't have at inference) is:

$$q(x_{t-1} \mid x_t, x_0) = \mathcal{N}(x_{t-1};\ \tilde{\mu}_t,\ \tilde{\beta}_t \mathbf{I})$$

where:

$$\tilde{\mu}_t = \frac{\sqrt{\bar{\alpha}_{t-1}}\, \beta_t}{1 - \bar{\alpha}_t} x_0 + \frac{\sqrt{\alpha_t}(1 - \bar{\alpha}_{t-1})}{1 - \bar{\alpha}_t} x_t$$

$$\tilde{\beta}_t = \frac{1 - \bar{\alpha}_{t-1}}{1 - \bar{\alpha}_t} \beta_t$$

The trick: substitute the reparameterisation `x_0 = (x_t - √(1-ᾱ_t) ε) / √(ᾱ_t)` into `μ̃_t`. This converts the target from predicting `x_0` to predicting `ε` (the noise):

$$\mu_\theta(x_t, t) = \frac{1}{\sqrt{\alpha_t}} \left( x_t - \frac{\beta_t}{\sqrt{1 - \bar{\alpha}_t}} \varepsilon_\theta(x_t, t) \right)$$

The network `ε_θ(x_t, t)` takes the noisy image and the timestep, and outputs an estimate of the noise that was added.

### Training Objective

The full loss comes from the ELBO (Evidence Lower Bound) on the log-likelihood. After a long derivation involving KL divergences between Gaussians, Ho et al. showed that a simplified version works better in practice:

$$\mathcal{L}_\text{simple} = \mathbb{E}_{t, x_0, \varepsilon} \left[ \left\| \varepsilon - \varepsilon_\theta\!\left( \sqrt{\bar{\alpha}_t}\, x_0 + \sqrt{1 - \bar{\alpha}_t}\, \varepsilon,\ t \right) \right\|^2 \right]$$

In plain English: sample a clean image `x_0`, sample a random timestep `t`, sample random noise `ε`, construct the noisy image `x_t`, ask the network to predict `ε`, penalise the L2 error.

That's it. The whole training loop in one line.

```python
# Pseudocode — one training step
x_0 = sample_from_dataset()
t = random.randint(1, T)
eps = torch.randn_like(x_0)
x_t = sqrt(alpha_bar[t]) * x_0 + sqrt(1 - alpha_bar[t]) * eps
eps_pred = model(x_t, t)
loss = (eps - eps_pred).pow(2).mean()
loss.backward()
```

### Sampling (Inference)

Start from `x_T ~ N(0, I)`, then run T steps of:

$$x_{t-1} = \frac{1}{\sqrt{\alpha_t}} \left( x_t - \frac{\beta_t}{\sqrt{1 - \bar{\alpha}_t}} \varepsilon_\theta(x_t, t) \right) + \sqrt{\beta_t}\, z, \quad z \sim \mathcal{N}(0, \mathbf{I})$$

The `√βt · z` term adds stochasticity at each step — this is the source of variety in generation. With different `z` samples at each step, the same starting noise produces different outputs.

Problem: this requires T=1000 sequential UNet forward passes. Slow.

### U-Net Architecture

The noise-prediction network `ε_θ` is a **U-Net** — originally designed for image segmentation. It has:

- **Encoder path**: a series of ResNet blocks that downsample the image (128→64→32→16→8)
- **Bottleneck**: the lowest resolution, where spatial attention is applied
- **Decoder path**: upsample back up with skip connections from the encoder
- **Skip connections**: direct paths from encoder to decoder at each resolution, preserving fine-grained spatial info

What makes it special for diffusion: **timestep conditioning**.

The timestep `t` needs to be injected into every layer. This is done via a **sinusoidal embedding** (borrowed from Transformers):

$$\text{PE}(t)_{2i} = \sin\!\left(\frac{t}{10000^{2i/d}}\right), \quad \text{PE}(t)_{2i+1} = \cos\!\left(\frac{t}{10000^{2i/d}}\right)$$

This gives a unique, smooth representation for each timestep. It's then passed through a small MLP and **added to the feature maps** at each ResNet block — so every layer knows "am I denoising at step 50 or step 950?"

At lower resolutions (8×8, 16×16), **multi-head self-attention** is applied — letting the model reason about global structure. At higher resolutions (64×64, 128×128), attention is too expensive, so only local convolutions are used.

```
x_t (64×64×4 in latent space) + t_emb
    │
    ├── ResBlock(128) + Attn
    ├── ResBlock(256) + Attn  ← downsample
    ├── ResBlock(512) + Attn  ← downsample
    ├── ResBlock(512) + Attn  ← bottleneck (cross-attn with text in SD)
    ├── ResBlock(256) + Attn  ← upsample + skip
    ├── ResBlock(128) + Attn  ← upsample + skip
    └── Conv → predicted noise ε (same shape as x_t)
```

In Stable Diffusion, cross-attention layers are added so text embeddings can condition each denoising step — that's how "a cat wearing a hat" steers the generation.

---

## DDIM — Denoising Diffusion Implicit Models

### The Problem with DDPM

DDPM needs 1000 UNet forward passes. On an RTX 2050 generating a 512×512 image, that's about 30–60 seconds. Too slow.

But here's the thing: the U-Net trained for DDPM doesn't know or care about the sampling algorithm used at inference. The weights `ε_θ` are fixed. DDIM reuses them with a completely different sampling procedure.

### The Key Insight

DDPM's forward process is Markovian: each step depends only on the previous one. DDIM generalises to **non-Markovian** forward processes that have the same **marginals**:

$$q(x_t \mid x_0) = \mathcal{N}(x_t;\ \sqrt{\bar{\alpha}_t}\, x_0,\ (1 - \bar{\alpha}_t)\mathbf{I})$$

This equation is unchanged — `x_t` given `x_0` has the same distribution as in DDPM. So the same U-Net still works. But the joint distribution over all timesteps is different, allowing non-Markovian step transitions.

### DDIM Sampling Step

The DDIM update rule is:

$$x_{t-1} = \sqrt{\bar{\alpha}_{t-1}} \underbrace{\left(\frac{x_t - \sqrt{1-\bar{\alpha}_t}\, \varepsilon_\theta(x_t,t)}{\sqrt{\bar{\alpha}_t}}\right)}_{\text{predicted } x_0} + \underbrace{\sqrt{1 - \bar{\alpha}_{t-1} - \sigma_t^2}\, \varepsilon_\theta(x_t, t)}_{\text{"direction pointing to } x_t\text{"}} + \underbrace{\sigma_t\, \varepsilon_t}_{\text{optional noise}}$$

The three terms are:
1. **Predicted x_0 scaled back**: the network's current best estimate of the clean image, re-noised to the right level
2. **Direction term**: points toward `x_t` — keeps us on the right trajectory
3. **Stochastic term**: `σ_t ε_t` controls how much randomness to inject

When `σ_t = 0` for all t: **purely deterministic**. The same `x_T` always produces the same `x_0`. This is the "implicit" in DDIM — the model defines an implicit probability flow.

When `σ_t = √((1-ᾱ_{t-1})/(1-ᾱ_t)) · √(1-ᾱ_t/ᾱ_{t-1})`: recovers **DDPM exactly**.

### Skipping Steps

Because the process is non-Markovian and deterministic, you don't need to visit every timestep from T=1000 down to 1. You can define a **subsequence** `{τ_1, τ_2, ..., τ_S}` of S steps:

$$\{1000, 900, 800, ..., 100\} \quad \text{(S=10 steps)}$$

and apply the DDIM update jumping directly between these. The U-Net still runs S times, but S can be 10–50 instead of 1000. Sample quality degrades gracefully — 50 DDIM steps is nearly indistinguishable from 1000 DDPM steps.

**This is why SD-turbo is possible**: the jump from 50 DDIM steps → 4 steps → 1 step is a trajectory of compression, enabled by the flexibility DDIM introduced.

### Determinism and Latent Interpolation

Determinism gives you a powerful property: `x_T` is a **latent code** for the image. Two different starting noises produce two different images. Interpolating between two starting noises `x_T^A` and `x_T^B`:

$$x_T^\lambda = \lambda\, x_T^A + (1-\lambda)\, x_T^B$$

produces smooth visual interpolation between the two generated images. This only works because of determinism — in DDPM, the stochastic noise at each step breaks the correspondence.

---

## Score-Based Generative Models

### The Score Function

The **score** of a distribution p(x) is the gradient of its log-density with respect to x:

$$s(x) = \nabla_x \log p(x)$$

Intuitively: at any point x in the data space, the score points in the direction that most increases the probability of x. It's a vector field that points "toward" high-density regions — toward where real data lives.

If you knew the score function, you could move any point toward likely data by following it (Langevin dynamics). The problem: we only have samples from p(x), not the density itself. We can't compute the score directly.

### Score Matching

The idea (Hyvärinen, 2005): train a neural network `s_θ(x)` to approximate `∇_x log p(x)` by minimising:

$$\mathcal{L}_\text{SM} = \mathbb{E}_{p(x)} \left[ \left\| s_\theta(x) - \nabla_x \log p(x) \right\|^2 \right]$$

But we can't evaluate `∇_x log p(x)`. The integration-by-parts trick (Hyvärinen) shows this is equivalent to:

$$\mathcal{L}_\text{SM} = \mathbb{E}_{p(x)} \left[ \text{tr}(\nabla_x s_\theta(x)) + \frac{1}{2}\|s_\theta(x)\|^2 \right]$$

The trace term requires computing the Jacobian of the network — expensive for high dimensions.

**Denoising Score Matching** (Vincent, 2011) sidesteps this. Instead of matching the score of p(x), match the score of a noisy distribution `p_σ(x̃|x)`:

$$\mathcal{L}_\text{DSM} = \mathbb{E}_{p(x), p_\sigma(\tilde{x}|x)} \left[ \left\| s_\theta(\tilde{x}) - \nabla_{\tilde{x}} \log p_\sigma(\tilde{x} \mid x) \right\|^2 \right]$$

When `p_σ(x̃|x) = N(x̃; x, σ²I)`, the score is just:

$$\nabla_{\tilde{x}} \log p_\sigma(\tilde{x} \mid x) = -\frac{\tilde{x} - x}{\sigma^2} = -\frac{\varepsilon}{\sigma}$$

So training the score model to predict `(x̃ - x)/σ²` is equivalent to predicting the noise divided by σ — **this is exactly what DDPM's ε-prediction does**.

### The Connection to DDPM

The connection (Song et al., 2021) is exact. The noise prediction in DDPM and the score function are related by:

$$\varepsilon_\theta(x_t, t) \approx -\sqrt{1 - \bar{\alpha}_t} \cdot \nabla_{x_t} \log p(x_t)$$

A DDPM noise prediction network **is** a score network. The score points toward the clean data manifold; the noise prediction points toward the noise that was added. They're opposite directions of the same thing.

### Stochastic Differential Equations (the Full Picture)

Song et al. (2021) unify everything by expressing the forward process as an SDE:

$$dx = f(x, t)\, dt + g(t)\, dw$$

where `f` is a drift term, `g` is a diffusion coefficient, and `dw` is Brownian motion. For DDPM:

$$f(x, t) = -\frac{\beta_t}{2} x, \qquad g(t) = \sqrt{\beta_t}$$

The **reverse SDE** (Anderson, 1982) is:

$$dx = \left[f(x,t) - g(t)^2 \nabla_x \log p_t(x)\right] dt + g(t)\, d\bar{w}$$

This is the reverse diffusion process expressed as a continuous-time differential equation. The only unknown is `∇_x log p_t(x)` — the score. Train a score network → plug it in → you can reverse any diffusion process.

The **probability flow ODE** (deterministic):

$$\frac{dx}{dt} = f(x,t) - \frac{1}{2} g(t)^2 \nabla_x \log p_t(x)$$

This is the ODE whose trajectories have the same marginals as the reverse SDE — but it's deterministic. **DDIM is a discretisation of this probability flow ODE**. This is why DDIM works: it's not an approximation or a hack, it's a different (deterministic) integrator for the same underlying continuous process.

### Langevin Dynamics Sampling

Given a score network, you can generate samples via iterative Langevin dynamics:

$$x_{i+1} = x_i + \frac{\epsilon}{2} s_\theta(x_i) + \sqrt{\epsilon}\, z_i, \quad z_i \sim \mathcal{N}(0, \mathbf{I})$$

Start from noise, repeatedly move in the direction of the score (+ add stochastic exploration). Converges to samples from p(x). Needs many steps and a well-trained score at every noise level.

Song & Ermon's **NCSN** (Noise Conditional Score Networks) train a single network `s_θ(x, σ)` across multiple noise scales σ, solving the manifold problem: at low noise, the score is well-defined near the data manifold; at high noise, it guides samples from anywhere in the space.

---

## How They Connect

```
Score Matching (theory)
        │
        │  discretise the reverse SDE
        ▼
     DDPM  ─────────────────────────────────────────────────────┐
   (stochastic,                                                  │
    Markovian,                                                   │
    T=1000)                                                      │
        │                                                        │
        │  reinterpret as probability flow ODE,                  │
        │  generalise to non-Markovian forward process           │
        ▼                                                        │
     DDIM                                                        │
   (deterministic,                                               │
    non-Markovian,                                               │
    S=10–50 steps)                                               │
        │                                                        │
        │  distil down further with adversarial training         │
        ▼                                                        │
   SD-Turbo ◄───────────────────────────────────────────────────┘
   (1 step,
    guidance baked in)
```

---

## Why This Matters for Synapse

SD-Turbo is the `make.py` engine. Understanding what's happening inside:

1. Your text prompt is encoded by CLIP's text encoder → 77 token embeddings
2. The U-Net denoises a 64×64×4 latent (in latent space, not pixel space)
3. At every denoising step, the U-Net cross-attends to the text embeddings — that's how the prompt steers generation
4. After 1 step (SD-Turbo's entire denoising), the 64×64×4 latent is decoded by the VAE to a 512×512×3 image

The temperature implementation in Synapse works directly in the latent space — after the denoising step, before the VAE decode. The denoised latent `z_0` is well-conditioned (~[-3, 3]) and the VAE decoder is smooth, so small Gaussian perturbations produce visually varied but coherent outputs. It's manually doing what DDPM's stochastic reverse step does — adding controlled randomness at the latent level.

```
noise_std = temperature × 0.5
z_0 ← z_0 + randn_like(z_0) × noise_std
image = vae.decode(z_0 / scaling_factor)
```

This is denoising score matching intuition applied practically: we're moving slightly off the exact predicted `x_0` point, exploring the nearby region of the data manifold.
