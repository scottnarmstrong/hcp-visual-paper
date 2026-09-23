// content/figures/fig.whitney-fill.yaml -- "Whitney partitions: large
// cubes in the bulk, small cubes only at the boundary". Toy run, d = 2.
//
// Mode S: standard aligned cubes inside one adapted cube (l.source.whitney).
// Mode W: cubes of the q-grid inside a cube of the q'-grid, construction
//         (i) of l.two.grid.whitney, at projective distance rho.
// The histogram in both modes shows only an UPPER ENVELOPE on the volume
// fraction per scale -- never a claim that bars decay by an exact factor.

import {
  metric, roundQ, conj, rot, m2, mapBox, matVec, matMul, inv2, sqrtSym, projectiveDistance, distortionK, eigSym,
} from './lib/mat2.mjs';
import { boundingBox } from './lib/geom2d.mjs';
import { selectInConvex, volumeFractionsByScale } from './lib/whitneySelect.mjs';
import {
  makeSvg, group, richText, fitTransform, hatchPattern, buttonGroup, rangeControl, controlsBar, fmt, COLOR, tint,
  snapshotControlsCaption, measuredWidth, watchResize,
} from './lib/svgkit.mjs';
import { texText, texWrapped, texSpan } from './lib/texLabel.mjs';
import { clear, svgEl, htmlEl } from './lib/dom.mjs';
import { invariant, approxEqual } from './lib/assert.mjs';

const J_STAR = 2;
const FLOOR = -6;

function rampOpacity(r, rMax, rMin) {
  const t = rMin === rMax ? 0 : (rMax - r) / (rMax - rMin);
  return 0.25 + 0.6 * Math.min(Math.max(t, 0), 1);
}

function polyPath(pts) {
  return `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')} Z`;
}

function computeModeS(e, a) {
  const q = roundQ(metric(e, a), J_STAR);
  const T = mapBox(q, [0, 0], 0.5);
  const sel = selectInConvex(T, { cap: 0, floor: FLOOR });
  invariant(sel.selected.every((s) => s.r <= 0), 'Mode S: a selected square exceeds the cap');
  const fractions = volumeFractionsByScale(sel);
  for (const [r, f] of fractions) {
    const bound = 12 * 2 ** 1.5 * 3 ** r;
    invariant(f <= bound + 1e-9, `Mode S: f_${r} = ${f} exceeds the lemma's bound ${bound}`);
  }
  return {
    q, T, sel, fractions, cap: 0,
  };
}

function computeModeW(e, a, rho, b, ell) {
  const m = metric(e, a);
  const sq = sqrtSym(m);
  const mp = conj(sq, conj(rot(b), m2(Math.exp(2 * rho), 0, 0, 1)));
  const q = roundQ(m, J_STAR);
  const qp = roundQ(mp, J_STAR);
  const A = matMul(inv2(q), qp);
  const T = mapBox(A, [0, 0], 0.5);
  const cap = -ell;
  const sel = selectInConvex(T, { cap, floor: FLOOR });
  invariant(sel.selected.every((s) => s.r <= cap), 'Mode W: a selected square exceeds the cap');
  const fractions = volumeFractionsByScale(sel);
  const dpr = projectiveDistance(m, mp);
  invariant(approxEqual(dpr, rho, 1e-9), `Mode W: recomputed d_pr = ${dpr} != rho = ${rho}`);
  let cRun = 0;
  for (const [r, f] of fractions) {
    if (r < cap) cRun = Math.max(cRun, f * 3 ** (-r));
  }
  for (const [r, f] of fractions) {
    if (r < cap) invariant(f <= cRun * 3 ** r + 1e-12, 'Mode W: guide does not lie above every drawn bar');
  }
  const K = distortionK(q, qp);
  return {
    m, mp, q, qp, A, T, sel, fractions, cap, dpr, cRun, K,
  };
}


