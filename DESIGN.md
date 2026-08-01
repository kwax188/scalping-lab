---
name: FX相場予測サイト (Scalping Lab)
description: A calm, research-note reading of chart-pattern statistics — not a trading-terminal HUD.
colors:
  warm-paper: "#FAF9F5"
  paper-alt: "#F3F1EA"
  panel: "#FFFFFF"
  panel-alt: "#F3F1EA"
  line: "#E5DFD1"
  ink: "#1A1A18"
  ink-muted: "#6B6A61"
  ink-faint: "#9B9A8F"
  terracotta: "#C1602F"
  terracotta-soft: "rgba(193,96,47,.10)"
  terracotta-text: "#9A4620"
  button-ink: "#FFFFFF"
  verdict-up: "#3F7D52"
  verdict-up-soft: "rgba(63,125,82,.09)"
  verdict-down: "#B23B3B"
  verdict-down-soft: "rgba(178,59,59,.08)"
  info-blue: "#3D6FA6"
typography:
  display:
    fontFamily: "Hiragino Mincho ProN, YuMincho, Yu Mincho, serif"
    fontSize: "clamp(24px, 4.8vw, 34px)"
    fontWeight: 700
    lineHeight: "normal"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Hiragino Kaku Gothic ProN, Hiragino Sans, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 800
    lineHeight: "normal"
    letterSpacing: "0.01em"
  body:
    fontFamily: "Hiragino Kaku Gothic ProN, Hiragino Sans, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "Hiragino Kaku Gothic ProN, Hiragino Sans, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.6
  numeric:
    fontFamily: "SF Mono, Consolas, Menlo, Roboto Mono, monospace"
    fontSize: "clamp(16px, 4vw, 22px)"
    fontWeight: 800
    lineHeight: "normal"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.terracotta-text}"
    textColor: "{colors.button-ink}"
    rounded: "{rounded.sm}"
    padding: "13px"
  button-secondary:
    backgroundColor: "{colors.info-blue}"
    textColor: "{colors.button-ink}"
    rounded: "{rounded.sm}"
    padding: "13px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    padding: "13px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
    padding: "22px"
  frame:
    backgroundColor: "{colors.panel-alt}"
    rounded: "{rounded.md}"
    padding: "14px"
  select-input:
    backgroundColor: "{colors.panel-alt}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 10px"
---

# Design System: FX相場予測サイト (Scalping Lab)

## Overview

**Creative North Star: "The Calm Research Note"**

This is a statistics toy that reads like a research note, not a trading-terminal HUD — that's the thesis the build carries out. A single warm neutral (cream paper in light mode, warm ink in dark mode) holds the page; one terracotta accent is spent only on action and emphasis; every other hue (green/red for up/down, blue for secondary actions) is semantic, never decorative. The system explicitly refuses this category's default: no neon-glass panels, no dashboard chrome, no box-shadow anywhere. Depth comes from nesting flat background tones (panel → panel-alt → bg-alt → bg) behind hairline borders, the same device a printed research note would use for a table, not a HUD would use for a widget.

The build is a translation, not a literal copy, of anthropic.com's voice: the direction contract pins anthropic.com as canon, but the site is Japanese-first and ships with zero build step (a hard product constraint — plain files straight to a static host), so the custom "Anthropic Serif"/"Anthropic Sans" webfonts — which don't cover Japanese glyphs and aren't licensed for reuse here — are stood in for by a system Japanese font stack, with a real Japanese serif reserved for the one display headline. This is a deliberate, cited adaptation of the pinned world, not drift from it.

The single most important thing on the page is the verdict readout (up/down/flat percentages after a similar historical pattern) — per product principle, this must never get harder to read in the name of aesthetics. Every other visual decision in this system is subordinate to that one.

**Key Characteristics:**
- One accent (terracotta) for action and emphasis; everything else is neutral or semantic
- Flat, bordered, tonally-layered — no shadows, no elevation, no glass
- Soft radii throughout (8–16px); nothing sharp, nothing pill-shaped except the theme toggle
- Monospace is reserved exclusively for real numbers; never for labels or headings
- Light and dark are both first-class, built as a mirrored token pair, not a dark-mode afterthought

## Colors

