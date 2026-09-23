// Real typeset math inside the D3 figures (tasks/p9b-figure-math.md): a
// label is drawn as KaTeX HTML inside an SVG <foreignObject>, placed so
// that it sits exactly where the old SVG <text> label sat (same x, same
// baseline y, same start/middle/end anchor), sized by measuring the
// rendered box.
//
// A label's source is TEXT WITH INLINE MATH: math between `$...$`, plain
// words outside it ("the same unknown $\kappa_t$ on both sides"), so words
// stay in the figure's own UI font and only the mathematics is KaTeX. `\$`
// is a literal dollar sign. The math is rendered with the paper's own
// macro table (window.HCP_MACROS: inlined by the preview, and loaded from
// dist/macros.js by the full site), so \bfAhom, \qq, \cmet, \m, \S, ...
// look exactly as in the paper text. Never with the HCP notation popovers
// (no \htmlClass, `trust` off).
//
// FALLBACK. Whenever live KaTeX is unavailable -- the headless audit
// snapshot (isSnapshotMode(): jsdom, then resvg, which cannot draw a
// foreignObject), the unit tests, or a page where katex.min.js failed to
// load -- every call draws the figure's previous plain-text/mathtext label
// instead (the `fallback` each call site passes), so `npm run
// snapshot_figures` and the audit PNGs are unchanged.
//
// Bundling note (scripts/lib/bundleFigures.mjs): the preview bundle runs
// each module's imports as plain destructures, in file-name order, so a
// lib module may only import lib modules whose names sort before its own.
// "texLabel" sorts after dom, mathtext and svgkit, which is why it is not
// called "katexLabel".

import { svgEl } from './dom.mjs';
import { appendMathText } from './mathtext.mjs';
import { isSnapshotMode, richText, wrappedText } from './svgkit.mjs';

// KaTeX's own `.katex` rule sets 1.21em. Inside a figure, next to 7-12px
// UI-font labels, a slightly smaller factor keeps the math at the height
// of the surrounding label text.
const MATH_EM = 1.08;
const STYLE_ID = 'hcp-fig-tex-style';

function katexLib() {
  try {
    const k = typeof window !== 'undefined' ? window.katex : null;
    return k && typeof k.renderToString === 'function' ? k : null;
  } catch {
    return null;
  }
}

/** True when labels are typeset with KaTeX; false in every fallback case
 * (see the header). */
export function texEnabled() {
  return !isSnapshotMode() && typeof document !== 'undefined' && !!document.body && !!katexLib();
}

function paperMacros() {
  const m = (typeof window !== 'undefined' && window.HCP_MACROS) || {};
  // A fresh copy per render: KaTeX may write \gdef'd names into the table.
  return { ...m };
}

/** Split `src` into `[{ math: bool, s }]` runs at unescaped `$`. */
export function splitMixed(src) {
  const out = [];
  let buf = '';
  let math = false;
  const s = String(src);
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '$') { buf += math ? '\\$' : '$'; i += 1; continue; }
    if (c === '$') {
      if (buf) out.push({ math, s: buf });
      buf = '';
      math = !math;
      continue;
    }
    buf += c;
  }
  if (buf) out.push({ math, s: buf });
  return out;
}

/** The plain-text reading of a mixed source (math kept as its TeX source):
 * used only when no fallback was given. */
