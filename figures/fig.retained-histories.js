// fig.retained-histories (content/figures/fig.retained-histories.yaml):
// QUANTITATIVE -- every plotted value is one of the cited weight formulas,
// evaluated exactly (no toy choices here). Two panels in ONE <svg> (see
// fig.polynomial-entry.js's header comment for why).
//
// `d3` is the global from vendor/d3.min.js -- no import here.
/* global d3 */

import {
  cssVar, assert, showAssertionError, makeSelectControl, makeSliderControl, drawSnapshotCaption,
} from './lib/theme.mjs';
import { d3TexLabel } from './lib/texLabel.mjs';

const ROLE = {
  fluc: cssVar('--series-violet'),
  mean: cssVar('--accent-2'),
  drift: cssVar('--draft'),
};

function ceilDiv(a, b) { return Math.floor((a + b - 1) / b); }

/**
 * Q, rho_max computed with exact integer arithmetic (fig.retained-
 * histories.yaml PARAMETERS): gamma = g/100 for an integer percentage g;
 * Q = 2*ceilDiv(200*(d+1), 100-g); rho_max = gamma + (d + (1-gamma)/4)/Q.
 */
export function computeParams(d, g) {
  const Q = 2 * ceilDiv(200 * (d + 1), 100 - g);
  const gamma = g / 100;
  const rhoMax = gamma + (d + (1 - gamma) / 4) / Q;
  const qRhoMaxMinusD = Q * rhoMax - d;
  return {
    d, g, gamma, Q, rhoMax, qRhoMaxMinusD,
  };
}

function checkMustHold(p) {
  assert(Number.isInteger(p.Q) && p.Q > 0, 'Q must be a positive integer, computed exactly');
  assert(p.qRhoMaxMinusD >= (1 - p.gamma) / 4 - 1e-9, 'Q*rho_max - d must be >= (1/4)(1-gamma)');
}

const LOG3_CLIP = -12;

function clipLog3(v) { return Math.max(LOG3_CLIP, v); }

function drawClipArrow(g, x, yAtClip, label) {
  g.append('path').attr('d', `M ${x - 3} ${yAtClip - 6} L ${x} ${yAtClip} L ${x + 3} ${yAtClip - 6}`)
    .attr('fill', 'none').attr('stroke', cssVar('--text-faint'));
  if (label) {
    g.append('text').attr('x', x).attr('y', yAtClip + 10).attr('font-size', 7).attr('text-anchor', 'middle')
      .attr('fill', cssVar('--text-faint')).text(label);
  }
}

const DASH = { fluc: null, mean: '5,3', drift: '1,3' };

/** The y-axis name, upright along the axis at the panel's left edge (left
 * of the tick numbers). Above the plot it collided with the panel title,
 * the "restart scale n" marker and the carried-history label. */
function yAxisName(g, box, plot) {
  const cx = box.x + 3;
  const cy = plot.y + plot.h / 2;
  d3TexLabel(g, {
    x: cx, y: cy, anchor: 'middle', size: 8, fill: cssVar('--text-faint'), plain: true, transform: `rotate(-90, ${cx}, ${cy})`,
  }, '$\\log_3(\\text{weight})$', 'log_3(weight)');
}