A warm, low-saturation neutral base (cream-on-ink or ink-on-cream) carries almost the entire page; terracotta is the only color that means "this is interactive or important," and green/red/blue are reserved for statistical meaning, never used as ambient decoration.

### Primary
- **Terracotta** (`#C1602F` light / `#E08556` dark): the single brand accent — theme-toggle hover, headline emphasis span, active-frame border, drop-zone hover state, focus rings, gallery rank/arrow accents.
- **Terracotta Text** (`#9A4620` light / same as Terracotta in dark, `var(--accent)`): the accessible variant of the accent, used specifically where the color sits on text or as a button background. Light mode's raw terracotta only clears ~3:1 contrast (fine for borders/large elements) but fails 4.5:1 for body-sized text, so this darker split-off exists purely to carry small text and button labels legibly. In dark mode the raw accent already clears 4.5:1, so this token just aliases back to it.
- **Terracotta Soft** (`rgba(193,96,47,.10)` light / `rgba(224,133,86,.14)` dark): tint-only background, never text — drop-zone active state, autoload progress fill's implied glow.

### Secondary
- **Info Blue** (`#3D6FA6` light / `#7FA8D6` dark): the one secondary action color — the hand-drawn search button, dev-panel heading/border, ghost-path plot line. Marks "a second kind of action," distinct from the primary terracotta CTA.

### Neutral
- **Warm Paper** (`#FAF9F5` light / `#1B1A16` dark): page background.
- **Paper Alt** (`#F3F1EA` light / `#221F19` dark): secondary page-level background band.
- **Panel** (`#FFFFFF` light / `#211F19` dark): card and top-level container surface.
- **Panel Alt** (`#F3F1EA` light / `#28251E` dark): nested/recessed surface — frames, control chips, verdict boxes sitting inside a card.
- **Line** (`#E5DFD1` light / `#3A362B` dark): the only border color in the system; also the resting drop-zone dashed stroke.
- **Ink** (`#1A1A18` light / `#F3F1EA` dark): primary text.
- **Ink Muted** (`#6B6A61` light / `#A6A395` dark): secondary text — leads, hints, captions, disabled-adjacent copy.
- **Ink Faint** (`#9B9A8F` light / `#726F62` dark): tertiary — inactive gallery dots.

### Semantic (verdict-only, not decorative)
- **Verdict Up** (`#3F7D52` light / `#6FBE8D` dark) with **Verdict Up Soft** tint: statistical "up" meaning only — verdict numbers, up-direction pattern alerts.
- **Verdict Down** (`#B23B3B` light / `#E17272` dark) with **Verdict Down Soft** tint: statistical "down" meaning only — verdict numbers, down-direction pattern alerts.

### Fixed Exception — Candle Chart Colors (non-token, do not touch)
The candlestick canvases hardcode `#EA3943` (red = up) and `#3B82F6` (blue = down) directly in `js/render.js`, independent of the theme system above and never themed. This is the DMM-broker color convention the product is built around, and it is load-bearing: `js/image-extract.js` detects candle color by these exact two hues when reading a pasted screenshot. **This is a fixed product constraint, not a design-system color** — it must never be pulled into the token palette, aliased to `--red`/`--blue`, or swapped for a theme-aware value.

### Named Rules
**The Split-Accent Rule.** Never use `--accent` where it functions as text or a button background — use `--accent-text` (and pair button backgrounds with `--btn-text`) instead. `--accent` alone is for borders, large glyphs, and other ≥3:1-sufficient uses only.

**The Verdict-Color Rule.** Green and red exist in this system to mean "statistically up" and "statistically down," full stop. They do not appear as generic UI accent, success/error chrome, or decoration — if a green or red is on screen, it is reporting a market direction.

## Typography

**Display Font:** Hiragino Mincho ProN (with YuMincho, Yu Mincho, serif fallback) — reserved for the single `<h1>`.
**Body Font:** Hiragino Kaku Gothic ProN (with Hiragino Sans, Noto Sans JP, Yu Gothic, system-ui, sans-serif fallback) — everything else: headings, labels, body copy, buttons, UI chrome.
**Label/Mono Font:** SF Mono (with Consolas, Menlo, Roboto Mono, monospace fallback) — real numbers only.

**Character:** A single serif headline against an otherwise all-sans interface reads as "one editorial gesture, then get to work" — the sans body keeps everything else calm and functional, and the mono face marks out exactly the numbers a trader came to check.

