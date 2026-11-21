# Lazy Retrospective Credit Assignment

**Saved residue today; the missing distinction found 80 ticks later.** A deterministic, no-neural-weights, no-backprop, Node.js experiment inspired by Sihti, Predictive Sihti, HEAD's unsigned relevance, and SaturdayAfterRHproof's colliding futures.

The key challenge isn't to *find a correlation* in 6,400 historical candidates. It's to **refuse to install a spurious memory when history is just noise**.

## Run

Requires Node 18+ (Node 22 recommended), nothing from npm:

```bat
node tests/delayed_cue.cjs
```

The test suite generates `results/delayed_cue.json` containing per-seed discoveries, null false alarms, held-out prediction gains, and two independent validation looks. Try one illustrative seed:

```bat
node experiment.js
```

## What is happening?

Every 100-tick episode presents the same 24×18 visible scene up to a gate at tick 90. The next frame exits up or down depending on an unseen random bit. **Neither shape nor the last frame's motion can distinguish the two futures.** A causal associative `FastHead` stores observed next-frame transitions keyed by visible shape and motion; after observing both outcomes, its remembered-future variance `B` rises at the gate. This creates a collision alarm with no access to the hidden bit or the gate's programmed location.

Separately, a 100-tick **lossless uncompressed** tape records 64 residue channels. One channel, randomly assigned by seed, carries a noisy copy of that future bit *80 ticks before the gate*. Its sign may be reversed. The other 63 channels are white noise, DC bias, AR(1) drift, phase-locked distractors, and rare bursts. In the null world **no** channel contains the true cue.

Once a repeated, familiar, high-`B` alarm fires, the miner copies the **past** tape (never the current or future tick). On the *next* observation it extracts a scalar outcome by projecting prediction surprise onto an axis estimated from the first real surprising successor. There are **no labels in the miner API**; hidden truth is available only through `world.auditTruth()` to the separate test harness.

The miner searches all 64×100 `(channel,lag)` pairs using base-rate-standardized, sign-invariant unsigned contingency. Each time it attempts discovery, it uses an **earlier set of episodes for selection** and an **independent later set for permutation-based validation**. Four candidate channels, at most, go through Bonferroni-adjusted tests. The episode permutations preserve the phase alignment of the distractors. The two testing looks and total 0.05 budget are fixed *before* observing the twenty held-out test seeds.

| Look | Discovery episodes | Validation episodes | Family-wise budget under assumptions |
|---|---:|---:|---:|
| 1 | 1–20 | 21–32 | 0.02 |
| 2, only if still WAIT | 1–32 | 33–48 | 0.03 |

If both fail, the miner outputs `WAIT` and installs nothing. The naïve top-correlation baseline always guesses a channel and lag. When a candidate passes, the miner installs a working delay latch for **that one channel only**, estimates conditional successor frames from earlier observed transitions, freezes writes, and tests 20 later episodes it has never trained or selected on. Failure to pass is itself an outcome, not an exception.

## Final, deterministic results

20 independently seeded held-out trials per condition (seeds `2001..2020`), 999 validation permutations per candidate. Results shown are from the exact code in this repository; rerun to regenerate.

| Condition | Exactly identified `(channel, lag)` | Spurious latch | Mean reduction in gate ambiguity error, frozen future episodes |
|---|---:|---:|---:|
| No cue / null | N/A | **2 of 20** | **−1.6%** |
| True sparse cue (σ=0.2) | **20 of 20** | 0 | **100.0%** |
| True noisy cue (σ=0.7) | **20 of 20** | 0 | **70.9%** |
| Polarity-reversed sparse cue | **20 of 20** | 0 | **100.0%** |

In the null world, the naïve top-correlation baseline makes 20 guesses out of 20 and has no principled mechanism to say `WAIT`. Our guarded miner still falsely installs **2** latches, which is an important failure to retain in the report. A false latch can make its *predicted conditional B* smaller while making held-out MSE worse: **internal certainty is not evidence of correctness**.

Ordinary improvement vs. hold-last can look much better than the hidden-state result because predictable shared motion is already explained by shape alone. Therefore the benchmark separately reports **ambiguous-part improvement** `1 - postLatchMSE/preLatchMSE`, the change relative to the frozen, same-data associative predictor that lacks the historical latch. It also reports hold-last baseline MSE and raw empirical `B`.

## Design / safety boundaries

