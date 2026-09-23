// content/figures/fig.projective-step.yaml -- "The projective step: a
// bounded move along the geodesic toward the canonical metric". Toy run,
// d = 2, j* = 2.
//
// (a) the update follows the geodesic from m toward the target m_*, on
//     which projective distance from m grows linearly; the step stops
//     after distance epsilon, or at the target if that is closer;
// (b) because the step is bounded, the old and new rounded grids differ by
//     a bounded distortion even when both are very eccentric.

import {
  metric, roundQ, eigSym, invSqrtSym, sqrtSym, powSym, matMul, mapBox,
  projectiveDistance, distortionK, inv2, ellipseBoundary,
} from './lib/mat2.mjs';
import { boundingBox } from './lib/geom2d.mjs';
import {
  makeSvg, group, richText, fitTransform, rangeControl, controlsBar, fmt, COLOR, snapshotControlsCaption,
} from './lib/svgkit.mjs';
import { texText, texWrapped, texSpan } from './lib/texLabel.mjs';
import { clear, svgEl, htmlEl } from './lib/dom.mjs';
import { invariant, approxEqual } from './lib/assert.mjs';

const J_STAR = 2;

function polyPath(pts) {
  return `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')} Z`;
}

function logecc(M) {
  const { lo, hi } = eigSym(M);
  return 0.5 * Math.log(hi / lo);
}

function unitAreaEllipsePoints(M, center = [0, 0]) {
  const { lo, hi, vLo, vHi } = eigSym(M);
  const rx = Math.sqrt(hi);
  const ry = Math.sqrt(lo);
  const scale = (lo * hi) ** 0.25;
  return ellipseBoundary(center, ry / scale, rx / scale, vLo, vHi);
}

function computeState(s) {
  const m = metric(s.e_m, s.a_m);
  const mStar = metric(s.e_star, s.a_star);
  const iS = invSqrtSym(m);
  const T = matMul(matMul(iS, mStar), iS);
  const D = projectiveDistance(m, mStar);
  const theta = D <= 1e-12 ? 1 : Math.min(1, s.epsilon / D);
  const sS = sqrtSym(m);
  const mPlus = matMul(matMul(sS, powSym(T, theta)), sS);
  const q = roundQ(m, J_STAR);
  const qPlus = roundQ(mPlus, J_STAR);
  const qStar = roundQ(mStar, J_STAR);

  // MUST HOLD: recomputed d_pr([m],[m_+]) equals min(epsilon, D); the
  // logarithmic eccentricity increases by at most epsilon.
  const dRecomputed = projectiveDistance(m, mPlus);
  invariant(approxEqual(dRecomputed, Math.min(s.epsilon, D), 1e-9), `d_pr([m],[m_+]) = ${dRecomputed} != min(eps,D) = ${Math.min(s.epsilon, D)}`);
  invariant(logecc(mPlus) <= logecc(m) + s.epsilon + 1e-12, 'logarithmic eccentricity increased by more than epsilon');

  return {
    m, mStar, T, D, theta, mPlus, q, qPlus, qStar, epsilon: s.epsilon,
  };
}