Both font stacks are system fonts, not self-hosted webfonts — a deliberate adaptation of the anthropic.com direction (see Overview), not an unresolved gap. No custom webfont should be introduced without re-solving the same two constraints (Japanese glyph coverage, zero-build-step deployment) that produced this choice.

### Hierarchy
- **Display** (700, `clamp(24px, 4.8vw, 34px)`, normal line-height, -0.01em tracking): the page `<h1>` only. The accent-colored `<span>` inside it is the one place terracotta sits directly on a headline.
- **Title** (800, 14.5–15px, 0.01em tracking): card headings (`.card h2`) and frame titles (`.f-title`) — the section-and-slot scaffolding of the page.
- **Body** (400, 11.5–13.5px, line-height 1.8): lead paragraph, hint text, notes, footer disclaimer. Generous 1.8 line-height keeps dense Japanese copy legible at small sizes.
- **Label** (600, 10.5–12px): field labels, badges, gallery meta captions — the smallest tier, used for structural/utility text, not for content.
- **Numeric** (800, `clamp(16px, 4vw, 22px)`, mono): the verdict percentages — up/down/flat — and any other real statistic (sample size, error margin, dates, ranks). This is the single highest-emphasis text role in the system by design, since the verdict is the product.

### Named Rules
**The Numbers-Only Mono Rule.** `--mono` is reserved for real numeric/data output — verdict percentages, sample counts, dates, gallery ranks. It never appears on a label, heading, or button; using mono is itself a signal that what's on screen is a real, checkable number.

## Layout

A single centered column, `max-width: 960px`, generous outer padding (32px top / 18px sides / 64px bottom) — no dashboard grid, no sidebar, no multi-column widget layout. The page reads top-to-bottom as numbered sections (①②③) the way a research note would present its methodology in order, not as a control panel of simultaneous widgets.

Rhythm is card-based: each `.card` carries 22px internal padding and a 16px gap to the next card; content nested inside a card (frames, controls, alerts) steps down to a tighter ~10–14px rhythm. The six timeframe "frames" stack vertically inside `#framesWrap` with 14px between them — deliberately a single column rather than a grid, keeping the reading order linear even though the underlying feature (compare six timeframes) is inherently parallel.

One responsive break at `max-width: 420px`: the three-stat verdict grid and the two-button action row both collapse from multi-column to single-column, and card padding tightens from 22px to 16px, to keep small phone screens from feeling cramped.

## Elevation & Depth

Flat, with tonal layering standing in for elevation. There is no `box-shadow` anywhere in the stylesheet. Depth is conveyed entirely by nesting progressively distinct flat background tones — page background → card panel → nested panel-alt surface — separated by 1px hairline borders (`--line`), never by a shadow or lift.

### Named Rules
**The Flat-By-Default Rule.** Surfaces never cast a shadow. If a surface needs to read as "above" or "inside" another, that's expressed by a background-tone step and a hairline border, not by elevation.

## Shapes

Soft, consistent radii and hairline borders throughout — nothing sharp, nothing heavily rounded. Three-step radius scale: 8px for small interactive controls (buttons, selects, chips, badges), 12px for mid-level containers (frames, drop zones, verdict/alert boxes), 16px for top-level cards. The one deliberate exception is the theme-toggle button, which is a full pill (`border-radius: 999px`) — the single fully-rounded shape in the system, reserved for that one persistent chrome control.

Borders are always 1px solid `--line`, except drop zones, which use a 1.5px **dashed** `--line` stroke specifically to signal "droppable," switching to solid terracotta on hover/active.

## Components

### Buttons
- **Shape:** 8px radius (`{rounded.sm}`), uniform 13px padding, block-width by default.
- **Primary:** background `--accent-text`, text `--btn-text` — the accessible split-accent pairing, not raw `--accent`.
- **Secondary (`.btn.blue`):** background `--blue`, text `--btn-text` — used for the one non-primary CTA class (hand-drawn search, dev-panel actions).
- **Ghost (`.btn.ghostbtn`):** transparent background, `--sub` text, 1px `--line` border; hover darkens border and text.
- **Hover / Focus:** primary and secondary buttons drop to `opacity: .9` on hover (no color shift); disabled state drops to `opacity: .35` with `cursor: not-allowed`. Keyboard focus everywhere gets a 2px `--accent-text` outline with 2px offset — deliberately suppressed on mouse click via `:focus-visible`.

