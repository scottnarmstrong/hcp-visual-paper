// Small SVG/controls toolkit shared by the toy-run figures: a responsive
// <svg> with viewBox, an arrow marker, a coordinate fitter, sub/superscript
// text (paper notation as SVG text -- content/figures/*.yaml: "Labels ...
// rendered with KaTeX where the contract supports it, otherwise as SVG
// text" -- no KaTeX-in-SVG contract exists yet, so this is the fallback),
// and keyboard-accessible HTML controls (range/select/buttons/toggle) that
// sit alongside the SVG inside the same mounted element.
//
// Colours are ALWAYS one of the nine CSS custom properties
// scripts/lib/figureSnapshot.mjs's THEME_COLORS substitutes for the
// headless audit snapshot (var(--surface), --surface-2, --border, --text,
// --text-dim, --text-faint, --accent, --accent-strong, --accent-2) --
// never a literal hex, and never a token outside that list (it would be
// left as a raw `var(...)` in the rasterized PNG). Role convention used
// across these figures: --accent = "theorem colour", --accent-2 = "grid A"
// (old grid / primary series), --accent-strong = "grid B" (new grid /
// contrasting series), --text-faint / --border = neutral.

import { el, svgEl, htmlEl } from './dom.mjs';

export const COLOR = {
  theorem: 'var(--accent)',
  gridA: 'var(--accent-2)',
  gridB: 'var(--accent-strong)',
  text: 'var(--text)',
  textDim: 'var(--text-dim)',
  neutral: 'var(--text-faint)',
  border: 'var(--border)',
  surface: 'var(--surface)',
  surface2: 'var(--surface-2)',
};