function drawPanelA(g, box, p) {
  d3TexLabel(g, {
    x: box.x, y: box.y, size: 12, weight: 600, fill: cssVar('--text'), plain: true,
  }, 'Decay of the weights with the lag $m-j$', 'Decay of the weights with the lag m-j');

  const plot = {
    x: box.x + 26, y: box.y + 16, w: box.w - 40, h: box.h - 40,
  };
  const x = d3.scaleLinear().domain([0, 30]).range([plot.x, plot.x + plot.w]);
  const y = d3.scaleLinear().domain([LOG3_CLIP, 0]).range([plot.y + plot.h, plot.y]);

  g.append('line').attr('x1', plot.x).attr('x2', plot.x + plot.w).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', cssVar('--border'));
  g.append('line').attr('x1', plot.x).attr('x2', plot.x).attr('y1', plot.y).attr('y2', plot.y + plot.h).attr('stroke', cssVar('--border'));
  [0, -4, -8, -12].forEach((t) => {
    g.append('text').attr('x', plot.x - 4).attr('y', y(t) + 3).attr('text-anchor', 'end').attr('font-size', 7.5)
      .attr('fill', cssVar('--text-faint')).text(t);
  });
  // Numeric lag ticks (previously absent).
  for (let lag = 0; lag <= 30; lag += 5) {
    g.append('line').attr('x1', x(lag)).attr('x2', x(lag)).attr('y1', plot.y + plot.h).attr('y2', plot.y + plot.h + 3)
      .attr('stroke', cssVar('--text-faint'));
    g.append('text').attr('x', x(lag)).attr('y', plot.y + plot.h + 13).attr('text-anchor', 'middle').attr('font-size', 7)
      .attr('fill', cssVar('--text-faint')).text(lag);
  }
  d3TexLabel(g, {
    x: plot.x + plot.w, y: plot.y + plot.h + 26, anchor: 'end', size: 8, fill: cssVar('--text-faint'), plain: true,
  }, 'lag $m-j$', 'lag m-j');
  yAxisName(g, box, plot);

  const series = [
    {
      role: 'fluc', name: 'fluctuation history', minLag: 0, f: (lag) => -p.Q * p.rhoMax * lag,
    },
    {
      role: 'mean', name: 'mean history', minLag: 1, f: (lag) => -0.25 * (1 - p.gamma) * (lag - 1),
    },
    {
      role: 'drift', name: 'drift', minLag: 0, f: (lag) => -0.125 * (1 - p.gamma) * lag,
    },
  ];
  for (const s of series) {
    // The line is drawn with its REAL (unclamped) values up to the exact
    // lag where it crosses the clip floor -12 -- not clamped pointwise and
    // then flattened out to lag 30 (audit feedback: that distorted the
    // final descending segment and put the clip arrow at lag 30 instead
    // of the actual crossing point). Every one of these formulas is
    // linear in lag, so the crossing lag solves in closed form.
    const slope = s.f(s.minLag) - s.f(s.minLag + 1); // > 0: weight decreases with lag
    const crossingLag = slope > 0 ? s.minLag + (s.f(s.minLag) - LOG3_CLIP) / slope : Infinity;
    const lastLag = Math.min(30, crossingLag);
    const pts = [];
    for (let lag = s.minLag; lag <= lastLag; lag += 1) pts.push([lag, s.f(lag)]);
    if (pts.length === 0 || pts[pts.length - 1][0] < lastLag) pts.push([lastLag, s.f(lastLag)]);
    const line = d3.line().x((d) => x(d[0])).y((d) => y(d[1]));
    g.append('path').attr('d', line(pts)).attr('fill', 'none').attr('stroke', ROLE[s.role]).attr('stroke-width', 2)
      .attr('stroke-dasharray', DASH[s.role]);
    if (crossingLag < 30) drawClipArrow(g, x(crossingLag), y(LOG3_CLIP), null);
  }

  // Legend, exact names, never colour-alone (distinct dash per role too,
  // matching each line's own dash pattern -- audit feedback: all three
  // used identical solid marks, relying on colour alone).
  const legendY = box.y + box.h - 8;
  let lx = box.x + 10;
  for (const s of series) {
    g.append('line').attr('x1', lx).attr('x2', lx + 14).attr('y1', legendY).attr('y2', legendY)
      .attr('stroke', ROLE[s.role]).attr('stroke-width', 2).attr('stroke-dasharray', DASH[s.role]);
    g.append('text').attr('x', lx + 18).attr('y', legendY + 3).attr('font-size', 8)
      .attr('fill', cssVar('--text-dim')).text(s.name);
    lx += 18 + s.name.length * 5 + 14;
  }
}

