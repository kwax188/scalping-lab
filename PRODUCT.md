# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

FX (foreign exchange) retail traders doing short-term "scalping" who practice or evaluate chart-pattern trading. They look at a live chart (in MT4, a broker platform, TradingView, etc.), take a screenshot, and want to know "how did this shape play out historically?" before or instead of acting on it.

## Product Purpose

A single-page, client-side statistical tool: the user drops a screenshot of a candlestick chart, the app reads the candles out of the image, detects known technical patterns (double bottom/top, head & shoulders, Elliott 5-wave) and shape-similarity to arbitrary historical windows, then shows what happened next in ~20 years of real 1-minute FX history (2005–2025) after similar-looking situations. It is explicitly framed as a statistics/backtesting toy, not a predictive or advisory tool — this disclaimer is load-bearing product truth, not just copy, and must survive any redesign.

## Positioning

*[Inferred — undecided/unconfirmed]* The differentiator vs. generic "pattern recognition" tools: it doesn't just label a pattern, it does raw shape-similarity search against millions of real historical bars (via z-normalized distance matching) and reports actual empirical up/down/flat outcomes with sample size and error margin, entirely client-side (screenshot never leaves the browser).

## Operating Context

Used ad-hoc, likely side-by-side with a real trading platform: paste/drop a chart screenshot while looking at a live chart, get a same-page reaction. No login, no backend, no server round-trip for the screenshot. Data (manifest.json + `data/*.bin`, ~40MB+ of 1-minute OHLC bars) auto-loads from the same static site on first visit and is cached in IndexedDB afterward, so repeat visits are instant. A `#dev` hash unlocks a separate developer/debug panel (pattern backtesting against history, no screenshot involved) — this is a builder tool, not part of the end-user surface, and should stay visually/functionally out of the main flow.

## Capabilities and Constraints

- Static site only: `index.html` + `style.css` + `js/*.js` (native ES modules) + `data/*.bin`, deployed on GitHub Pages. **No build step, no bundler — any redesign must keep working with a straight file→browser deploy.**
- All processing (image pixel-scanning, pattern search, statistics) runs client-side in the browser; nothing is uploaded anywhere.
- Six independent timeframe "slots" (1m/5m/15m/1h/4h/daily) can each hold their own screenshot and be compared side by side.
- Mobile devices get a reduced (8-year) historical dataset auto-load to avoid OOM crashes; this constraint is functional and must not be undone by a redesign.
- Currently dark-themed only, fixed palette (near-black background, gold accent, red/blue candle colors matching a specific broker's (DMM) color convention — up=red, down=blue, the reverse of the more common US convention). This DMM red/up-blue/down convention is load-bearing: the screenshot pixel-extraction logic (`js/image-extract.js`) literally detects candle color by these two hues, so it is a product constraint, not just a style choice, for the *chart-rendering* colors specifically. UI chrome colors (backgrounds, text, buttons, accents) are free to change.

## Brand Commitments

Existing footer credit: "built by アギトFX @jc2fx2 × Claude". "アギトFX" appears to be the site owner's trading/creator handle — treat as an existing, minor brand mark to preserve, not to redesign or reposition without being asked.

## Evidence on Hand

Real historical FX 1-minute price data (2005–2025, ~6.5M bars) bundled in `data/*.bin`. No testimonials, customer logos, press, or case studies exist or should be fabricated — this is a solo/personal project, and the UI must not imply institutional backing or endorsements it doesn't have.

## Product Principles

1. **Radically honest about being a stats toy, not advice.** Every redesign must keep (or strengthen) the "this is historical aggregation, not a prediction" framing at least as prominently as today.
2. **Screenshot-in, insight-out, no server.** The core interaction loop (drop image → see historical outcomes) must stay fast and frictionless; the privacy story ("everything stays in your browser") is a real, checkable claim and should stay legible in the UI.
3. **No build step, ever.** Any visual/system change must still run as plain static files with zero bundler/compile step.
4. **Power-user density is acceptable in the working area, clarity is not optional in the outcome.** This is a tool for people actively trading, not a marketing page — but the verdict/statistics readout is the single most important thing on the page and must never get harder to parse in the name of aesthetics.

## Accessibility & Inclusion

*[Undecided — not yet established.]* No explicit accessibility standard has been confirmed. Given item 4 above (verdict readability is core to the product, not decorative), color-contrast and not-color-alone signaling (the up/down/flat verdict, and any light/dark theme) should be treated as a real requirement during the redesign even without a formally cited standard.

---
*Note on how this file was produced: the project owner asked for `impeccable init` to run but then stepped away ("session about to reset, please just proceed autonomously") before an interactive interview could happen. This file was written from prior conversation history, git history, and direct code reading rather than a live interview — per Impeccable's own init flow, undecided/inferred facts are labeled inline above rather than presented as confirmed. The owner should skim this file and correct anything wrong whenever convenient; nothing here is meant to be treated as unchangeable.*