// The concrete hex a COLOR.* role resolves to per theme -- kept in sync by
// eye with scripts/lib/figureSnapshot.mjs's THEME_COLORS (a handful of
// tokens, reviewed together with any palette change, exactly like that
// module's own copy). Used only by `tint()` below.
const ROLE_HEX = {
  light: {
    theorem: '#a6501c', gridA: '#2c6e68', gridB: '#7f3a13', text: '#141c24', textDim: '#4d5c68', neutral: '#8496a3', border: '#c6d0d8', surface: '#ffffff', surface2: '#e3e9ee',
  },
  dark: {
    theorem: '#e69158', gridA: '#6cbdb5', gridB: '#f2ac7c', text: '#e8eef2', textDim: '#aebac3', neutral: '#74838d', border: '#313e46', surface: '#171f24', surface2: '#1e282e',
  },
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/**
 * An actual translucent colour: `rgba(r,g,b,alpha)` for the given
 * COLOR.* role name, resolved against `theme` ('light'/'dark', matching
 * `render(el, {theme})`'s own parameter).
 *
 * A plain `var(--token)` is theme-reactive for free in a real browser, but
 * this project's audit-snapshot rasterizer -- ImageMagick's `convert`
 * falling back to its bundled minimal SVG reader, since no `rsvg-convert`
 * binary is installed on this machine, only the shared library -- ignores
 * `fill-opacity`/`opacity` entirely (confirmed empirically: a rect with
 * `fill-opacity="0.22"` rasterizes fully opaque). Any figure content whose
 * MEANING depends on translucency -- a sequential ramp by scale, a heat
 * map, a highlighted band that must not obscure what is under it -- bakes
 * the alpha into the colour with this function instead. Merely decorative
 * opacity (a faint gridline, a hover highlight applied straight to an
 * attribute in JS) can stay a plain `opacity` attribute: rendering a touch
 * bolder than intended in the static snapshot is a minor cosmetic
 * mismatch, not a lost or misrepresented signal.
 *
 * Frozen at draw time: unlike a `var()` colour, it will NOT itself react
 * to a later theme toggle without a re-render (this codebase's
 * `render()`s already redraw from scratch on every slider change, so this
 * only matters between a theme toggle and the next interaction).
 */
export function tint(role, alpha, theme = 'light') {
  const hex = (ROLE_HEX[theme] || ROLE_HEX.light)[role] || ROLE_HEX.light.text;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** A responsive `<svg viewBox="...">` sized by its content, not a fixed
 * pixel box (so it stays legible at 400px width). */
export function makeSvg([x, y, w, h], { ariaLabel = '', className = '' } = {}) {
  return svgEl('svg', {
    viewBox: `${x} ${y} ${w} ${h}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': ariaLabel,
    class: className || null,
    style: 'width:100%;height:auto;display:block;',
  });
}

let markerSeq = 0;
/** Append an arrowhead `<marker>` to `svg`'s `<defs>` and return the
 * `url(#id)` to use as `marker-end`. */
export function arrowMarker(svg, color = COLOR.text, size = 6) {
  let defs = svg.querySelector('defs');
  if (!defs) { defs = svgEl('defs'); svg.insertBefore(defs, svg.firstChild); }
  markerSeq += 1;
  const id = `fig-arrow-${markerSeq}`;
  defs.appendChild(svgEl('marker', {
    id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: size, markerHeight: size, orient: 'auto-start-reverse',
  }, [svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: color })]));
  return `url(#${id})`;
}

let hatchSeq = 0;
/** Append a diagonal-hatch `<pattern>` to `svg`'s `<defs>` (the "REMAINDER
 * squares in the neutral colour, hatched" convention several figure
 * briefs ask for) and return the `url(#id)` fill reference. */
export function hatchPattern(svg, color = COLOR.neutral, { size = 6, opacity = 0.55 } = {}) {
  let defs = svg.querySelector('defs');
  if (!defs) { defs = svgEl('defs'); svg.insertBefore(defs, svg.firstChild); }
  hatchSeq += 1;
  const id = `fig-hatch-${hatchSeq}`;
  defs.appendChild(svgEl('pattern', {
    id, width: size, height: size, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
  }, [
    svgEl('rect', { width: size, height: size, fill: 'none' }),
    svgEl('line', {
      x1: 0, y1: 0, x2: 0, y2: size, stroke: color, 'stroke-width': Math.max(size * 0.28, 1), opacity,
    }),
  ]));
  return `url(#${id})`;
}

/** Map a math-space bounding box into a pixel viewport, preserving aspect
 * ratio and flipping the y axis (SVG y grows downward). Returns
 * `{ toPx([x,y]) -> [px,py], scale }`. */
export function fitTransform(bbox, viewport, { pad = 12 } = {}) {
  const bw = (bbox.xMax - bbox.xMin) || 1;
  const bh = (bbox.yMax - bbox.yMin) || 1;
  const w = viewport.w - 2 * pad;
  const h = viewport.h - 2 * pad;
  const scale = Math.max(Math.min(w / bw, h / bh), 1e-9);
  const cx = (bbox.xMin + bbox.xMax) / 2;
  const cy = (bbox.yMin + bbox.yMax) / 2;
  const ox = viewport.x0 + viewport.w / 2;
  const oy = viewport.y0 + viewport.h / 2;
  return {
    scale,
    toPx: ([x, y]) => [ox + (x - cx) * scale, oy - (y - cy) * scale],
  };
}

/** Text built from `spans` of `{ t, sub, sup, italic, bold }` (sub/super
 * via a shifted baseline, plain SVG text otherwise -- the fallback
 * content/figures/*.yaml design briefs allow where no KaTeX-in-SVG
 * contract exists).
 *
 * Every span becomes its own SEPARATE `<text>` element (never a `<tspan>`
 * of one shared `<text>`), and `x`/`y`/anchoring are computed and applied
 * HERE rather than left to the SVG engine's `text-anchor`. Both departures
 * are forced by this project's audit-snapshot rasterizer: no
 * `rsvg-convert` binary is installed on this machine (only the shared
 * library), so ImageMagick's `convert` falls back to its bundled minimal
 * SVG reader, which (confirmed empirically) collapses every `<tspan>`
 * after the first onto the parent `<text>`'s own origin, AND ignores
 * `text-anchor` entirely (always renders as if `start`). Every text in
 * these figures therefore anchors itself manually, from estimated glyph
 * widths (no headless font-metrics API, so centering/right-anchoring is
 * approximate, not pixel-exact) -- consistent, if imprecise, in both this
 * rasterizer and a real browser (which would otherwise double-shift if
 * `text-anchor` were also left set to something other than `start`). */
function charWidth(ch, size) {
  if (ch === ' ') return size * 0.28;
  if (/[iIl.,;:'|!]/.test(ch)) return size * 0.3;
  if (/[mMW]/.test(ch)) return size * 0.82;
  if (/[0-9]/.test(ch)) return size * 0.56;
  return size * 0.54;
}
function estWidth(str, size) {
  return [...String(str)].reduce((w, ch) => w + charWidth(ch, size), 0);
}

export function richText(x, y, spans, opts = {}) {
  const size = opts.size || 12;
  const fontFamily = opts.mono ? 'var(--font-mono)' : null;
  const fill = opts.fill || COLOR.text;
  const list = typeof spans === 'string' ? [{ t: spans }] : spans;

  const widths = list.map((s) => estWidth(s.t, s.sub || s.sup ? size * 0.72 : size));
  const total = widths.reduce((a, b) => a + b, 0);
  const anchor = opts.anchor || 'start';
  const startX = anchor === 'middle' ? x - total / 2 : anchor === 'end' ? x - total : x;

  const nodes = [];
  let cursor = startX;
  list.forEach((s, i) => {
    const small = size * 0.72;
    const ty = s.sub ? y + size * 0.28 : s.sup ? y - size * 0.32 : y;
    nodes.push(svgEl('text', {
      x: cursor,
      y: ty,
      'font-size': s.sub || s.sup ? small : size,
      fill,
      'font-family': fontFamily,
      'font-style': s.italic ? 'italic' : null,
      'font-weight': s.bold ? 700 : null,
    }, [s.t]));
    cursor += widths[i] + size * 0.05; // small breathing room, esp. around sub/sup transitions
  });
  if (nodes.length === 1) return nodes[0];
  const g = svgEl('g');
  nodes.forEach((n) => g.appendChild(n));
  return g;
}

/** True inside `scripts/lib/figureSnapshot.mjs`'s headless jsdom render
 * (its default `navigator.userAgent` names jsdom), false in a real
 * browser. */
export function isSnapshotMode() {
  try {
    // scripts/lib/figureSnapshot.mjs sets `globalThis.window` to a jsdom
    // Window (not the bare global `navigator`, which on a modern Node.js
    // is its OWN built-in with no "jsdom" in its user agent) -- so this
    // reads the window's navigator explicitly rather than the bare global.
    const nav = (typeof window !== 'undefined' && window.navigator)
      || (typeof navigator !== 'undefined' ? navigator : null);
    return !!(nav && typeof nav.userAgent === 'string' && /jsdom/i.test(nav.userAgent));
  } catch {
    return false;
  }
}

/**
 * A figure's HTML controls (sliders, mode switches) live OUTSIDE its
 * `<svg>`, alongside it in the mounted element -- but the audit-snapshot
 * pipeline (`scripts/lib/figureSnapshot.mjs`) serializes only the `<svg>`
 * itself, so a mouse reviewing the PNG has no way to see what controls
 * even exist or what values they are at. In snapshot mode only (a live
 * page already shows the real, interactive controls -- this would just be
 * a redundant, non-interactive echo of them there), draw one small text
 * row listing each control's current value. `items` is `[{ label, value
 * }]`. Returns `null` outside snapshot mode (nothing to append).
 */
export function snapshotControlsCaption(x, y, items, opts = {}) {
  if (!isSnapshotMode()) return null;
  const text = `controls (default state): ${items.map((i) => `${i.label} = ${i.value}`).join('   ')}`;
  return wrappedText(x, y, text, {
    maxWidth: opts.maxWidth || 900,
    size: opts.size || 9,
    fill: opts.fill || COLOR.textDim,
    lineHeight: opts.lineHeight || 11,
    anchor: opts.anchor,
  });
}

export function simpleText(x, y, str, opts = {}) {
  return richText(x, y, [{ t: str }], opts);
}

/** Greedily wrap `str` into lines no wider than `maxWidth` (estimated, at
 * font size `size`) -- long captions and labels need this explicitly since
 * there is no automatic text wrapping in SVG. */
export function wrapLines(str, maxWidth, size) {
  const words = String(str).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (cur && estWidth(test, size) > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** A caption/label that word-wraps to `maxWidth`, one plain (no sub/sup)
 * line per row. Returns a `<g>` of the wrapped lines. */
export function wrappedText(x, y, str, {
  maxWidth, size = 11, anchor = 'start', fill, lineHeight, mono,
} = {}) {
  const lines = wrapLines(str, maxWidth, size);
  const lh = lineHeight || size * 1.3;
  const g = svgEl('g');
  lines.forEach((line, i) => {
    g.appendChild(richText(x, y + i * lh, line, {
      size, anchor, fill, mono,
    }));
  });
  return g;
}

export function legendSwatch(color, label, { dashed = false } = {}) {
  return htmlEl('span', { class: 'fig-legend__item' }, [
    htmlEl('span', {
      class: 'fig-legend__swatch',
      style: `background:${dashed ? 'none' : color};border-bottom:${dashed ? `2px dashed ${color}` : 'none'};`,
    }),
    htmlEl('span', { class: 'fig-legend__label' }, [label]),
  ]);
}

export function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) return String(n);
  return n.toFixed(digits);
}

// ---- Controls -------------------------------------------------------

let idSeq = 0;
function nextId(prefix) { idSeq += 1; return `${prefix}-${idSeq}`; }

/** A labeled, keyboard-accessible range slider. Returns
 * `{ node, input, setValue(v) }`. */
export function rangeControl({
  label, min, max, step, value, format = (v) => v, onInput, renderValue,
}) {
  // `label` may be a string or a DOM node (e.g. a texSpan from
  // ./texLabel.mjs); `renderValue(outEl, v)`, when given, draws the live
  // value itself (e.g. typeset) instead of `format(v)` as plain text.
  const id = nextId('fig-range');
  const out = htmlEl('output', { for: id, class: 'fig-control__value' }, [renderValue ? '' : format(value)]);
  if (renderValue) renderValue(out, value);
  const input = htmlEl('input', {
    type: 'range', id, min, max, step, value, class: 'fig-control__input',
  });
  const show = (v) => {
    if (renderValue) renderValue(out, v);
    else out.textContent = format(v);
  };
  input.addEventListener('input', () => {
    const v = Number(input.value);
    show(v);
    onInput(v);
  });
  const node = htmlEl('label', { class: 'fig-control fig-control--range', for: id }, [
    htmlEl('span', { class: 'fig-control__label' }, [label]),
    input,
    out,
  ]);
  return {
    node,
    input,
    setValue(v) { input.value = v; show(v); },
  };
}

/** A labeled `<select>`. `options` is `[{ value, label }]` or a list of
 * primitives. Returns `{ node, select }`. */
export function selectControl({
  label, options, value, onChange,
}) {
  const id = nextId('fig-select');
  const opts = options.map((o) => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return htmlEl('option', { value: v, selected: String(v) === String(value) ? '' : null }, [l]);
  });
  const select = htmlEl('select', { id, class: 'fig-control__input' }, opts);
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  const node = htmlEl('label', { class: 'fig-control fig-control--select', for: id }, [
    htmlEl('span', { class: 'fig-control__label' }, [label]),
    select,
  ]);
  return { node, select };
}

/** A `role="group"` of toggle buttons (radio-like), each `aria-pressed`.
 * `options` is `[{ value, label }]` or primitives. Returns
 * `{ node, setValue(v) }`. */
export function buttonGroup({
  label, options, value, onChange,
}) {
  const buttons = [];
  // `label` may be a DOM node (a typeset label): its text is the group's name.
  const ariaText = label && typeof label === 'object' ? (label.textContent || null) : label;
  const wrap = htmlEl('div', { class: 'fig-control fig-control--buttons', role: 'group', 'aria-label': ariaText });
  if (label) wrap.appendChild(htmlEl('span', { class: 'fig-control__label' }, [label]));
  for (const o of options) {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    const btn = htmlEl('button', {
      type: 'button',
      class: `fig-btn${String(v) === String(value) ? ' is-active' : ''}`,
      'aria-pressed': String(String(v) === String(value)),
    }, [l]);
    btn.addEventListener('click', () => {
      for (const b of buttons) b.el.classList.remove('is-active');
      for (const b of buttons) b.el.setAttribute('aria-pressed', 'false');
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
      onChange(v);
    });
    buttons.push({ el: btn, value: v });
    wrap.appendChild(btn);
  }
  return {
    node: wrap,
    setValue(v) {
      for (const b of buttons) {
        const active = String(b.value) === String(v);
        b.el.classList.toggle('is-active', active);
        b.el.setAttribute('aria-pressed', String(active));
      }
    },
  };
}

/** A labeled checkbox toggle. Returns `{ node, input }`. */
export function toggleControl({ label, checked, onChange }) {
  const id = nextId('fig-toggle');
  const input = htmlEl('input', { type: 'checkbox', id, class: 'fig-control__input' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  const node = htmlEl('label', { class: 'fig-control fig-control--toggle', for: id }, [
    input,
    htmlEl('span', { class: 'fig-control__label' }, [label]),
  ]);
  return { node, input };
}

export function controlsBar(children = []) {
  return htmlEl('div', { class: 'fig-controls', role: 'group' }, children);
}

/** `<g transform="translate(x,y)">`, a panel's local coordinate origin
 * inside the figure's single root `<svg>` (every panel lives in ONE svg,
 * not several sibling ones, since the audit snapshot harness --
 * scripts/lib/figureSnapshot.mjs -- captures only the first `<svg>` it
 * finds). */
export function group(x = 0, y = 0, extra = {}) {
  return svgEl('g', { transform: `translate(${x},${y})`, ...extra });
}

/**
 * Measured CSS width of the mounted element, for a figure's own
 * wide/narrow "stack below Npx" breakpoint. In the headless audit
 * snapshot (jsdom has no real layout box, so `getBoundingClientRect`
 * returns all zeros) this falls back to `fallback` -- deliberately wide,
 * so the audit's default-state snapshot renders the wide, side-by-side
 * layout the design briefs describe first, matching the convention
 * site/figures/fig.counting-scales.js already established.
 */
export function measuredWidth(el, fallback = 900) {
  try {
    const r = el.getBoundingClientRect();
    if (r && r.width > 0) return r.width;
  } catch {
    /* jsdom without a layout box: fall through to the default. */
  }
  return fallback;
}

/** Re-run `onResize` when `el` changes size (a real browser only --
 * `window.ResizeObserver` does not exist in the headless snapshot, so
 * this is a no-op there and the figure just keeps its initial wide
 * layout). Returns the observer (or null) in case a caller wants to
 * disconnect it. */
export function watchResize(el, onResize) {
  if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'function') {
    // Width changes only: the layout depends on the width alone, and a
    // redraw that changes the figure's own height must not trigger another
    // (e.g. inside the pop-out dialog, which moves the live figure into a
    // wider box and lets its height follow).
    let lastWidth = null;
    const ro = new window.ResizeObserver((entries) => {
      const w = Math.round(entries[entries.length - 1].contentRect.width);
      if (w === lastWidth) return;
      lastWidth = w;
      onResize();
    });
    ro.observe(el);
    return ro;
  }
  return null;
}

