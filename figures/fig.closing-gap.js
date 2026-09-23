// content/figures/fig.closing-gap.yaml -- "Closing the duality gap once:
// the unknown gap on both sides of the bound". Schematic, no numeric axes
// beyond the illustrative cutoff/rearrangement panels' own toy values.
//
// (a) where the response step happens (the selected interval, schematic);
// (b) the cutoff comparison between the terminal cube and its scale-s
//     cells (an ILLUSTRATIVE cutoff, not the paper's own);
// (c) the self-improving inequality: kappa_t - 1 <= omega * kappa_t, the
//     same unknown kappa_t on both sides, rearranged to bound it.

import {
  makeSvg, group, richText, rangeControl, buttonGroup, controlsBar, fmt, COLOR, tint, snapshotControlsCaption,
  measuredWidth, watchResize,
} from './lib/svgkit.mjs';
import { texText, texWrapped, texSpan } from './lib/texLabel.mjs';
import { clear, svgEl, htmlEl } from './lib/dom.mjs';
import { invariant, approxEqual } from './lib/assert.mjs';

/** C^1 plateau: 0 at 0 and 1, smoothstep ramp of width `ramp` at each end,
 * 1 in between. */
function plateau(u, ramp) {
  if (u <= 0 || u >= 1) return 0;
  if (u < ramp) {
    const t = u / ramp;
    return 3 * t * t - 2 * t * t * t;
  }
  if (u > 1 - ramp) {
    const t = (1 - u) / ramp;
    return 3 * t * t - 2 * t * t * t;
  }
  return 1;
}

function meanPlateauSquared(ramp, n = 400) {
  let s = 0;
  for (let i = 0; i < n; i += 1) {
    const u = (i + 0.5) / n;
    s += plateau(u, ramp);
  }
  const meanP = s / n;
  return meanP * meanP;
}

function makeCutoff(ramp) {
  const c = meanPlateauSquared(ramp);
  return {
    c,
    phi: (x, y) => (plateau(x, ramp) * plateau(y, ramp)) / c,
  };
}

function cellAverage1D(phiAt, x0, x1, n = 6) {
  let s = 0;
  for (let i = 0; i < n; i += 1) {
    const x = x0 + ((i + 0.5) / n) * (x1 - x0);
    s += phiAt(x);
  }
  return s / n;
}

function drawInterval(svg, x0, y0, w, h, theme) {
  const g = group(x0, y0);
  svg.appendChild(g);
  const axisY = h * 0.55;
  const jStarX = 0.04 * w;
  const sX = 0.5 * w;
  const tX = 0.86 * w;
  g.appendChild(svgEl('rect', {
    x: sX, y: axisY - 8, width: tX - sX, height: 16, fill: tint('theorem', 0.22, theme),
  }));
  g.appendChild(svgEl('line', {
    x1: jStarX, y1: axisY, x2: tX + 0.06 * w, y2: axisY, stroke: COLOR.border, 'stroke-width': 1.4,
  }));
  for (const [x, label, tex] of [[jStarX, 'j*', '$j_*$'], [sX, 's', '$s$'], [tX, 't = s+H', '$t=s+H$']]) {
    g.appendChild(svgEl('line', { x1: x, y1: axisY - 5, x2: x, y2: axisY + 5, stroke: COLOR.text }));
    g.appendChild(texText(x, axisY + 20, tex, label, { anchor: 'middle', size: 10.5, fill: COLOR.text }));
  }
  g.appendChild(texText(
    sX + (tX - sX) / 2,
    axisY - 34,
    'grid $\\qq=\\mathcal Q(\\cmet(F))$, $\\bfAhom_{s,\\qq}$ close to $F$',
    'grid q = Q(cmet(F)), Ahom_{s,q} close to F',
    { anchor: 'middle', size: 9.5, fill: COLOR.textDim },
  ));
  g.appendChild(texText(
    sX + (tX - sX) / 2,
    axisY - 20,
    '$d^{-1}\\Delta_{s,t}^{\\qq}<\\sigma$; small histories and drift',
    'd^(-1) Δ_{s,t}^{q} < σ; small histories and drift',
    { anchor: 'middle', size: 9.5, fill: COLOR.textDim },
  ));
  g.appendChild(texText(sX + (tX - sX) / 2, axisY + 40, '$1\\leq\\kappa_t\\leq\\kappa_s\\leq r^2\\kappa_t$,\u2002$r<e^{d\\sigma}$', '1 ≤ κ_t ≤ κ_s ≤ r^2 κ_t,  r < e^(dσ)', {
    anchor: 'middle', size: 10, fill: COLOR.text,
  }));
}