export function plainOfMixed(src) {
  return splitMixed(src).map((r) => r.s).join('');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Rendered HTML by source: figures redraw every label on each slider
// move (and every animation frame of a "play"), mostly with the same text.
const htmlCache = new Map();

/** KaTeX HTML for a mixed source (text runs escaped, math runs typeset). */
export function mixedToHtml(src) {
  const hit = htmlCache.get(src);
  if (hit !== undefined) return hit;
  const katex = katexLib();
  const html = splitMixed(src).map((r) => {
    if (!r.math) return `<span class="hcp-fig-tex__text">${escapeHtml(r.s)}</span>`;
    return katex.renderToString(r.s, {
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'html',
      macros: paperMacros(),
    });
  }).join('');
  if (htmlCache.size > 4000) htmlCache.clear();
  htmlCache.set(src, html);
  return html;
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = [
    '.hcp-fig-tex{display:inline-block;white-space:nowrap;line-height:1.25;}',
    '.hcp-fig-tex--wrap{white-space:normal;}',
    `.hcp-fig-tex .katex{font-size:${MATH_EM}em;line-height:1.2;}`,
    '.hcp-fig-tex__probe{display:inline-block;width:0;height:0;vertical-align:baseline;}',
    '.hcp-fig-tex-fo{overflow:visible;pointer-events:none;}',
    '.hcp-fig-tex-html .katex{font-size:1.1em;}',
  ].join('\n');
  document.head.appendChild(st);
}

let host = null;
function measureHost() {
  if (host && host.isConnected) return host;
  host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden;pointer-events:none;contain:layout style;';
  document.body.appendChild(host);
  return host;
}

let uiFont = null;
function figureFont() {
  if (!uiFont) {
    try { uiFont = window.getComputedStyle(document.body).fontFamily; } catch { uiFont = ''; }
    if (!uiFont) uiFont = 'system-ui, sans-serif';
  }
  return uiFont;
}

function boxStyle(o) {
  // display:block (never inline-block) inside the foreignObject: an inline
  // box would sit on a line box whose strut, in the page's own larger font,
  // pushes the label down off its baseline.
  const parts = [
    'display:block',
    'width:max-content',
    `font-size:${o.size}px`,
    `font-family:${figureFont()}`,
    `color:${o.fill}`,
    `font-weight:${o.weight || 'normal'}`,
    `font-style:${o.italic ? 'italic' : 'normal'}`,
  ];
  if (o.maxWidth) parts.push(`max-width:${o.maxWidth}px`, `text-align:${o.anchor === 'middle' ? 'center' : o.anchor === 'end' ? 'right' : 'left'}`);
  if (o.lineHeight) parts.push(`line-height:${o.lineHeight}px`);
  // `halo`: a patch of the figure's own background behind the label, so a
  // guide line or grid running under it does not strike through the math.
  if (o.halo) parts.push('background:var(--surface)', 'border-radius:2px', 'box-shadow:0 0 0 1.5px var(--surface)');
  return parts.join(';');
}

// The probe is a zero-size inline-block at the start of the first line:
// its top is that line's baseline.
const PROBE = '<span class="hcp-fig-tex__probe"></span>';

const cache = new Map();
function measure(html, style, wrap) {
  const key = `${style}\u0000${wrap ? 1 : 0}\u0000${html}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 4000) cache.clear();
  const box = document.createElement('div');
  box.className = wrap ? 'hcp-fig-tex hcp-fig-tex--wrap' : 'hcp-fig-tex';
  box.setAttribute('style', `${style};position:absolute;left:0;top:0`);
  box.innerHTML = PROBE + html;
  measureHost().appendChild(box);
  const r = box.getBoundingClientRect();
  const p = box.firstChild.getBoundingClientRect();
  box.remove();
  const m = { w: r.width, h: r.height, base: p.top - r.top };
  if (m.w > 0) cache.set(key, m);
  return m;
}

// Live labels, re-measured once web fonts finish loading (a label measured
// before the KaTeX fonts arrive would otherwise keep a fallback font's
// width and drift off its anchor).
const live = new Set();
let fontHookInstalled = false;
function relayoutAll() {
  cache.clear();
  for (const rec of live) {
    if (!rec.fo.isConnected) {
      if (rec.seen || Date.now() - rec.born > 20000) live.delete(rec);
      continue;
    }
    rec.seen = true;
    place(rec);
  }
}
function installFontHook() {
  if (fontHookInstalled) return;
  fontHookInstalled = true;
  try {
    const fonts = document.fonts;
    if (!fonts) return;
    if (typeof fonts.addEventListener === 'function') fonts.addEventListener('loadingdone', relayoutAll);
    if (fonts.ready && typeof fonts.ready.then === 'function') fonts.ready.then(relayoutAll);
  } catch {
    /* no FontFaceSet: nothing to wait for */
  }
}
function scheduleIfLoading() {
  try {
    if (document.fonts && document.fonts.status === 'loading') document.fonts.ready.then(relayoutAll);
  } catch {
    /* ignore */
  }
}

function place(rec) {
  const m = measure(rec.html, rec.style, rec.wrap);
  const ax = rec.anchor === 'middle' ? m.w / 2 : rec.anchor === 'end' ? m.w : 0;
  const pad = 1;
  let left = rec.x - ax;
  // `clamp: [minX, maxX]`: slide the label sideways (never off its baseline)
  // so that it stays inside that span, e.g. an axis label at the very end
  // of an axis that would otherwise run past the viewBox edge.
  if (rec.clamp) {
    left = Math.min(left, rec.clamp[1] - m.w);
    left = Math.max(left, rec.clamp[0]);
  }
  rec.fo.setAttribute('x', left - pad);
  rec.fo.setAttribute('y', rec.y - m.base - pad);
  rec.fo.setAttribute('width', Math.ceil(m.w) + 2 * pad + 1);
  rec.fo.setAttribute('height', Math.ceil(m.h) + 2 * pad);
  rec.div.style.padding = `${pad}px`;
  rec.w = m.w;
  rec.h = m.h;
  rec.base = m.base;
}

/**
 * A math label at SVG point (x, y): `y` is the BASELINE (of the first line,
 * for wrapped text), `anchor` is 'start' | 'middle' | 'end', exactly like
 * the `<text>` it replaces. Returns an SVG node to append (a
 * `<foreignObject>` when typeset, else `fallback()`'s node).
 *
 * opts: size (px, default 11), fill (CSS colour, default var(--text)),
 * weight, italic, anchor, transform (SVG transform attribute, e.g. a
 * rotation about the anchor), cls, attrs (extra attributes for the node),
 * halo (paint the figure background behind the label), clamp ([minX,
 * maxX]: keep the typeset box inside that horizontal span),
 * maxWidth + lineHeight (wrap to lines no wider than maxWidth),
 * fallback: () => Node (the previous plain-text rendering).
 */
export function texLabel(x, y, src, opts = {}) {
  const o = {
    size: 11, fill: 'var(--text)', anchor: 'start', ...opts,
  };
  if (!texEnabled()) {
    if (typeof o.fallback === 'function') return o.fallback();
    const t = svgEl('text', {
      x, y, 'font-size': o.size, fill: o.fill, 'text-anchor': o.anchor === 'start' ? null : o.anchor,
    }, [plainOfMixed(src)]);
    return t;
  }
  ensureStyle();
  installFontHook();
  const html = mixedToHtml(src);
  const style = boxStyle(o);
  const fo = svgEl('foreignObject', {
    class: `hcp-fig-tex-fo${o.cls ? ` ${o.cls}` : ''}`,
    transform: o.transform || null,
    ...(o.attrs || {}),
  });
  const div = document.createElement('div');
  div.className = o.maxWidth ? 'hcp-fig-tex hcp-fig-tex--wrap' : 'hcp-fig-tex';
  div.setAttribute('style', style);
  div.innerHTML = PROBE + html;
  fo.appendChild(div);
  const rec = {
    fo, div, html, style, wrap: !!o.maxWidth, x, y, anchor: o.anchor, clamp: o.clamp || null, born: Date.now(), seen: false,
  };
  place(rec);
  live.add(rec);
  scheduleIfLoading();
  // Callers that lay out around a label (wrapped notes) read its size here.
  fo.hcpTexBox = { get w() { return rec.w; }, get h() { return rec.h; }, get base() { return rec.base; } };
  return fo;
}

/**
 * D3-selection form of texLabel, for figures that build with d3: appends
 * the label to `sel` and returns the appended node. In fallback mode it
 * appends the previous `<text>` exactly as before: the same attributes,
 * with `fallback` rendered through appendMathText (sub/superscript markup)
 * or, with `plain: true`, as literal text.
 */
export function d3TexLabel(sel, {
  x, y, anchor = 'start', size = 11, fill = 'var(--text)', weight, italic, transform, cls, attrs, plain = false,
  maxWidth, lineHeight, halo = false, clamp,
}, src, fallback) {
  const node = texLabel(x, y, src, {
    clamp,
    anchor,
    size,
    fill,
    weight,
    italic,
    transform,
    cls,
    attrs,
    maxWidth,
    lineHeight,
    halo,
    fallback: () => {
      const t = svgEl('text', {
        x,
        y,
        'text-anchor': anchor === 'start' ? null : anchor,
        'font-size': size,
        'font-weight': weight || null,
        'font-style': italic ? 'italic' : null,
        fill,
        transform: transform || null,
        class: cls || null,
        ...(halo ? { stroke: 'var(--surface)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'paint-order': 'stroke' } : {}),
        ...(attrs || {}),
      });
      const text = fallback === undefined ? plainOfMixed(src) : fallback;
      if (plain) t.textContent = text;
      else if (typeof d3 !== 'undefined') appendMathText(d3.select(t), text); // eslint-disable-line no-undef
      else t.textContent = text;
      return t;
    },
  });
  sel.node().appendChild(node);
  return node;
}

/**
 * svgkit form of texLabel, for figures that build with richText: the same
 * (x, y, opts) as `richText(x, y, old, opts)` (size defaults to 12, as
 * there), which stays the fallback. `old` is richText's string or spans.
 */
export function texText(x, y, src, old, opts = {}) {
  const o = { size: 12, fill: 'var(--text)', ...opts };
  return texLabel(x, y, src, { ...o, fallback: () => richText(x, y, old, opts) });
}

/**
 * Wrapped form: `wrappedText(x, y, old, opts)` becomes a label that wraps
 * at opts.maxWidth, lines opts.lineHeight apart (default 1.3 * size), the
 * first baseline at y.
 */
export function texWrapped(x, y, src, old, opts = {}) {
  const size = opts.size || 11;
  const o = {
    fill: 'var(--text)', ...opts, size, lineHeight: opts.lineHeight || size * 1.3,
  };
  return texLabel(x, y, src, { ...o, fallback: () => wrappedText(x, y, old, opts) });
}

/**
 * Typeset a mixed source into an HTML element (a slider's label or value,
 * a legend entry, an HTML note beside the SVG). Falls back to
 * `fallbackText` as plain text. Returns `el`.
 */
export function texHtml(el, src, fallbackText) {
  if (!texEnabled()) {
    el.textContent = fallbackText === undefined ? plainOfMixed(src) : fallbackText;
    return el;
  }
  ensureStyle();
  el.classList.add('hcp-fig-tex-html');
  el.innerHTML = mixedToHtml(src);
  return el;
}

/** A new `<span>` holding texHtml(src, fallbackText). */
export function texSpan(src, fallbackText) {
  return texHtml(document.createElement('span'), src, fallbackText);
}