function drawGeodesic(svg, x0, y0, w, h, s, st) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -10, '(a) geodesic in shape space', { anchor: 'middle', size: 12, fill: COLOR.textDim }));

  const rulerY = h * 0.62;
  const rulerX0 = 60;
  const rulerX1 = w - 60;
  const Dmax = Math.max(st.D, s.epsilon * 1.2, 0.15);
  const xAt = (d) => rulerX0 + (d / Dmax) * (rulerX1 - rulerX0);

  g.appendChild(svgEl('line', {
    x1: rulerX0, y1: rulerY, x2: rulerX1, y2: rulerY, stroke: COLOR.border, 'stroke-width': 1.2,
  }));
  for (let k = 1; xAt(k * s.epsilon) <= rulerX1 + 1; k += 1) {
    const x = xAt(k * s.epsilon);
    g.appendChild(svgEl('line', { x1: x, y1: rulerY - 5, x2: x, y2: rulerY + 5, stroke: COLOR.border }));
    g.appendChild(texText(x, rulerY + 18, k === 1 ? '$\\varepsilon$' : `$${k}\\varepsilon$`, k === 1 ? 'ε' : `${k}ε`, { anchor: 'middle', size: 8.5, fill: COLOR.textDim }));
  }

  const ellH = Math.min(h * 0.42, 90);
  function drawEllipseAt(M, d, color, opts = {}) {
    const cx = xAt(d);
    const cy = rulerY - ellH - 8;
    const pts = unitAreaEllipsePoints(M, [0, 0]).map(([px, py]) => [cx + px * 16, cy - py * 16]);
    g.appendChild(svgEl('path', {
      d: polyPath(pts), fill: 'none', stroke: color, 'stroke-width': opts.emph ? 2.2 : 1.3, 'stroke-dasharray': opts.dashed ? '5,4' : null,
    }));
    g.appendChild(svgEl('line', { x1: cx, y1: rulerY - 4, x2: cx, y2: rulerY + 4, stroke: color, 'stroke-width': 1.5 }));
    return cx;
  }

  for (const theta of [0.25, 0.5, 0.75]) {
    const sqrtM = sqrtSym(st.m);
    const mTheta = matMul(matMul(sqrtM, powSym(st.T, theta)), sqrtM);
    drawEllipseAt(mTheta, theta * st.D, COLOR.neutral, {});
  }
  g.appendChild(richText(xAt(0.5 * st.D), rulerY - ellH - 8 - 22, 'points of the geodesic', { anchor: 'middle', size: 8, fill: COLOR.neutral }));

  const mxAt = drawEllipseAt(st.m, 0, COLOR.gridA, { emph: true });
  const targetX = drawEllipseAt(st.mStar, st.D, COLOR.theorem, { dashed: true, emph: true });
  const plusD = st.theta * st.D;
  const plusX = drawEllipseAt(st.mPlus, plusD, COLOR.gridB, { emph: true });

  g.appendChild(texText(mxAt, rulerY + 32, '$\\m$', 'm', { anchor: 'middle', size: 10, fill: COLOR.gridA }));
  g.appendChild(texText(targetX, rulerY + 32, '$\\m_*$', 'm_*', { anchor: 'middle', size: 10, fill: COLOR.theorem }));
  if (Math.abs(plusD - st.D) > 1e-6) {
    g.appendChild(texText(plusX, rulerY + 32, '$\\m_+$', 'm_+', { anchor: 'middle', size: 10, fill: COLOR.gridB }));
  }

  // bracket m .. m_+, given its own clear row well below the m/m_*/m_+
  // name labels (they used to sit only 4px apart and overlap).
  const by = rulerY + 52;
  g.appendChild(svgEl('path', {
    d: `M${mxAt},${by} L${mxAt},${by + 6} L${plusX},${by + 6} L${plusX},${by}`, fill: 'none', stroke: COLOR.gridB, 'stroke-width': 1,
  }));
  g.appendChild(texWrapped((mxAt + plusX) / 2, by + 20, '$d_{\\mathrm{pr}}([\\m],[\\m_+])=\\theta\\,d_{\\mathrm{pr}}([\\m],[\\m_*])\\leq\\varepsilon$', 'd_pr([m],[m_+]) = θ d_pr([m],[m_*]) ≤ ε', {
    maxWidth: Math.max(plusX - mxAt + 160, 160), anchor: 'middle', size: 9, fill: COLOR.gridB, lineHeight: 11,
  }));

  if (st.D <= s.epsilon + 1e-9) {
    g.appendChild(texText(w / 2, h - 6, 'target reached: $\\m_+=\\m_*$', 'target reached: m_+ = m_*', { anchor: 'middle', size: 10, fill: COLOR.theorem }));
  }
}