function drawPanelB(g, box, p, mMinusJstar, nMinusJstar) {
  d3TexLabel(g, {
    x: box.x, y: box.y, size: 12, weight: 600, fill: cssVar('--text'), plain: true,
  }, 'What the error + drift retains at scale $m$', 'What the error + drift retains at scale m');

  // Legend with the FULL weight formulas (including the S_Q norm) --
  // audit feedback: the visible per-bar label omitted the S_Q norm (only
  // the hidden <title> tooltip had it), and placing per-bar labels right
  // next to the first bar collided with the "restart scale n" marker.
  const legendItems = [
    {
      role: 'fluc',
      text: 'E[|V_j^{qq}|_{S_Q}^Q], weight 3^{-1/4(1-γ)(m-j)}',
      tex: '$\\E[|V_j^{\\qq}|_{S_Q}^Q]$, weight $3^{-\\frac14(1-\\gamma)(m-j)}$',
    },
    {
      role: 'mean',
      text: 'history^{mean}_{qq}(m;n), weight 3^{-1/4(1-γ)(m-1-j)}',
      tex: '$\\history_{\\qq}^{\\mathrm{mean}}(m;n)$, weight $3^{-\\frac14(1-\\gamma)(m-1-j)}$',
    },
  ];
  let ly = box.y + 12;
  for (const item of legendItems) {
    g.append('rect').attr('x', box.x).attr('y', ly - 7).attr('width', 9).attr('height', 9).attr('fill', ROLE[item.role]);
    d3TexLabel(g, {
      x: box.x + 13, y: ly, size: 7.5, fill: cssVar('--text-dim'),
    }, item.tex, item.text);
    ly += 12;
  }

  const jstar = 0;
  const m = jstar + mMinusJstar;
  const n = jstar + nMinusJstar;

  const carriedLevel = -0.25 * (1 - p.gamma) * (m - n);
  checkMustHold2(p, m, n, jstar, carriedLevel);

  const plot = {
    x: box.x + 26, y: box.y + 40, w: box.w - 40, h: box.h - 74,
  };
  const x = d3.scaleLinear().domain([jstar, m]).range([plot.x, plot.x + plot.w]);
  const y = d3.scaleLinear().domain([LOG3_CLIP, 0]).range([plot.y + plot.h, plot.y]);

  g.append('line').attr('x1', plot.x).attr('x2', plot.x + plot.w).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', cssVar('--border'));
  [0, -4, -8, -12].forEach((t) => {
    g.append('text').attr('x', plot.x - 4).attr('y', y(t) + 3).attr('text-anchor', 'end').attr('font-size', 7.5)
      .attr('fill', cssVar('--text-faint')).text(t);
  });
  // Relative scale ticks (previously only j_*, n, m were marked, with no
  // intermediate ticks OR numeric labels) plus this panel's own
  // log_3(weight) axis label.
  const minorStep = Math.max(1, Math.round((m - jstar) / 10));
  for (let j = jstar; j <= m; j += minorStep) {
    g.append('line').attr('x1', x(j)).attr('x2', x(j)).attr('y1', plot.y + plot.h).attr('y2', plot.y + plot.h + 2)
      .attr('stroke', cssVar('--text-faint')).attr('stroke-width', 0.5);
  }
  const labelStep = Math.max(1, Math.round((m - jstar) / 5));
  for (let j = jstar; j <= m; j += labelStep) {
    // drawn as their own major ticks below; also skipped when within 24
    // units of one of them (their labels would run together)
    if ([jstar, n, m].some((k) => Math.abs(x(j) - x(k)) < 24)) continue;
    d3TexLabel(g, {
      x: x(j), y: plot.y + plot.h + 11, anchor: 'middle', size: 6.5, fill: cssVar('--text-faint'), plain: true,
    }, `$j_*+${j - jstar}$`, `j_*+${j - jstar}`);
  }
  // Coinciding scales share one label ("j_*=n", "n=m"): drawn separately
  // they overprinted each other at n=j_* or n=m.
  const majors = [];
  for (const [pos, label] of [[jstar, 'j_*'], [n, 'n'], [m, 'm']]) {
    const same = majors.find((mk) => mk[0] === pos);
    if (same) same[1] += `=${label}`; else majors.push([pos, label]);
  }
  for (const [pos, label] of majors) {
    g.append('line').attr('x1', x(pos)).attr('x2', x(pos)).attr('y1', plot.y + plot.h).attr('y2', plot.y + plot.h + 4)
      .attr('stroke', cssVar('--text-faint'));
    d3TexLabel(g, {
      x: x(pos), y: plot.y + plot.h + 14, anchor: 'middle', size: 8, fill: cssVar('--text-faint'),
    }, `$${label}$`, label);
  }
  yAxisName(g, box, plot);

  // Carried history: ONE hatched block over [j_*, n] -- drawn even at the
  // allowed n=j_* setting (audit feedback: an earlier version only drew it
  // for n>j_*, so the carried quantity vanished entirely rather than being
  // shown as the single point/trivial block it still is at n=j_*).
  {
    const hatchId = 'hcp-rh-hatch';
    let defs = d3.select(g.node().ownerSVGElement).select('defs');
    if (defs.empty()) defs = d3.select(g.node().ownerSVGElement).insert('defs', ':first-child');
    if (defs.select(`#${hatchId}`).empty()) {
      const pat = defs.append('pattern').attr('id', hatchId).attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)');
      pat.append('rect').attr('width', 5).attr('height', 5).attr('fill', 'none');
      pat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 5)
        .attr('stroke', cssVar('--text-dim')).attr('stroke-width', 1.5);
    }
    const carriedY = y(clipLog3(carriedLevel));
    const blockW = Math.max(3, x(n) - x(jstar)); // a thin marker, not zero-width, when n=j_*
    g.append('rect').attr('x', x(jstar)).attr('y', carriedY - 5).attr('width', blockW).attr('height', 10)
      .attr('fill', `url(#${hatchId})`).attr('stroke', cssVar('--text-dim'))
      .append('title').text('history_qq(n), carried as a whole');
    // Its name goes in the legend (right of the first legend row), with a
    // hatched swatch: drawn over the block it ran into the "restart scale n"
    // marker and, at n=j_*, past the figure's left edge.
    const kx = box.x + 330;
    g.append('rect').attr('x', kx).attr('y', box.y + 5).attr('width', 12).attr('height', 9)
      .attr('fill', `url(#${hatchId})`).attr('stroke', cssVar('--text-dim'));
    d3TexLabel(g, {
      x: kx + 16, y: box.y + 12, size: 7.5, fill: cssVar('--text-dim'),
    }, '$\\history_{\\qq}(n)$, carried as a whole', 'history_{qq}(n), carried as a whole');
  }

  // Bars are anchored at the floor (log_3 weight = -12) and grow UP toward
  // their value, like an ordinary bar chart -- taller means more weight
  // retained. Fluctuation offset left, mean offset right of each integer
  // scale j (never colour alone) -- both bars are narrow and stay close to
  // their own j, well inside the 1-scale spacing to the next j (audit
  // feedback: an earlier version's left-offset fluctuation bar was nearly
  // a full scale-spacing wide and bled into the previous scale's mean bar).
  const floorY = y(LOG3_CLIP);
  const cellW = x(jstar + 1) - x(jstar);
  const subW = Math.max(1.5, cellW * 0.32);
  const subGap = cellW * 0.06;
  for (let j = n + 1; j <= m; j += 1) {
    const level = -0.25 * (1 - p.gamma) * (m - j);
    const barY = y(clipLog3(level));
    g.append('rect').attr('x', x(j) - subGap - subW).attr('y', barY).attr('width', subW).attr('height', Math.max(0.5, floorY - barY))
      .attr('fill', ROLE.fluc)
      .append('title').text('E[|V_j^{qq}|_{S_Q}^Q], weight 3^{-1/4(1-γ)(m-j)}');
  }
  // Mean bars from n, n <= j <= m-1 (right-offset).
  for (let j = n; j <= m - 1; j += 1) {
    const level = -0.25 * (1 - p.gamma) * (m - 1 - j);
    const barY = y(clipLog3(level));
    g.append('rect').attr('x', x(j) + subGap).attr('y', barY).attr('width', subW).attr('height', Math.max(0.5, floorY - barY))
      .attr('fill', ROLE.mean)
      .append('title').text('history_qq^mean(m;n)');
  }
  // Drift: dotted line with dots, j_*+1 <= j <= m, independent of n.
  const driftPts = [];
  for (let j = jstar + 1; j <= m; j += 1) driftPts.push([j, clipLog3(-0.125 * (1 - p.gamma) * (m - j))]);
  const driftLine = d3.line().x((d) => x(d[0])).y((d) => y(d[1]));
  g.append('path').attr('d', driftLine(driftPts)).attr('fill', 'none').attr('stroke', ROLE.drift)
    .attr('stroke-width', 1.5).attr('stroke-dasharray', '1,3');
  for (const [j, lv] of driftPts) g.append('circle').attr('cx', x(j)).attr('cy', y(lv)).attr('r', 1.8).attr('fill', ROLE.drift);

  // Restart-scale marker.
  g.append('line').attr('x1', x(n)).attr('x2', x(n)).attr('y1', plot.y).attr('y2', plot.y + plot.h)
    .attr('stroke', cssVar('--text')).attr('stroke-dasharray', '2,2');
  // Kept within the plot's width (centred on the marker otherwise), clear of
  // the y-axis numbers at n=j_* and of the right edge at n=m.
  d3TexLabel(g, {
    x: Math.min(Math.max(x(n), plot.x + 32), plot.x + plot.w - 32), y: plot.y - 4, anchor: 'middle', size: 7.5, fill: cssVar('--text'), plain: true,
  }, 'restart scale $n$', 'restart scale n');

  // Real typeset math (grid superscripts on P and Delta included), not raw
  // "meanpenalty_Q(...)"/"e^{...}" notation -- audit feedback.
  d3TexLabel(g, {
    x: box.x, y: box.y + box.h + 2, size: 7.5, italic: true, fill: cssVar('--text-faint'),
  }, 'Not drawn: the factors $1+\\meanpenalty_Q(P_{n,m}^{\\qq})\\geq1$ and $e^{Q\\Delta_{j,m}^{\\qq}}\\geq1$, and the random quantities the weights multiply.',
  'Not drawn: the factors 1+meanpenalty_Q(P_{n,m}^{qq}) ≥ 1 and e^{QΔ_{j,m}^{qq}} ≥ 1, and the random quantities the weights multiply.');
}