function drawCutoffPanel(svg, x0, y0, w, h, {
  H, ramp, theme,
}) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -8, '(b) cutoff and cells', { anchor: 'middle', size: 12, fill: COLOR.textDim }));

  const { c, phi } = makeCutoff(ramp);
  const maxPhi = 1 / c;
  invariant(maxPhi <= 2 + 1e-6, `max phi = ${maxPhi} exceeds 2`);
  const meanCheck = meanPlateauSquared(ramp) / c;
  invariant(approxEqual(meanCheck, 1, 1e-6), 'mean phi is not 1');
  // MUST HOLD: phi >= 0 (explicit, not just "the formula is nonnegative"),
  // sampled on a grid fine enough to catch a sign bug anywhere on [0,1]^2.
  for (let i = 0; i <= 20; i += 1) {
    for (let j = 0; j <= 20; j += 1) {
      invariant(phi(i / 20, j / 20) >= -1e-9, `phi(${i / 20},${j / 20}) is negative`);
    }
  }

  const nCells = 3 ** H;
  invariant(Number.isInteger(nCells), 'cell count is not an integer power of 3');

  const sq = 250;
  const sqX = 20;
  const sqY = 24;
  const cellPx = sq / nCells;
  const gridStep = H >= 5 ? 3 : 1; // "for H >= 5 draw every third line only"

  // heatmap: sequential neutral -> theorem colour via fill-opacity of a
  // single hue (theme tokens only -- no interpolated hex).
  const heatN = 32;
  const heatCell = sq / heatN;
  for (let i = 0; i < heatN; i += 1) {
    for (let j = 0; j < heatN; j += 1) {
      const x = (i + 0.5) / heatN;
      const y = (j + 0.5) / heatN;
      const v = Math.min(phi(x, y) / 2, 1); // 0..2 -> 0..1
      g.appendChild(svgEl('rect', {
        x: sqX + i * heatCell, y: sqY + (heatN - 1 - j) * heatCell, width: heatCell + 0.5, height: heatCell + 0.5,
        fill: tint('theorem', Number(v.toFixed(3)), theme),
      }));
    }
  }
  // cell grid lines (low opacity; every gridStep-th line for H >= 5).
  for (let i = 0; i <= nCells; i += gridStep) {
    const x = sqX + i * cellPx;
    g.appendChild(svgEl('line', {
      x1: x, y1: sqY, x2: x, y2: sqY + sq, stroke: COLOR.border, 'stroke-width': 0.5, opacity: 0.5,
    }));
    const y = sqY + sq - i * cellPx;
    g.appendChild(svgEl('line', {
      x1: sqX, y1: y, x2: sqX + sq, y2: y, stroke: COLOR.border, 'stroke-width': 0.5, opacity: 0.5,
    }));
  }
  g.appendChild(svgEl('rect', {
    x: sqX, y: sqY, width: sq, height: sq, fill: 'none', stroke: COLOR.text, 'stroke-width': 1.4,
  }));
  g.appendChild(texText(sqX + 4, sqY + 12, '$U_t$', 'U_t', { size: 9.5, fill: COLOR.text }));
  // slice line at y = 0.5.
  const sliceY = sqY + sq / 2;
  g.appendChild(svgEl('line', {
    x1: sqX, y1: sliceY, x2: sqX + sq, y2: sliceY, stroke: COLOR.text, 'stroke-width': 1, 'stroke-dasharray': '3,2',
  }));
  // Labelled just inside the square's own right edge, not in the gap
  // toward the magnifier: at this square's width that gap is too narrow
  // for the label's text width, so it used to overlap the magnifier's
  // left border and its first curve/step segment.
  g.appendChild(texText(sqX + sq - 4, sliceY - 4, '$y=1/2$', 'y=1/2', { anchor: 'end', size: 9, fill: COLOR.textDim }));
  // One label, wrapped to the square's width: the coordinates note and the cell
  // count used to be two labels on nearly the same line, and they collided
  // wherever the text rendered wider than it measured.
  g.appendChild(texWrapped(sqX, 9, `$\\qq$-coordinates; cells of side $3^s=3^{t-H}$ $(${nCells}\\times${nCells})$`, `q-coordinates; cells of side 3^s = 3^(t-H) (${nCells}×${nCells})`, {
    maxWidth: sq, size: 9.5, fill: COLOR.textDim, lineHeight: 11,
  }));

  // profile: phi(x, 0.5) smooth curve + cell averages step function.
  const profX = sqX;
  const profW = sq;
  const profY0 = sqY + sq + 46;
  const profH = 60;
  const phiAtSlice = (x) => phi(x, 0.5);
  const pathPts = [];
  const nSamp = 160;
  for (let i = 0; i <= nSamp; i += 1) {
    const x = i / nSamp;
    const v = phiAtSlice(x);
    pathPts.push([profX + x * profW, profY0 + profH - (v / 2) * profH]);
  }
  g.appendChild(svgEl('path', {
    d: `M${pathPts.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' L')}`,
    fill: 'none', stroke: COLOR.theorem, 'stroke-width': 1.6,
  }));
  for (let i = 0; i < nCells; i += 1) {
    const x0c = i / nCells;
    const x1c = (i + 1) / nCells;
    const avg = cellAverage1D(phiAtSlice, x0c, x1c);
    const px0 = profX + x0c * profW;
    const px1 = profX + x1c * profW;
    const py = profY0 + profH - (avg / 2) * profH;
    g.appendChild(svgEl('line', {
      x1: px0, y1: py, x2: px1, y2: py, stroke: COLOR.gridA, 'stroke-width': 1.6,
    }));
  }
  g.appendChild(svgEl('line', {
    x1: profX, y1: profY0 + profH, x2: profX + profW, y2: profY0 + profH, stroke: COLOR.border, 'stroke-width': 1,
  }));
  g.appendChild(texText(profX, profY0 - 6, 'profile along the slice: $\\varphi$ (curve) vs. cell averages (steps)', 'profile along the slice: φ (curve) vs. cell averages (steps)', {
    size: 9.5, fill: COLOR.textDim,
  }));

  // magnifier around the steepest point of the first ramp (u = ramp/2).
  const magX0 = sqX + sq + 20;
  const magY0 = sqY + 26;
  const magW = 200;
  const magH = 120;
  const steepU = ramp / 2;
  const cellIdx = Math.floor(steepU * nCells);
  const loCell = Math.max(cellIdx - 2, 0);
  const hiCell = Math.min(cellIdx + 3, nCells);
  const xLo = loCell / nCells;
  const xHi = hiCell / nCells;
  g.appendChild(svgEl('rect', {
    x: magX0, y: magY0, width: magW, height: magH, fill: 'none', stroke: COLOR.border, 'stroke-width': 1,
  }));
  const magPts = [];
  const nMag = 60;
  for (let i = 0; i <= nMag; i += 1) {
    const x = xLo + (i / nMag) * (xHi - xLo);
    const v = phiAtSlice(x);
    magPts.push([magX0 + (i / nMag) * magW, magY0 + magH - Math.min(v / 2, 1) * magH]);
  }
  g.appendChild(svgEl('path', {
    d: `M${magPts.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' L')}`,
    fill: 'none', stroke: COLOR.theorem, 'stroke-width': 1.4,
  }));
  for (let i = loCell; i < hiCell; i += 1) {
    const x0c = i / nCells;
    const x1c = (i + 1) / nCells;
    const avg = cellAverage1D(phiAtSlice, x0c, x1c);
    const px0 = magX0 + ((x0c - xLo) / (xHi - xLo)) * magW;
    const px1 = magX0 + ((x1c - xLo) / (xHi - xLo)) * magW;
    const py = magY0 + magH - Math.min(avg / 2, 1) * magH;
    g.appendChild(svgEl('line', {
      x1: px0, y1: py, x2: px1, y2: py, stroke: COLOR.gridA, 'stroke-width': 1.8,
    }));
  }
  g.appendChild(richText(magX0 + magW / 2, magY0 + magH + 16, 'within-cell oscillation (magnified)', {
    anchor: 'middle', size: 9, fill: COLOR.textDim,
  }));
  g.appendChild(texWrapped(magX0 + magW / 2, sqY, 'illustrative cutoff: $0\\leq\\varphi\\leq2$, average one, varying on the scale $3^t$', 'illustrative cutoff: 0≤φ≤2, average one, varying on the scale 3^t', {
    maxWidth: magW + 20, anchor: 'middle', size: 9.5, fill: COLOR.textDim, lineHeight: 11,
  }));
}