### Cards / Containers
- **Corner Style:** 16px (top-level `.card`), 12px (nested `.frame`, drop zones, verdict/alert boxes).
- **Background:** `--panel` for top-level cards; `--panel-alt` for anything nested one level inside a card.
- **Shadow Strategy:** none — see Elevation & Depth.
- **Border:** 1px solid `--line` on every container tier.
- **Internal Padding:** 22px (card), 14px (frame), 12–14px (alert/verdict).

### Inputs / Fields
- **Style:** `--panel-alt` background, 1px `--line` border, 8px radius, sans body font.
- **Focus:** border shifts to `--accent` (no glow, no outline change beyond the shared focus-visible ring).
- **Drop zone (file input):** dashed 1.5px `--line` border at rest; solid `--accent` border plus `--accent-soft` background fill on drag-over/hover.

### Navigation
There is no persistent nav bar; the only piece of always-visible chrome is the theme toggle, a pill-shaped button pinned top-right of the header (`--panel` background, `--line` border, sun/moon glyph + text label, border turns `--accent` on hover).

### Frame (signature component)
The six-slot timeframe comparator (`js/render.js`'s `frameMarkup`) is the app's one distinctive custom component: a `--panel-alt` container with a title/badge/clear-button head row, a mini drop zone, a candle canvas, a verdict box, and a collapsible historical-match gallery — repeated per timeframe (1m/5m/15m/1h/4h/daily). Its only state-driven visual change is the container border switching to `--accent` when the frame is the active drop target (`.frame.active`).

### Verdict Readout (signature component)
The up/down/flat statistics block is the product's single most important element. It pairs a `--sub`-colored context line (`.v-head`) with a large mono numeric line (`.v-main`/`.v-value`, 16–22px, weight 800) coloring each figure by its own semantic verdict color (green/red/muted-flat), followed by a small `--sub` methodology caveat (`.v-sub`). Nothing else on the page uses this size/weight/mono combination — that combination is reserved for this readout alone.

### Alert (pattern-detection card)
Signals a detected chart pattern via a soft background tint (`--green-soft`/`--red-soft`) plus a small colored `dir-dot` inline before the pattern name — not a colored side border. (A left-border "side-tab" treatment was tried and rejected during finish review as a banned device for this world; the tint + dot pairing is the confirmed replacement.)

### Gallery (historical-match carousel)
A vertically snap-scrolling list of similar historical chart windows, each a `--panel` card with mono meta row (rank, date, similarity score), a candle canvas, and side dot/arrow navigation. Dots use `--sub2` at rest, scale up and switch to `--accent` when active.

## Do's and Don'ts

### Do:
- **Do** pair any accent-on-text or accent-as-button-background use with `--accent-text`/`--btn-text`, never raw `--accent` (The Split-Accent Rule).
- **Do** keep `--mono` exclusive to real numeric output — verdict percentages, sample sizes, dates, ranks (The Numbers-Only Mono Rule).
- **Do** signal a detected pattern's direction with a soft tint + small dot, matching the current `.alert`/`.alert.up`/`.alert.down` treatment.
- **Do** keep the six-frame comparator single-column and vertically stacked rather than a grid — the linear "research note" reading order is deliberate.
- **Do** treat `#EA3943`/`#3B82F6` candle colors in `js/render.js` as fixed and non-thematic (see Colors → Fixed Exception).

### Don't:
- **Don't** add `box-shadow` or any lifted/glassy surface treatment anywhere — depth is tonal layering only (The Flat-By-Default Rule).
- **Don't** put a colored left-border "side-tab" on an alert or card to signal state — that device was tried and explicitly rejected in finish review.
- **Don't** add an eyebrow/kicker line above a heading — removed as a banned device for this world; headings stand alone.
- **Don't** alias the candle chart's `#EA3943`/`#3B82F6` to the theme's `--red`/`--blue` tokens, or make them theme-aware — `js/image-extract.js` depends on these exact literal hues to read screenshots.
- **Don't** treat the current emoji glyphs (📂🗑✏️🔍📌🔧🌙☀️, etc.) as this system's icon language for new components — see the sidecar's note; it is a carried defect from this build, not a confirmed system rule.