function drawPartition(svg, x0, y0, w, h, state, comp, theme) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -10, '(A) partition', { anchor: 'middle', size: 12, fill: COLOR.textDim }));

  const view = (M) => (state.mode === 'W' && state.view === 'Euclidean' ? matVec(comp.q, M) : M);
  const cornersOf = (cx, cy, r) => {
    const hs = 3 ** r / 2;
    return [[cx - hs, cy - hs], [cx + hs, cy - hs], [cx + hs, cy + hs], [cx - hs, cy + hs]].map(view);
  };
  const Tv = comp.T.map(view);
  const bbox = boundingBox(Tv);
  const t = fitTransform(bbox, { x0: 0, y0: 14, w, h: h - 14 }, { pad: 10 });

  const byScale = new Map();
  for (const sq of comp.sel.selected) {
    if (!byScale.has(sq.r)) byScale.set(sq.r, []);
    byScale.get(sq.r).push(sq);
  }
  const rMax = comp.cap;
  const rMin = Math.min(...(byScale.size ? [...byScale.keys()] : [comp.cap]));
  const scaleEls = new Map();
  for (const [r, squares] of byScale) {
    const parts = [];
    for (const { cx, cy } of squares) {
      parts.push(polyPath(cornersOf(cx, cy, r).map(t.toPx)));
    }
    const el = svgEl('path', {
      d: parts.join(' '), fill: tint('gridA', rampOpacity(r, rMax, rMin), theme), stroke: COLOR.gridA, 'stroke-width': 0.3, 'stroke-opacity': 0.5,
    });
    g.appendChild(el);
    scaleEls.set(r, el);
  }
  if (comp.sel.remainder.length) {
    const parts = comp.sel.remainder.map(({ cx, cy, r }) => polyPath(cornersOf(cx, cy, r).map(t.toPx)));
    const hatch = hatchPattern(svg, COLOR.neutral);
    g.appendChild(svgEl('path', { d: parts.join(' '), fill: hatch, stroke: COLOR.border, 'stroke-width': 0.3 }));
  }
  g.appendChild(svgEl('path', {
    d: polyPath(Tv.map(t.toPx)), fill: 'none', stroke: state.mode === 'S' ? COLOR.gridA : COLOR.gridB, 'stroke-width': 2,
  }));

  if (state.mode === 'W') {
    g.appendChild(state.view === 'Euclidean'
      ? richText(4, 12, 'Euclidean coordinates', { size: 9, fill: COLOR.textDim })
      : texText(4, 12, '$\\qq$-coordinates, $x=\\qq v$', 'q-coordinates, x = qv', { size: 9, fill: COLOR.textDim }));
  }
  return { scaleEls };
}

