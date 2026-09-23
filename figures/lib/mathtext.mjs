// (Since tasks/p9b-figure-math.md the figures typeset their labels with
// KaTeX in the browser -- site/figures/lib/texLabel.mjs; this renderer is
// now what those labels fall back to in the headless audit snapshot and in
// tests, where KaTeX-in-SVG cannot be drawn.)
//
// Minimal inline-math renderer for SVG <text> nodes -- the documented
// "otherwise as SVG text" fallback (tasks/p4-build.md's design briefs):
// KaTeX is only available at *build* time (scripts/lib/tex2html.mjs,
// pre-rendering the paper's own statements, C2) -- katex.min.js itself is
// never vendored for the browser runtime (scripts/build.mjs only ships
// katex.min.css/fonts for that pre-rendered HTML), so a figure's own
// runtime-computed labels (axis ticks, readouts that depend on a slider's
// current value) cannot call KaTeX.
//
// Two rendering modes, chosen by `setFlatMode`/the `flat` argument:
//   - LIVE (default, flat=false): `_{xyz}`/`^{xyz}` become real raised or
//     lowered <tspan>s, so "m_{ent}" reads as a genuine subscript in a
//     browser.
//   - SNAPSHOT (flat=true): the same markup is flattened to plain text on
//     one baseline ("m_{ent}" -> "m_ent"). ImageMagick's `convert` -- this
//     project's fallback SVG rasterizer for the audit-snapshot pipeline
//     (scripts/snapshot_figures.mjs) when rsvg-convert is absent -- badly
//     mis-positions sequential tspans that use `dy`/`baseline-shift`
//     (confirmed by hand: characters overlap/reorder), which made every
//     mouse's audit screenshot look broken even though the same SVG
//     renders correctly in a real browser. `render(el, {snapshot})` sets
//     the mode once per render via `setFlatMode(snapshot)` before drawing.
//
// Not a TeX engine either way: no nesting beyond one level of braces, no
// fractions, no radicals -- just enough to keep "m_ent", "q_{i+1}",
// "3^{-Q}" legible.

let flatMode = false;

/** Set the module-wide rendering mode for every subsequent appendMathText
 * call that does not pass its own explicit `flat` option -- called once
 * per render pass (site/figures/fig.*.js's render(), from its own
 * `snapshot` flag), so individual draw calls do not each have to thread a
 * flat/live flag through. */
export function setFlatMode(flat) {
  flatMode = !!flat;
}

export function getFlatMode() {
  return flatMode;
}

/** Tokenize `src` into {text} | {sub:text} | {sup:text} runs. */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  let plain = '';
  const flush = () => { if (plain) { tokens.push({ text: plain }); plain = ''; } };
  while (i < src.length) {
    const c = src[i];
    if ((c === '_' || c === '^') && i + 1 < src.length) {
      let body;
      let next;
      if (src[i + 1] === '{') {
        // Balanced-brace scan (bodies may themselves contain "_{...}",
        // e.g. "3^{m_{ent}}") -- a naive indexOf('}') would stop at the
        // first, inner close brace.
        let depth = 1;
        let j = i + 2;
        while (j < src.length && depth > 0) {
          if (src[j] === '{') depth += 1;
          else if (src[j] === '}') depth -= 1;
          j += 1;
        }
        if (depth !== 0) { plain += c; i += 1; continue; }
        body = src.slice(i + 2, j - 1);
        next = j;
      } else {
        body = src[i + 1];
        next = i + 2;
      }
      flush();
      tokens.push(c === '_' ? { sub: body } : { sup: body });
      i = next;
      continue;
    }
    plain += c;
    i += 1;
  }
  flush();
  return tokens;
}

/** Flatten `_{xyz}`/`^{xyz}` markup to plain text on one baseline
 * ("m_{ent}" -> "m_ent"), recursing into nested bodies. Used for the
 * snapshot-mode fallback (see the module header comment). */
