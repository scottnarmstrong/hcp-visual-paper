// Shared runtime helpers for site/figures/<id>.js modules (tasks/p4-build.md:
// "Colours come from theme tokens, never hex literals in drawing code").
// No import of 'd3' here on purpose: figure modules reference the *global*
// `d3` (site/index.html loads vendor/d3.min.js as a classic script before
// app.js; the audit-snapshot pipeline, scripts/lib/figureSnapshot.mjs, sets
// `globalThis.d3` for the duration of one headless render) rather than an
// ESM import, because the shipped site has no import map for bare module
// specifiers (scripts/build.mjs's comment: "No CDN in the site -- vendor it
// exactly like cytoscape").

import { texHtml } from './texLabel.mjs';

/** `var(--token)`, so drawing code never hardcodes a hex literal. */
export function cssVar(token) {
  return `var(${token})`;
}

/** Ceiling division for positive integers a, b -- exact integer arithmetic
 * (no floating-point division), needed anywhere a spec computes a ceiling
 * of a ratio of integers (e.g. fig.retained-histories' Q, fig.polynomial-
 * entry's stage lengths use ceil() of a real number instead, via
 * Math.ceil, which is fine since those inputs are already floats). */
export function ceilDiv(a, b) {
  return Math.floor((a + b - 1) / b);
}

/** True unless the viewer has asked for reduced motion -- gate every
 * animation/transition/play-button autoplay on this (tasks/p4-build.md:
 * "Motion respects prefers-reduced-motion"). Falls back to "reduce motion"
 * when matchMedia is unavailable (headless snapshot / Node). */
export function motionOk() {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Render a "MUST HOLD" assertion failure as a visible error box instead of
 * a (possibly misleading) figure, exactly as every figure spec's "MUST
 * HOLD" section requires: "show an error box instead of a figure if any
 * fails". `el` is cleared first. */
export function showAssertionError(el, figureId, message) {
  el.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'figure-error';
  box.setAttribute('role', 'alert');
  box.style.cssText = [
    'border:1px solid var(--border)',
    'background:var(--surface-2)',
    'color:var(--text)',
    'padding:12px 14px',
    'border-radius:8px',
    'font:14px var(--font-ui, system-ui, sans-serif)',
  ].join(';');
  box.textContent = `${figureId}: an internal consistency check failed -- ${message}`;
  el.appendChild(box);
}

/** assert(cond, msg): throws a plain Error carrying msg -- callers wrap
 * their whole render() body in a try/catch that routes into
 * showAssertionError, so a thrown assertion becomes the required error box
 * rather than an uncaught exception (and rather than a wrong figure). */
export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** One <option>-driven <select>, one <input type=range"> slider, or a plain
 * <button> plus a text <label>, wired for keyboard access (native form
 * controls are keyboard-operable by default) -- tasks/p4-build.md:
 * "Controls are keyboard accessible and have labels." Returns the wrapping
 * <div class="figure-control">, the <input>/<button>/<select> itself, and
 * (for slider/select) a small <output> the caller can update with a
 * formatted value on 'input'/'change'.
 */
export function makeSliderControl({
  id, label, min, max, step, value, formatValue = (v) => String(v), labelTex, formatTex,
}) {
  // `labelTex` / `formatTex(v)`: the label and the live value as text with
  // inline $...$ math, typeset by site/figures/lib/texLabel.mjs (plain
  // `label` / `formatValue(v)` are the fallback).
  const wrap = document.createElement('div');
  wrap.className = 'figure-control figure-control--slider';
  const lab = document.createElement('label');
  lab.setAttribute('for', id);
  if (labelTex) texHtml(lab, labelTex, label);
  else lab.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.id = id;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const out = document.createElement('output');
  out.setAttribute('for', id);
  const show = (v) => {
    if (formatTex) texHtml(out, formatTex(v), formatValue(v));
    else out.textContent = formatValue(v);
  };
  show(value);
  input.addEventListener('input', () => { show(Number(input.value)); });
  wrap.append(lab, input, out);
  return { wrap, input, out };
}

export function makeSelectControl({
  id, label, options, value, labelTex,
}) {
  const wrap = document.createElement('div');
  wrap.className = 'figure-control figure-control--select';
  const lab = document.createElement('label');
  lab.setAttribute('for', id);
  if (labelTex) texHtml(lab, labelTex, label);
  else lab.textContent = label;
  const select = document.createElement('select');
  select.id = id;
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = String(opt);
    o.textContent = String(opt);
    if (String(opt) === String(value)) o.selected = true;
    select.appendChild(o);
  }
  wrap.append(lab, select);
  return { wrap, select };
}

export function makeButtonControl({ id, label }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = id;
  btn.className = 'figure-control figure-control--button';
  btn.textContent = label;
  return btn;
}

/**
 * Draw a caption strip INSIDE the SVG listing every control and its
 * default value (plus, optionally, a banner line) -- audit feedback: the
 * real HTML controls/banner a figure mounts outside its <svg> (native
 * sliders/buttons/details, so they are keyboard accessible) are invisible
 * to the audit-snapshot pipeline, which only ever captures the <svg>
 * itself, so a mouse reviewing the PNG could not read parameter defaults
 * at all. Only called when `render(el, {snapshot: true})` -- never on the
 * live page, where the real controls already do this job. Returns the
 * strip's height so the caller can lay out the rest of the figure below
 * it.
 *
 * `g` is a D3 selection (a <g>, already positioned at the strip's origin);
 * `width` is the available width; `lines` is an array of plain strings,
 * one per control/banner (e.g. "banner: toy run · ...",
 * "Π = 10^x (slider, default 3)").
 */
export function drawSnapshotCaption(g, width, lines) {
  const pad = 8;
  const lineHeight = 13;
  const height = pad * 2 + lineHeight * lines.length;
  g.append('rect').attr('x', 0).attr('y', 0).attr('width', width).attr('height', height)
    .attr('fill', cssVar('--surface-2')).attr('stroke', cssVar('--border'));
  lines.forEach((line, i) => {
    g.append('text').attr('x', pad).attr('y', pad + lineHeight * (i + 1) - 4)
      .attr('font-size', 9.5).attr('fill', cssVar('--text-dim'))
      .text(line);
  });
  return height;
}
