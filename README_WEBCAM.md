# Saved Residue — Live Webcam Lens

**Real webcam/video into Predictive Sihti V2.2.1, a full signed spatial-residue tape, causal temporal octaves, and cautious retrospective candidate testing.**

This is the **real-signal bridge** for [LazyRetrospectiveCreditAssignment](https://github.com/anttiluode/LazyRetrospectiveCreditAssignment). The original synthetic delayed-cue project and its tests remain unchanged. No pretrained weights, gradient descent, npm packages, or internet request.

## Run on Windows 10/11 with Edge or Chrome

Download the repository as ZIP, extract, and double-click `run_webcam.bat`. It runs a **localhost-only** Node server with a random free port, automatically opens Edge/default browser, and leaves a CMD window for Ctrl+C. Click **Start webcam** and approve camera permission.

Alternatively:

```bat
node webcam_server.cjs
```

Copy the displayed `http://127.0.0.1:PORT/webcam.html` into your browser. Camera permissions often fail from `file://` but work on localhost (secure context). **Open local video** uses an entirely local video file; **Synthetic demo** is just a sanity preview, not genuine sensor evidence.

## What is real

- Actual V2.2.1 `Predictor` runs on the incoming camera stream downsampled to grayscale `48×36` at ~3.3 observations/sec (slower if CPU is busy). It stores completed spatial patch transitions and scores previous predictions **before learning**.
- Every observation is decomposed into `C + R_middle + R_fast` using the original exact Sihti operators. A rolling in-memory **512-frame full-resolution-in-model** tape preserves all three signed bands and temporal prediction surprise. The grayscale frame can be reconstructed from the three bands to ~float32 precision. This is **not** compressed to zero.
- **B** (remembered-future disagreement) and **surprise** (observed minus predicted) are distinct. The amber map is contrast-stretched, so **use the raw `B` readout** to judge magnitude.
- Octave features are computed from 96 coarse spatial signals (24 tiles × core level, middle energy, fast energy, fast polarity), across eight causal exponential traces with τ `1,2,4,8,16,32,64,128` **observations**. These are **not** the lossless archive; they only index it.
- An automatic event occurs when a patch is familiar and has strong B, **without looking at the successor**. Or click **Mark next event** to deliberately collect comparable events. The outcome is measured from the **next observation's prediction error**, not supplied as a label.
- After at least 16 events, the retrospective probe picks five candidate channel/octave features in chronological discovery data, tests their signed association on the later disjoint portion, and reports episode-permutation p-values with a five-test Bonferroni correction. **Statistically associated is not necessarily causal.** Permutations are not Model-X knockoffs and cannot guarantee calibration under nonexchangeable or drifting streams.
- Unlike the previous synthetic miner, the live lens does **not install any latch**. This is deliberate: there is not yet a prospective probationary prediction improvement or intervention to justify a permanent promoted memory.

## A useful real-signal trial

1. Point the camera at a stationary room, or play a short local video. Observe for about 30–60 seconds while the atlas starts learning. Move a hand or object across the screen repeatedly. Let one object occasionally enter from outside the camera view.
2. Use **Write memories** to freeze the learned atlas. Compare prediction MSE and error reduction against hold-last under the same camera motion. Negative numbers are legitimate failures.
3. Let it observe a repetitive pattern (pendulum, fan, hands approaching and departing). Watch the **B** map and raw B value. An unknown object may yield *low familiarity*, not high B—that is a different diagnostic.
4. For a controlled delayed-cue trial, create multiple repeated real episodes (e.g. display a card, wait a variable interval, then move an object upward or downward). Use **Mark next event** at the shared decision moment, not after seeing the future. A single real stream is not automatically evidence of delayed causality; the full synthetic 20-seed tests are still the rigorous control.
5. Click **Export audit JSON**. Share it for analysis. By default it contains camera-derived **numerical metrics and coarse tile traces**, **not reconstructable 48×36 frames**. Check **Include 60 reconstructable frames (private)** only if you explicitly want to include visual information.

## Audit JSON

`format=sihti-webcam-v1`; includes per-frame next-frame MSE, hold-last MSE, gain, raw B, familiarity, prototype count, writes, timing, reconstruction error, event times/outcomes, ranked retrospective candidates, and 96-value coarse tile histories. Full original-resolution-in-model frames are **not present by default**. Export and upload JSON if you want an analysis of your own webcam experiment.

## Local deterministic checks

```bat
node tests/webcam_core.cjs
node tests/delayed_cue.cjs
```

The new tests check exact spatial reconstruction, preservation and capacity of the signed tape, causal octave snapshots, jitter tolerance versus exact-lag sampling, real V2.2.1 head integration, and held-out retrospective candidate validation. **They are not camera data**, so the local Edge run is required for empirical performance claims about real-world video.

## Limitations and next research question

At this resolution, prediction can be poor for fast objects and scene cuts. Temporal octaves discard fine time information by themselves; the raw tape keeps it for later reconstruction. The uncertainty B can collapse for irrelevant address features, so it must not stand in for held-out surprise improvement. Camera data is temporally dependent; the lightweight permutation probe is a visual diagnostic, **not formal control of its false discovery rate**. A proposed future latch needs independent prospective probation and ideally an intervention before promotion.