function checkMustHold2(p, m, n, jstar, carriedLevel) {
  const fluctFormula = (j) => -0.25 * (1 - p.gamma) * (m - j);
  const meanFormula = (j) => -0.25 * (1 - p.gamma) * (m - 1 - j);
  if (n < m) assert(fluctFormula(m) === 0, 'the new fluctuation bar at j=m must be at 0 when n<m');
  if (n <= m - 1) assert(meanFormula(m - 1) === 0, 'the mean bar at j=m-1 must be at 0 when n<=m-1');
  assert(
    Math.abs(carriedLevel - (-0.25 * (1 - p.gamma) * (m - n))) < 1e-9,
    'carried block must sit at -(1/4)(1-gamma)(m-n)',
  );
  assert(n >= jstar && n <= m, 'the carried block must span exactly [j_*, n]');
  const driftFormula = (j) => -0.125 * (1 - p.gamma) * (m - j);
  assert(driftFormula(m) === 0, 'the drift must be 0 at j=m');
}

function drawReadout(g, box, p) {
  d3TexLabel(
    g,
    {
      x: box.x, y: box.y, size: 10.5, fill: cssVar('--text'),
    },
    `$Q=${p.Q}$, $\\rho_{\\max}=${p.rhoMax.toFixed(4)}$, $Q\\rho_{\\max}-d=${p.qRhoMaxMinusD.toFixed(4)}\\geq\\frac14(1-\\gamma)=${((1 - p.gamma) / 4).toFixed(4)}$, $\\frac18(1-\\gamma)=${((1 - p.gamma) / 8).toFixed(4)}$`,
    `Q=${p.Q}, rho_{max}=${p.rhoMax.toFixed(4)}, Q rho_{max}-d=${p.qRhoMaxMinusD.toFixed(4)} ≥ (1/4)(1-γ)=${((1 - p.gamma) / 4).toFixed(4)}, (1/8)(1-γ)=${((1 - p.gamma) / 8).toFixed(4)}`,
  );
}