- **This is a minimal stand-alone experiment, not an integration into the full 48×36 V2.2.1 browser engine.** `FastHead` is a compact whole-frame associative observer that supplies a real uncertainty witness. The synthetic 64-channel residue tape stands in for Sihti's stored spatial residues. Future work must replace these with the real multiscale decomposition and show performance on genuinely unknown streams.
- **No backprop; no neural parameters; no future leakage.** The miner sees `frame`, `residues`, a causal `B` alarm, and the *later* actual prediction error. The source-world secret `(h, trueChannel, lag)` is never passed to it.
- **Not Model-X knockoffs or Multi-Knockoff+.** Episode-shuffled outcomes are negative-control permutations, not exchangeable synthetic replacement features. FDR guarantees from Gimenez & Zou (2019) do not transfer. The disjoint validation / alpha-spending scheme has its own exchangeability assumptions. It is **not** a universal 5% guarantee for dependent physical streams.
- **Not causal identification of the physical source.** A detectable cue can merely predict an external hidden cause. Observationally correlated variables cannot necessarily be distinguished without interventions.
- **Not compressed storage.** Retaining every sample in an uncompressed tape costs at least what that raw channel stream costs. This test archives exactly 100×64 float32 samples per alarm; no claim of 10× or 100× reduction is made.
- **Noisy cue has a statistical ceiling.** When the only cue is `h+N(0,0.7²)`, explained hidden-sign variance is only around 77.5% even for an ideal Bayesian decoder. The reported 70.9% ambiguity reduction is not an underperforming 80% guarantee.
- **Hidden outcome axis is learned from prediction errors** in this constructed setting. More complex real-world outcomes will require validation that those errors encode a stable, meaningful future split.

## Files

- `delayed_world.js`: observable 24×18 stream, private oracle truth and 64 distractor channels
- `fast_head.js`: causal observed `(shape,motion) → next frame` memory and future-variance `B`
- `retrospective.js`: 100-tick ring, Welford base rates, unsigned 6,400-feature scan, disjoint episode permutation validation, selective latch
- `experiment.js`: frozen holdout evaluation; test truth isolated here
- `tests/delayed_cue.cjs`: 11 kill checks, 20 seeds × four regimes, independent 60-tick lag test, future-intervention causality check
- `results/delayed_cue.json`: raw numerical receipt, per-seed choices, wait/promote stages, and pre/post prediction scores

## Research lineage

The *idea* of testing history suffixes before committing a split predates this repo (McCallum's U-Tree; Shalizi & Klinkner's CSSR). Base-rate contingency draws inspiration from Jeong et al.'s ANCCR; this is not a reproduction of their circuit model. Permutation validation is closer to a sample-split Westfall–Young style maximum/correction philosophy than to formal knockoff construction.

- [McCallum (1996), U-Tree history splitting](https://cdn.aaai.org/Symposia/Fall/1996/FS-96-02/FS96-02-018.pdf)
- [Gimenez & Zou (2019), actual simultaneous multiple model-X knockoffs](https://proceedings.mlr.press/v89/gimenez19b.html)
- [Candès et al., Model-X exchangeability](https://web.stanford.edu/group/candes/knockoffs/outline.html)
- [Westfall–Young maxT / permutation testing background](https://pmc.ncbi.nlm.nih.gov/articles/PMC3873102/)
- [Sihti](https://github.com/anttiluode/Sihti) · [PredictiveSihtiV2](https://github.com/anttiluode/PredictiveSihtiV2) · [HEAD](https://github.com/anttiluode/HEAD) · [SaturdayAfterRHproof](https://github.com/anttiluode/SaturdayAfterRHproof)

**Next kill:** replace the mock residue channels with genuinely archived Sihti bands on changing real video; compare against simple delayed-feature baselines and test regime shifts before claiming a useful physical precursor finder.


## Real webcam / video evidence — Saved Residue Live Lens

Open [`webcam.html`](webcam.html) through the included `run_webcam.bat` / `webcam_server.cjs` local launcher. It runs the actual Predictive Sihti V2.2.1 spatial engine against real webcam or local video, saves signed Sihti residual bands to a 512-frame in-memory tape, computes causal temporal octave summaries, and displays B, forecast error, and retrospective candidates. The browser's **Export audit JSON** produces numerical evidence for analysis; it contains no reconstructable images unless explicitly opted in. See [README_WEBCAM.md](README_WEBCAM.md) for instructions, tests, limitations, and the difference between observational associations and validated latches.