export function flattenMathText(src) {
  const s = String(src);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if ((c === '_' || c === '^') && i + 1 < s.length) {
      out += c;
      if (s[i + 1] === '{') {
        let depth = 1;
        let j = i + 2;
        while (j < s.length && depth > 0) {
          if (s[j] === '{') depth += 1;
          else if (s[j] === '}') depth -= 1;
          j += 1;
        }
        if (depth !== 0) { i += 1; continue; }
        out += flattenMathText(s.slice(i + 2, j - 1));
        i = j;
        continue;
      }
      out += s[i + 1];
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const SUB_FRAC = 0.28; // fraction of the CURRENT (already-scaled) font size, shifted down
const SUP_FRAC = -0.5; // ...shifted up
const SCALE = 0.72; // per-level font-size shrink

/**
 * Append `src` as real raised/lowered <tspan>s (LIVE mode), recursing into
 * nested sub/sup bodies (e.g. "q_i" inside "Δ^{q_i}_{k_i,n_i+2L}") so they
 * render as genuine further-raised/lowered, further-shrunk text rather
 * than a literal "_"/"^" character -- audit feedback: a formula with a
 * one-level-nested super/subscript rendered as "a mixture of literal
 * caret/underscore text" where the nested part was flattened.
 *
 * Every dy/font-size is computed as a PLAIN NUMBER (SVG user units, i.e.
 * effectively px, matching how every caller already sets this text
 * element's own `font-size`) rather than 'em' units relative to each
 * tspan's own (varying) font size -- that would need rescaling at every
 * nesting level to compose correctly. Plain user units let a `desiredDy`
 * computed once at each level just add linearly as we recurse deeper, and
 * subtract cleanly back to a shallower level's baseline afterwards.
 */
function appendTspans(textSel, src) {
  const baseSize = parseFloat(textSel.attr('font-size')) || 10;
  let currentDy = 0; // absolute px offset already applied, from the natural baseline

  function walk(tokens, scale, desiredDy) {
    for (const tok of tokens) {
      if (tok.text !== undefined) {
        if (tok.text === '') continue;
        const tspan = textSel.append('tspan').text(tok.text);
        if (scale !== 1) tspan.attr('font-size', scale * baseSize);
        const delta = desiredDy - currentDy;
        if (Math.abs(delta) > 1e-9) { tspan.attr('dy', delta); currentDy = desiredDy; }
      } else {
        const isSub = tok.sub !== undefined;
        const body = String(isSub ? tok.sub : tok.sup);
        const childScale = scale * SCALE;
        const childDy = desiredDy + (isSub ? SUB_FRAC : SUP_FRAC) * baseSize * childScale;
        walk(tokenize(body), childScale, childDy);
      }
    }
  }

  walk(tokenize(String(src)), 1, 0);
}

/**
 * Append `src` (plain text with `_x`/`_{xy}`/`^x`/`^{xy}` markup) to the D3
 * text selection `textSel`. Renders as flat text if `flat` (or, absent an
 * explicit `flat`, the module's current mode set by `setFlatMode`) is
 * true, otherwise as real <tspan> sub/superscripts. Returns `textSel`.
 */
export function appendMathText(textSel, src, flat = flatMode) {
  if (flat) {
    textSel.text(flattenMathText(src));
  } else {
    appendTspans(textSel, src);
  }
  return textSel;
}

/** Convenience: create a <text> at (x, y) with the given attrs and math
 * markup content, using the same D3 selection `parent` other draw calls
 * use (so it inherits the right SVG namespace/document). */
export function mathText(parent, {
  x, y, cls, fill, anchor = 'start', size,
}) {
  return (src) => {
    const t = parent.append('text').attr('x', x).attr('y', y);
    if (cls) t.attr('class', cls);
    if (fill) t.attr('fill', fill);
    if (anchor) t.attr('text-anchor', anchor);
    if (size) t.attr('font-size', size);
    appendMathText(t, src);
    return t;
  };
}