function drawGrids(svg, x0, y0, w, h, st) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -10, '(b) rounded grids', { anchor: 'middle', size: 12, fill: COLOR.textDim }));

  const mainW = w * 0.42;
  // Bounding box from the ACTUAL boxes (their operator norms vary a lot
  // with eccentricity, up to ~2x it -- a fixed extent clips q_* off-canvas
  // for an eccentric target).
  const qBoxMath = mapBox(st.q, [0, 0], 0.5);
  const qPlusBoxMath = mapBox(st.qPlus, [0, 0], 0.5);
  const qStarBoxMath = mapBox(st.qStar, [0, 0], 0.5);
  const mainBbox = boundingBox([...qBoxMath, ...qPlusBoxMath, ...qStarBoxMath]);
  const t = fitTransform(mainBbox, { x0: 0, y0: 10, w: mainW, h: h - 10 }, { pad: 14 });
  const qPts = qBoxMath.map(t.toPx);
  const qPlusPts = qPlusBoxMath.map(t.toPx);
  const qStarPts = qStarBoxMath.map(t.toPx);
  g.appendChild(svgEl('path', { d: polyPath(qStarPts), fill: 'none', stroke: COLOR.neutral, 'stroke-width': 1.4, 'stroke-dasharray': '4,3' }));
  g.appendChild(svgEl('path', { d: polyPath(qPlusPts), fill: 'none', stroke: COLOR.gridB, 'stroke-width': 1.8 }));
  g.appendChild(svgEl('path', { d: polyPath(qPts), fill: 'none', stroke: COLOR.gridA, 'stroke-width': 1.8 }));
  g.appendChild(texWrapped(4, h - 8, '$\\qq$ (grid A), $\\qq_+$ (grid B), $\\qq_*$ (neutral dashed) – Euclidean coordinates, same scale', 'q (grid A), q_+ (grid B), q_* (neutral dashed) -- Euclidean coordinates, same scale', {
    maxWidth: mainW - 8, size: 8, fill: COLOR.textDim, lineHeight: 9.5,
  }));

  // inset: in q-coordinates.
  const insX0 = mainW + 20;
  const insW = mainW * 0.62;
  g.appendChild(svgEl('rect', {
    x: insX0, y: 10, width: insW, height: h - 40, fill: 'none', stroke: COLOR.border, 'stroke-width': 1,
  }));
  g.appendChild(texText(insX0 + 4, 22, 'in $\\qq$-coordinates', 'in q-coordinates', { size: 8, fill: COLOR.textDim }));
  const qInv = inv2(st.q);
  const A_plus = matMul(qInv, st.qPlus);
  const A_star = matMul(qInv, st.qStar);
  const cu0Math = mapBox({
    a: 1, b: 0, c: 0, d: 1,
  }, [0, 0], 0.5);
  const aPlusBoxMath = mapBox(A_plus, [0, 0], 0.5);
  const aStarBoxMath = mapBox(A_star, [0, 0], 0.5);
  const insetBbox = boundingBox([...cu0Math, ...aPlusBoxMath, ...aStarBoxMath]);
  const it = fitTransform(insetBbox, {
    x0: insX0, y0: 30, w: insW, h: h - 66,
  }, { pad: 12 });
  const cu0 = cu0Math.map(it.toPx);
  const aPlusPts = aPlusBoxMath.map(it.toPx);
  const aStarPts = aStarBoxMath.map(it.toPx);
  g.appendChild(svgEl('path', { d: polyPath(cu0), fill: 'none', stroke: COLOR.gridA, 'stroke-width': 1 }));
  g.appendChild(svgEl('path', { d: polyPath(aStarPts), fill: 'none', stroke: COLOR.neutral, 'stroke-width': 1.3, 'stroke-dasharray': '3,2' }));
  g.appendChild(svgEl('path', { d: polyPath(aPlusPts), fill: 'none', stroke: COLOR.gridB, 'stroke-width': 1.6 }));

  // readouts to the right.
  const readX = insX0 + insW + 20;
  const readW = w - readX;
  const K_one = distortionK(st.q, st.qPlus);
  const K_target = distortionK(st.q, st.qStar);
  const leccM = logecc(st.m);
  const leccMPlus = logecc(st.mPlus);
  const rows = [
    [`D = d_pr([m],[m_*]) = ${fmt(st.D, 3)}`, `$D=d_{\\mathrm{pr}}([\\m],[\\m_*])=${fmt(st.D, 3)}$`],
    [`θ = ${fmt(st.theta, 3)}`, `$\\theta=${fmt(st.theta, 3)}$`],
    [`logecc(m) = ${fmt(leccM, 3)}`, `$\\operatorname{logecc}(\\m)=${fmt(leccM, 3)}$`],
    [`logecc(m_+) = ${fmt(leccMPlus, 3)}`, `$\\operatorname{logecc}(\\m_+)=${fmt(leccMPlus, 3)}$`],
    [`difference = ${fmt(leccMPlus - leccM, 3)} (increase ≤ ε = ${fmt(st.epsilon, 2)})`,
      `difference $=${fmt(leccMPlus - leccM, 3)}$ (increase $\\leq\\varepsilon=${fmt(st.epsilon, 2)}$)`],
    [`K(q,q_+) = ${fmt(K_one, 2)} -- one step`, `$K(\\qq,\\qq_+)=${fmt(K_one, 2)}$ – one step`],
    [`K(q,q_*) = ${fmt(K_target, 2)} -- target grid, for comparison`, `$K(\\qq,\\qq_*)=${fmt(K_target, 2)}$ – target grid, for comparison`],
  ];
  rows.forEach(([r, tex], i) => {
    g.appendChild(texWrapped(readX, 26 + i * 22, tex, r, {
      maxWidth: readW, size: 9, fill: COLOR.text, lineHeight: 11,
    }));
  });
}