function drawHistogram(svg, x0, y0, w, h, state, comp) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -10, '(B) volume fraction by scale', { anchor: 'middle', size: 12, fill: COLOR.textDim }));

  const scales = [];
  for (let r = comp.cap; r >= FLOOR; r -= 1) scales.push(r);
  const plotX0 = 46;
  const plotW = w - 60;
  const barGap = plotW / (scales.length + 1.4);
  const axisY = h - 46;
  const plotH = h - 70;
  const logMin = -4;
  const logMax = 0;
  const plotTop = axisY - plotH;
  const yAt = (f) => axisY - ((Math.log10(Math.max(f, 1e-5)) - logMin) / (logMax - logMin)) * plotH;
  // The reference/envelope line's true value can run well above 1 (a
  // LOOSE bound, e.g. ~34 at scale 0) -- clip its drawn points to the top
  // of the plot rather than letting the path run up through the panel
  // title above it.
  const yAtClipped = (f) => Math.max(yAt(f), plotTop);

  g.appendChild(svgEl('line', {
    x1: plotX0, y1: axisY, x2: plotX0 + plotW, y2: axisY, stroke: COLOR.border, 'stroke-width': 1,
  }));
  g.appendChild(svgEl('line', {
    x1: plotX0, y1: axisY - plotH, x2: plotX0, y2: axisY, stroke: COLOR.border, 'stroke-width': 1,
  }));
  for (const p of [1, 0.01, 0.0001]) {
    g.appendChild(richText(plotX0 - 6, yAt(p) + 3, fmt(p, p < 1 ? 4 : 0), { anchor: 'end', size: 8, fill: COLOR.textDim }));
    g.appendChild(svgEl('line', {
      x1: plotX0 - 3, y1: yAt(p), x2: plotX0, y2: yAt(p), stroke: COLOR.border,
    }));
  }

  const rMax = comp.cap;
  const rMin = Math.min(...scales);
  let sumF = 0;
  const barEls = new Map();
  scales.forEach((r, i) => {
    const f = comp.fractions.get(r) || 0;
    sumF += f;
    const bx = plotX0 + (i + 0.7) * barGap;
    const barW = barGap * 0.6;
    const rectEl = svgEl('rect', {
      x: bx, y: yAt(f), width: barW, height: Math.max(axisY - yAt(f), 0), fill: tint('gridA', rampOpacity(r, rMax, rMin), state.theme),
    });
    g.appendChild(rectEl);
    barEls.set(r, rectEl);
    g.appendChild(richText(bx + barW / 2, axisY + 14, String(r), { anchor: 'middle', size: 8, fill: COLOR.textDim }));
  });
  const remBx = plotX0 + (scales.length + 0.7) * barGap;
  const remW = barGap * 0.6;
  const remainder = Math.max(1 - sumF, 0);
  const hatch = hatchPattern(svg, COLOR.neutral);
  g.appendChild(svgEl('rect', {
    x: remBx, y: yAt(remainder), width: remW, height: Math.max(axisY - yAt(remainder), 0), fill: hatch, stroke: COLOR.border, 'stroke-width': 0.6,
  }));
  g.appendChild(richText(remBx + remW / 2, axisY + 14, 'finer', { anchor: 'middle', size: 8, fill: COLOR.textDim }));
  g.appendChild(texText(plotX0 + plotW / 2, h - 4, 'scale $r-j$', 'scale r − j', { anchor: 'middle', size: 9, fill: COLOR.textDim }));

  // reference / envelope line, theorem colour dashed.
  if (state.mode === 'S') {
    const trueVals = scales.map((r) => 12 * 2 ** 1.5 * 3 ** r);
    const pts = scales.map((r, i) => [plotX0 + (i + 1) * barGap, yAtClipped(trueVals[i])]);
    g.appendChild(svgEl('path', {
      d: `M${pts.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' L')}`, fill: 'none', stroke: COLOR.theorem, 'stroke-width': 1.6, 'stroke-dasharray': '5,4',
    }));
    // Off-scale indication: the true bound exceeds the y-axis maximum (1)
    // at the coarser scales -- a small up-caret at each such point, so the
    // flat clipped segment is never mistaken for the line's real value.
    scales.forEach((r, i) => {
      if (trueVals[i] > 1) {
        const [px, py] = pts[i];
        g.appendChild(svgEl('path', {
          d: `M${px - 4},${py + 5} L${px},${py - 2} L${px + 4},${py + 5}`, fill: 'none', stroke: COLOR.theorem, 'stroke-width': 1.4,
        }));
      }
    });
    const offScaleNote = trueVals.some((v) => v > 1) ? ' (^ marks: off scale above 1, the true bound continues upward)' : '';
    g.appendChild(texWrapped(
      plotX0,
      10,
      `$12d^{3/2}\\cdot3^{r-j}$ (lemma, $d=2$) $\\approx${fmt(12 * 2 ** 1.5, 2)}\\cdot3^{r-j}$${offScaleNote}`,
      `12d^1.5 · 3^(r−j) (lemma, d=2) ≈ ${fmt(12 * 2 ** 1.5, 2)} · 3^(r−j)${offScaleNote}`,
      { maxWidth: w - 20, size: 8.5, fill: COLOR.theorem, lineHeight: 10 },
    ));
  } else {
    const guidePts = scales.filter((r) => r < comp.cap).map((r) => [plotX0 + (scales.indexOf(r) + 1) * barGap, yAtClipped(comp.cRun * 3 ** r)]);
    if (guidePts.length) {
      g.appendChild(svgEl('path', {
        d: `M${guidePts.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' L')}`, fill: 'none', stroke: COLOR.theorem, 'stroke-width': 1.6, 'stroke-dasharray': '5,4',
      }));
    }
    g.appendChild(texWrapped(
      plotX0,
      10,
      `envelope $C\\cdot3^{r-j}$, $C$ fitted to this run: $C_{\\mathrm{run}}=${fmt(comp.cRun, 2)}$ (not a law for individual bars)`,
      `envelope C·3^(r−j), C fitted to this run: C_run = ${fmt(comp.cRun, 2)} (not a law for individual bars)`,
      { maxWidth: w - 20, size: 8.5, fill: COLOR.theorem, lineHeight: 10 },
    ));
  }

  g.appendChild(texWrapped(
    plotX0,
    h + 14,
    `drawn: $\\sum f_r=${fmt(sumF, 4)}$; finer than the floor: $${fmt(remainder, 4)}$; total $1$`,
    `drawn: sum f_r = ${fmt(sumF, 4)}; finer than the floor: ${fmt(remainder, 4)}; total 1`,
    { maxWidth: w - 20, size: 8.5, fill: COLOR.textDim, lineHeight: 10 },
  ));
  return { barEls };
}

const NARROW_BREAKPOINT = 640;

function layoutBoxes(mode, vbW) {
  if (mode === 'wide') {
    return {
      vbW,
      a: {
        x: 20, y: 50, w: 500, h: 420,
      },
      b: {
        x: 560, y: 50, w: 500, h: 420,
      },
      readoutY: 522,
      totalH: 620,
    };
  }
  const panelW = vbW - 40;
  const a = {
    x: 20, y: 50, w: panelW, h: 420,
  };
  const b = {
    x: 20, y: a.y + a.h + 60, w: panelW, h: 420,
  };
  return {
    vbW, a, b, readoutY: b.y + b.h + 40, totalH: b.y + b.h + 100,
  };
}