function drawRearrangement(svg, x0, y0, w, h, { omega, theme }) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -8, '(c) rearrangement', { anchor: 'middle', size: 12, fill: COLOR.textDim }));

  const crossing = 1 / (1 - omega);
  const xMax = Math.max(6, 1.2 * crossing);
  const yMax = xMax - 1;
  const plotX0 = 44;
  const plotW = w - 60;
  const plotY0 = 20;
  const plotH = h - 70;
  // Domain is [1, xMax] -- kappa_t is a "least number kappa_u >= 1"
  // (cg.1), not a proper answer below 1, so the axis must not extend down
  // to 0. With this domain kappa_t - 1 is exactly its own drawn value: no
  // max(kappa_t-1, 0) clamp is needed or drawn.
  const xAt = (v) => plotX0 + ((v - 1) / (xMax - 1)) * plotW;
  const yAt = (v) => plotY0 + plotH - (v / yMax) * plotH;

  invariant(approxEqual(crossing, 1 / (1 - omega), 1e-9), 'crossing point mismatch');

  // shaded region where kappa_t - 1 <= omega * kappa_t, i.e. [1, crossing].
  g.appendChild(svgEl('rect', {
    x: xAt(1), y: plotY0 + plotH - 6, width: xAt(Math.min(crossing, xMax)) - xAt(1), height: 6, fill: tint('theorem', 0.35, theme),
  }));

  g.appendChild(svgEl('line', {
    x1: plotX0, y1: plotY0 + plotH, x2: plotX0 + plotW, y2: plotY0 + plotH, stroke: COLOR.border, 'stroke-width': 1,
  }));
  g.appendChild(svgEl('line', {
    x1: plotX0, y1: plotY0, x2: plotX0, y2: plotY0 + plotH, stroke: COLOR.border, 'stroke-width': 1,
  }));
  for (const tick of [1, 2, 3, 4, 5, 6]) {
    if (tick > xMax) continue;
    g.appendChild(svgEl('line', { x1: xAt(tick), y1: plotY0 + plotH, x2: xAt(tick), y2: plotY0 + plotH + 5, stroke: COLOR.border }));
    g.appendChild(richText(xAt(tick), plotY0 + plotH + 16, String(tick), { anchor: 'middle', size: 9, fill: COLOR.textDim }));
  }
  g.appendChild(texText(plotX0 + plotW / 2, plotY0 + plotH + 32, '$\\kappa_t$', 'κ_t', { anchor: 'middle', size: 10.5, fill: COLOR.text }));

  const lineA = [];
  const lineB = [];
  const nSamp = 60;
  for (let i = 0; i <= nSamp; i += 1) {
    const k = 1 + (i / nSamp) * (xMax - 1);
    lineA.push([xAt(k), yAt(k - 1)]);
    lineB.push([xAt(k), yAt(omega * k)]);
  }
  g.appendChild(svgEl('path', {
    d: `M${lineA.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' L')}`,
    fill: 'none', stroke: COLOR.gridA, 'stroke-width': 2,
  }));
  g.appendChild(svgEl('path', {
    d: `M${lineB.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' L')}`,
    fill: 'none', stroke: COLOR.theorem, 'stroke-width': 2, 'stroke-dasharray': '5,4',
  }));
  const kLabelA = 1 + 0.8 * (xMax - 1);
  const kLabelB = 1 + 0.55 * (xMax - 1);
  g.appendChild(texText(xAt(kLabelA), yAt(kLabelA - 1) - 8, '$\\kappa_t-1$', 'κ_t−1', { size: 10, fill: COLOR.gridA, halo: true }));
  g.appendChild(texText(xAt(kLabelB), yAt(omega * kLabelB) - 8, '$\\omega\\kappa_t$', 'ωκ_t', { size: 10, fill: COLOR.theorem, halo: true }));

  if (crossing <= xMax) {
    const cx = xAt(crossing);
    g.appendChild(svgEl('line', {
      x1: cx, y1: plotY0, x2: cx, y2: plotY0 + plotH, stroke: COLOR.text, 'stroke-width': 1, 'stroke-dasharray': '2,2',
    }));
    g.appendChild(texText(cx, plotY0 - 4, `$1/(1-\\omega)=${fmt(crossing, 3)}$`, `1/(1−ω)=${fmt(crossing, 3)}`, { anchor: 'middle', size: 9, fill: COLOR.text }));
  }

  g.appendChild(texText(plotX0, plotY0 + plotH + 46, 'the same unknown $\\kappa_t$ on both sides', 'the same unknown κ_t on both sides', { size: 10, fill: COLOR.textDim }));
  g.appendChild(texText(
    plotX0,
    plotY0 + plotH + 60,
    `$\\kappa_t-1\\leq\\omega/(1-\\omega)=${fmt(omega / (1 - omega), 3)}$`,
    `κ_t−1 ≤ ω/(1−ω) = ${fmt(omega / (1 - omega), 3)}`,
    { size: 10.5, fill: COLOR.text },
  ));
}