export function render(el, { theme = 'light', params = {} } = {}) {
  const pEm = params.e_m || {};
  const pAm = params.a_m || {};
  const pEs = params.e_star || {};
  const pAs = params.a_star || {};
  const pEps = params.epsilon || {};

  const state = {
    e_m: pEm.default ?? 3,
    a_m: pAm.default ?? 10,
    e_star: pEs.default ?? 5,
    a_star: pAs.default ?? 80,
    epsilon: pEps.default ?? 0.3,
  };

  clear(el);
  const root = htmlEl('div', { class: 'd3-figure' });
  el.appendChild(root);

  const W = 1040;
  const H = 560;
  const svg = makeSvg([0, 0, W, H], { ariaLabel: 'The projective step: a bounded move along the geodesic toward the canonical metric' });
  root.appendChild(svg);

  const controls = controlsBar();
  root.appendChild(controls);
  const mk = (label, key, p, def, min, max, step) => rangeControl({
    label,
    min: p.range ? p.range[0] : min,
    max: p.range ? p.range[1] : max,
    step: p.step ?? step,
    value: state[key],
    format: (v) => fmt(v, key === 'epsilon' ? 2 : 1),
    onInput: (v) => { state[key] = v; redraw(); },
  });
  const cEm = mk(texSpan('$e_{\\m}$', 'e_m'), 'e_m', pEm, 3, 1, 8, 0.1);
  const cAm = rangeControl({
    label: texSpan('$a_{\\m}$°', 'a_m°'), min: 0, max: 179, step: 1, value: state.a_m, format: (v) => fmt(v, 0), onInput: (v) => { state.a_m = v; redraw(); },
  });
  const cEs = mk(texSpan('$e_*$', 'e_*'), 'e_star', pEs, 5, 1, 8, 0.1);
  const cAs = rangeControl({
    label: texSpan('$a_*$°', 'a_*°'), min: 0, max: 179, step: 1, value: state.a_star, format: (v) => fmt(v, 0), onInput: (v) => { state.a_star = v; redraw(); },
  });
  const cEps = rangeControl({
    label: texSpan('$\\varepsilon$', 'ε'), min: pEps.range ? pEps.range[0] : 0.05, max: pEps.range ? pEps.range[1] : 1, step: pEps.step ?? 0.05, value: state.epsilon, format: (v) => fmt(v, 2), onInput: (v) => { state.epsilon = v; redraw(); },
  });
  [cEm, cAm, cEs, cAs, cEps].forEach((c) => controls.appendChild(c.node));

  function redraw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const st = computeState(state);

    const header = group(16, 20);
    svg.appendChild(header);
    header.appendChild(texWrapped(
      0,
      0,
      'target label: $\\m_*=\\cmet(\\bfAhom_{n+2L,\\qq})$ – a label only; the target here is set by the sliders',
      'target label: m_* = cmet(Ahom_{n+2L,q}) -- a label only; the target here is set by the sliders',
      { maxWidth: W - 32, size: 10, fill: COLOR.textDim, lineHeight: 12 },
    ));
    header.appendChild(texText(0, 26, 'schematic toy run: $d=2$, $j_*=2$', 'schematic toy run: d = 2, j* = 2', { size: 9.5, fill: COLOR.textDim }));

    drawGeodesic(svg, 20, 60, W - 40, 220, state, st);
    drawGrids(svg, 20, 320, W - 40, 190, st);

    const cap = snapshotControlsCaption(20, H - 8, [
      { label: 'e_m', value: fmt(state.e_m, 1) },
      { label: 'a_m', value: `${fmt(state.a_m, 0)}°` },
      { label: 'e_*', value: fmt(state.e_star, 1) },
      { label: 'a_*', value: `${fmt(state.a_star, 0)}°` },
      { label: 'ε', value: fmt(state.epsilon, 2) },
    ], { maxWidth: W - 40 });
    if (cap) svg.appendChild(cap);
  }

  redraw();
}