export function render(el, { theme = 'light', params = {} } = {}) {
  const pMode = params.mode || {};
  const pE = params.e || {};
  const pA = params.a || {};
  const pRho = params.rho || {};
  const pB = params.b || {};
  const pEll = params.ell || {};
  const pView = params.view || {};

  const state = {
    mode: pMode.default ?? 'S',
    eS: 3,
    aS: 30,
    eW: 4,
    aW: 20,
    rho: pRho.default ?? 0.5,
    b: pB.default ?? 60,
    ell: pEll.default ?? 2,
    view: pView.default ?? 'q-coordinates',
    theme,
  };

  clear(el);
  const root = htmlEl('div', { class: 'd3-figure' });
  el.appendChild(root);

  const svg = makeSvg([0, 0, 1080, 620], { ariaLabel: 'Whitney partitions: large cubes in the bulk, small cubes only at the boundary' });

  // The mode switch must sit ABOVE panel (A) (brief's LAYOUT): controls
  // are appended to `root` before `svg`, so they render first/above it.
  const controls = controlsBar();
  const modeCtl = buttonGroup({
    label: 'mode',
    options: [
      { value: 'S', label: 'S: standard cubes in an adapted cube' },
      { value: 'W', label: texSpan("W: $\\qq$-grid cubes in a $\\qq'$-grid cube", 'W: q-grid cubes in a q’-grid cube') },
    ],
    value: state.mode,
    onChange: (v) => { state.mode = v; rebuildControls(); redraw(); },
  });
  controls.appendChild(modeCtl.node);
  const dynControls = htmlEl('div', { class: 'fig-controls' });
  controls.appendChild(dynControls);

  function rebuildControls() {
    while (dynControls.firstChild) dynControls.removeChild(dynControls.firstChild);
    if (state.mode === 'S') {
      const eCtl = rangeControl({
        label: texSpan('$e$', 'e'), min: 1, max: 8, step: 0.1, value: state.eS, format: (v) => fmt(v, 1), onInput: (v) => { state.eS = v; redraw(); },
      });
      const aCtl = rangeControl({
        label: texSpan('$a$°', 'a°'), min: 0, max: 179, step: 1, value: state.aS, format: (v) => fmt(v, 0), onInput: (v) => { state.aS = v; redraw(); },
      });
      dynControls.appendChild(eCtl.node);
      dynControls.appendChild(aCtl.node);
    } else {
      const eCtl = rangeControl({
        label: texSpan('$e$', 'e'), min: 1, max: 6, step: 0.1, value: state.eW, format: (v) => fmt(v, 1), onInput: (v) => { state.eW = v; redraw(); },
      });
      const aCtl = rangeControl({
        label: texSpan('$a$°', 'a°'), min: 0, max: 179, step: 1, value: state.aW, format: (v) => fmt(v, 0), onInput: (v) => { state.aW = v; redraw(); },
      });
      const rhoCtl = rangeControl({
        label: texSpan('$\\rho$', 'ρ'), min: 0, max: 2, step: 0.05, value: state.rho, format: (v) => fmt(v, 2), onInput: (v) => { state.rho = v; redraw(); },
      });
      const bCtl = rangeControl({
        label: texSpan('$b$°', 'b°'), min: 0, max: 179, step: 1, value: state.b, format: (v) => fmt(v, 0), onInput: (v) => { state.b = v; redraw(); },
      });
      const ellCtl = buttonGroup({
        label: texSpan('$\\ell$', 'ell'),
        options: [1, 2, 3].map((v) => ({ value: v, label: String(v) })),
        value: state.ell,
        onChange: (v) => { state.ell = Number(v); redraw(); },
      });
      const viewCtl = buttonGroup({
        label: 'view',
        options: [{ value: 'q-coordinates', label: texSpan('$\\qq$-coordinates', 'q-coordinates') }, { value: 'Euclidean', label: 'Euclidean' }],
        value: state.view,
        onChange: (v) => { state.view = v; redraw(); },
      });
      [eCtl, aCtl, rhoCtl, bCtl].forEach((c) => dynControls.appendChild(c.node));
      dynControls.appendChild(ellCtl.node);
      dynControls.appendChild(viewCtl.node);
    }
  }
  rebuildControls();
  root.appendChild(controls);
  root.appendChild(svg);

  function redraw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const comp = state.mode === 'S' ? computeModeS(state.eS, state.aS) : computeModeW(state.eW, state.aW, state.rho, state.b, state.ell);

    const mode = measuredWidth(root) < NARROW_BREAKPOINT ? 'narrow' : 'wide';
    const boxes = layoutBoxes(mode, mode === 'wide' ? 1080 : 480);
    svg.setAttribute('viewBox', `0 0 ${boxes.vbW} ${boxes.totalH}`);

    // The computed partition and histogram are one schematic toy run, not
    // a general illustration of the theorem -- say so up top, not only
    // inside Mode S's lemma-bound formula (which is easy to read as "the
    // theorem's dimension" rather than "this run's dimension").
    svg.appendChild(texText(20, 20, `schematic toy run: $d=2$, mode ${state.mode}`, `schematic toy run: d = 2, mode ${state.mode}`, { size: 10.5, fill: COLOR.textDim }));

    const { scaleEls } = drawPartition(svg, boxes.a.x, boxes.a.y, boxes.a.w, boxes.a.h, state, comp, theme);
    const { barEls } = drawHistogram(svg, boxes.b.x, boxes.b.y, boxes.b.w, boxes.b.h, state, comp);

    // Bidirectional hover linking (brief: "hovering a bar highlights that
    // scale's squares in (A) and vice versa"). Each scale's squares are
    // one merged <path> (perf: the boundary layer alone can carry
    // thousands of squares), so "hovering a square" means hovering that
    // whole per-scale path.
    for (const [r, barEl] of barEls) {
      const squareEl = scaleEls.get(r);
      if (!squareEl) continue;
      const on = () => { barEl.setAttribute('stroke', COLOR.text); barEl.setAttribute('stroke-width', '1.5'); squareEl.setAttribute('stroke-width', '1.6'); squareEl.setAttribute('stroke', COLOR.text); };
      const off = () => { barEl.removeAttribute('stroke'); barEl.removeAttribute('stroke-width'); squareEl.setAttribute('stroke-width', '0.3'); squareEl.setAttribute('stroke', COLOR.gridA); };
      barEl.addEventListener('mouseenter', on);
      barEl.addEventListener('mouseleave', off);
      squareEl.addEventListener('mouseenter', on);
      squareEl.addEventListener('mouseleave', off);
    }

    let readoutItems;
    if (state.mode === 'S') {
      readoutItems = [
        { label: 'mode', value: 'S' }, { label: 'e', value: fmt(state.eS, 1) }, { label: 'a', value: `${fmt(state.aS, 0)}°` },
      ];
    } else {
      readoutItems = [
        { label: 'mode', value: 'W' },
        { label: 'e', value: fmt(state.eW, 1) },
        { label: 'a', value: `${fmt(state.aW, 0)}°` },
        { label: 'ρ', value: fmt(state.rho, 2) },
        { label: 'b', value: `${fmt(state.b, 0)}°` },
        { label: 'ell', value: state.ell },
        { label: 'view', value: state.view },
      ];
    }
    const rowY = boxes.readoutY;
    if (state.mode === 'W') {
      const readouts = [
        [`e(m) = ${fmt(eccOf(comp.m), 2)}`, `$\\mathfrak e(\\m)=${fmt(eccOf(comp.m), 2)}$`],
        [`e(m’) = ${fmt(eccOf(comp.mp), 2)}`, `$\\mathfrak e(\\m')=${fmt(eccOf(comp.mp), 2)}$`],
        [`d_pr([m],[m’]) = ${fmt(comp.dpr, 3)} (= ρ)`, `$d_{\\mathrm{pr}}([\\m],[\\m'])=${fmt(comp.dpr, 3)}$ $(=\\rho)$`],
        [`K(q,q’) = ${fmt(comp.K, 2)}`, `$K(\\qq,\\qq')=${fmt(comp.K, 2)}$`],
      ];
      const colW = Math.min(260, (boxes.vbW - 40) / 2);
      readouts.forEach(([r, tex], i) => {
        svg.appendChild(texText(20 + (i % 2) * colW, rowY + Math.floor(i / 2) * 16, tex, r, { size: 9.5, fill: COLOR.text }));
      });
    }

    const cap = snapshotControlsCaption(20, boxes.totalH - 8, readoutItems, { maxWidth: boxes.vbW - 40 });
    if (cap) svg.appendChild(cap);
  }

  function eccOf(M) {
    const { lo, hi } = eigSym(M);
    return Math.sqrt(hi / lo);
  }

  watchResize(root, redraw);
  redraw();
}