export function render(el, {
  theme = 'light', params = {}, snapshot = false,
} = {}) {
  try {
    renderInner(el, params, snapshot);
  } catch (err) {
    showAssertionError(el, 'fig.retained-histories', err.message);
  }
}

function renderInner(el, params, snapshot) {
  el.innerHTML = '';
  el.classList.add('figure-retained-histories');
  // One column wrapper for the banner, controls and SVG: the mount itself
  // (.figure-mount) is a centring flex ROW, which laid these side by side
  // and shrank the SVG to a sliver.
  const root = document.createElement('div');
  root.className = 'd3-figure';
  root.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;min-width:0;';
  el.appendChild(root);

  const dParam = (params && params.d) || { options: [2, 3, 4, 5, 6], default: 2 };
  const gammaParam = (params && params.gamma) || {
    min: 0, max: 0.95, step: 0.05, default: 0.2,
  };
  const mParam = (params && params.m_minus_jstar) || {
    min: 2, max: 40, step: 1, default: 24,
  };
  const nParam = (params && params.n_minus_jstar) || {
    min: 0, max: 40, step: 1, default: 12,
  };
  const idPrefix = elId(el);

  const controls = document.createElement('div');
  controls.className = 'figure-controls';
  const dCtl = makeSelectControl({
    id: `${idPrefix}-d`, label: 'd', labelTex: '$d$', options: dParam.options, value: dParam.default,
  });
  const gammaCtl = makeSliderControl({
    id: `${idPrefix}-gamma`,
    label: 'γ',
    labelTex: '$\\gamma$',
    min: gammaParam.min,
    max: gammaParam.max,
    step: gammaParam.step,
    value: gammaParam.default,
    formatValue: (v) => v.toFixed(2),
  });
  const mCtl = makeSliderControl({
    id: `${idPrefix}-m`,
    label: 'm − j_*',
    labelTex: '$m-j_*$',
    min: mParam.min,
    max: mParam.max,
    step: mParam.step,
    value: mParam.default,
    formatValue: (v) => String(v),
  });
  const nCtl = makeSliderControl({
    id: `${idPrefix}-n`,
    label: 'n − j_*',
    labelTex: '$n-j_*$',
    min: nParam.min,
    max: nParam.max,
    step: nParam.step,
    value: nParam.default,
    formatValue: (v) => String(v),
  });
  controls.append(dCtl.wrap, gammaCtl.wrap, mCtl.wrap, nCtl.wrap);
  root.appendChild(controls);

  const svgHost = document.createElement('div');
  root.appendChild(svgHost);

  const VB_W = 640;

  function redraw() {
    const d = Number(dCtl.select.value);
    const g = Math.round(Number(gammaCtl.input.value) * 100);
    let mMinusJstar = Number(mCtl.input.value);
    let nMinusJstar = Math.min(Number(nCtl.input.value), mMinusJstar);
    nCtl.input.max = String(mMinusJstar);
    if (Number(nCtl.input.value) > mMinusJstar) nCtl.input.value = String(mMinusJstar);

    const p = computeParams(d, g);
    checkMustHold(p);

    svgHost.innerHTML = '';
    const svg = d3.select(svgHost).append('svg')
      .attr('width', '100%')
      .attr('role', 'img')
      .attr('aria-label', 'Retained estimates and their weights');

    let captionHeight = 0;
    if (snapshot) {
      const capG = svg.append('g');
      captionHeight = drawSnapshotCaption(capG, VB_W, [
        `d (select ${dParam.options.join('/')}, default ${dParam.default}; current ${d})`,
        `γ (slider ${gammaParam.min}..${gammaParam.max} step ${gammaParam.step}, default ${gammaParam.default})`,
        `m − j_* (slider ${mParam.min}..${mParam.max} step ${mParam.step}, default ${mParam.default})`,
        `n − j_* (slider ${nParam.min}..${nParam.max} step ${nParam.step}, default ${nParam.default}, clamped to m)`,
      ]);
    }
    const yOff = captionHeight + (captionHeight > 0 ? 8 : 0);
    const body = svg.append('g').attr('transform', `translate(0,${yOff})`);

    const readoutG = body.append('g');
    drawReadout(readoutG, { x: 16, y: 14 }, p);

    const gA = body.append('g');
    drawPanelA(gA, {
      x: 16, y: 40, w: VB_W - 32, h: 190,
    }, p);

    const gB = body.append('g');
    drawPanelB(gB, {
      x: 16, y: 254, w: VB_W - 32, h: 190,
    }, p, mMinusJstar, nMinusJstar);

    svg.attr('viewBox', `0 0 ${VB_W} ${470 + yOff}`);
  }

  dCtl.select.addEventListener('change', redraw);
  gammaCtl.input.addEventListener('input', redraw);
  mCtl.input.addEventListener('input', redraw);
  nCtl.input.addEventListener('input', redraw);

  redraw();
}

let idCounter = 0;
const idMap = new WeakMap();
function elId(el) {
  if (!idMap.has(el)) {
    idCounter += 1;
    idMap.set(el, `fig-retained-histories-${idCounter}`);
  }
  return idMap.get(el);
}