const NARROW_BREAKPOINT = 760;

function layoutBoxes(mode, vbW, stripH) {
  const panelY = stripH + 30;
  if (mode === 'wide') {
    return {
      vbW,
      b: { x: 20, y: panelY, w: 540, h: 430 },
      c: { x: 600, y: panelY, w: 380, h: 430 },
      totalH: panelY + 430 + 20,
    };
  }
  const bw = Math.max(vbW - 40, 560); // panel (b)'s own content needs ~520px
  const b = {
    x: 20, y: panelY, w: bw, h: 430,
  };
  const c = {
    x: 20, y: panelY + b.h + 40, w: Math.max(vbW - 40, 400), h: 340,
  };
  return {
    vbW: Math.max(vbW, bw + 40), b, c, totalH: c.y + c.h + 20,
  };
}

export function render(el, { theme = 'light', params = {} } = {}) {
  const pH = params.H || {};
  const pOmega = params.omega || {};
  const pRamp = params.ramp || {};
  const state = {
    H: pH.default ?? 4,
    omega: pOmega.default ?? 0.25,
    ramp: pRamp.default ?? 0.15,
  };

  clear(el);
  const root = htmlEl('div', { class: 'd3-figure' });
  el.appendChild(root);

  const svg = makeSvg([0, 0, 1000, 560], { ariaLabel: 'Closing the duality gap once: the selected interval, the cutoff comparison, and the self-improving inequality' });

  const controls = controlsBar();
  const hCtl = buttonGroup({
    label: texSpan('$H$', 'H'),
    options: (pH.values || [4, 5, 6]).map((v) => ({ value: v, label: String(v) })),
    value: state.H,
    onChange: (v) => { state.H = Number(v); redraw(); },
  });
  const omegaCtl = rangeControl({
    label: texSpan('$\\omega$', 'ω'),
    min: pOmega.range ? pOmega.range[0] : 0.02,
    max: pOmega.range ? pOmega.range[1] : 0.9,
    step: pOmega.step ?? 0.01,
    value: state.omega,
    format: (v) => fmt(v, 2),
    onInput: (v) => { state.omega = v; redraw(); },
  });
  controls.appendChild(hCtl.node);
  controls.appendChild(omegaCtl.node);
  root.appendChild(controls);
  root.appendChild(svg);

  function redraw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const stripH = 96;
    const mode = measuredWidth(root) < NARROW_BREAKPOINT ? 'narrow' : 'wide';
    const boxes = layoutBoxes(mode, mode === 'wide' ? 1000 : 480, stripH);
    svg.setAttribute('viewBox', `0 0 ${boxes.vbW} ${boxes.totalH}`);

    drawInterval(svg, 20, 10, boxes.vbW - 40, stripH, theme);
    drawCutoffPanel(svg, boxes.b.x, boxes.b.y, boxes.b.w, boxes.b.h, {
      H: state.H, ramp: state.ramp, theme,
    });
    drawRearrangement(svg, boxes.c.x, boxes.c.y, boxes.c.w, boxes.c.h, { omega: state.omega, theme });

    const cap = snapshotControlsCaption(20, boxes.totalH - 8, [
      { label: 'H', value: state.H },
      { label: 'ω', value: fmt(state.omega, 2) },
    ], { maxWidth: boxes.vbW - 40 });
    if (cap) svg.appendChild(cap);
  }

  watchResize(root, redraw);
  redraw();
}
