// fig.polynomial-entry (content/figures/fig.polynomial-entry.yaml): the
// landing-page figure for Theorem A -- SCHEMATIC. Every stage boundary
// below is illustrative (fig.polynomial-entry.yaml parameters.
// illustrative_constants), and only two things are load-bearing from the
// paper: (1) each stage's length is a fixed multiple of ceil(ell) (or, for
// the hatched j_* sub-band, of ceil(kap) alone), and (2) the resulting
// exponent e = m_ent / log_3(2+Pi*K) stays bounded as Pi and K grow -- that
// bound, not any drawn number, is the content of "polynomial".
//
// One root <svg> holds both panels (stacked, as <g> groups) plus the
// readout: the audit-snapshot pipeline (scripts/lib/figureSnapshot.mjs)
// captures a figure's *first* <svg> descendant, so a multi-panel D3 figure
// must be one <svg>, not several siblings, or later panels would be
// missing from audit/figures/<id>.{svg,png}. Slider controls stay as real
// HTML outside the <svg> (native, keyboard-operable form controls) since
// they are interaction chrome, not part of the drawn default-state figure
// -- but are ALSO listed in a caption strip drawn into the SVG when
// snapshotting, so the audit PNG still shows their defaults.
//
// `d3` is the global from vendor/d3.min.js (see site/figures/lib/theme.mjs
// header comment) -- no import here.
/* global d3 */

import {
  cssVar, assert, showAssertionError, makeSliderControl, drawSnapshotCaption,
} from './lib/theme.mjs';
import { d3TexLabel } from './lib/texLabel.mjs';

const LOG3 = Math.log(3);
const log3 = (x) => Math.log(x) / LOG3;

function paramSpec(params, key, fallback) {
  const p = params && params[key];
  return {
    min: p && typeof p.min === 'number' ? p.min : fallback.min,
    max: p && typeof p.max === 'number' ? p.max : fallback.max,
    step: p && typeof p.step === 'number' ? p.step : fallback.step,
    default: p && typeof p.default === 'number' ? p.default : fallback.default,
  };
}

/** All of panel (a)'s stage boundaries, exactly as fig.polynomial-entry.yaml's
 * design prescribes (ell = log_3(2+Pi), kap = log_3(2K); jstar = 3*ceil(ell)
 * + ceil(kap); R = jstar + ceil(ell); n0 = R + ceil(ell); t = jstar +
 * 4*ceil(ell); m_ent = t + ceil(ell)). */
export function computeStages(Pi, K) {
  const ell = log3(2 + Pi);
  const kap = log3(2 * K);
  const cEll = Math.ceil(ell);
  const cKap = Math.ceil(kap);
  const jstar = 3 * cEll + cKap;
  const R = jstar + cEll;
  const n0 = R + cEll;
  const t = jstar + 4 * cEll;
  const mEnt = t + cEll;
  return {
    Pi, K, ell, kap, cEll, cKap, jstar, R, n0, t, mEnt,
  };
}

function checkMustHold(s) {
  assert(s.jstar - s.cKap === 3 * s.cEll, 'j_* minus its hatched part must be 3*ceil(ell)');
  assert(s.R - s.jstar === s.cEll, 'R - j_* must equal ceil(ell)');
  assert(s.n0 - s.R === s.cEll, 'n0 - R must equal ceil(ell)');
  assert(s.t - s.jstar === 4 * s.cEll, 't - j_* must equal 4*ceil(ell)');
  assert(s.mEnt - s.t === s.cEll, 'm_ent - t must equal ceil(ell)');
  assert(s.cEll >= 1 && s.cKap >= 1, 'ceil(ell) and ceil(kap) must be at least 1');
}

const VB_W = 640;
const PAD_L = 46;
const PAD_R = 16;

function sectionTitle(g, text, y, tex = null) {
  if (tex) {
    d3TexLabel(g, {
      x: PAD_L, y, size: 12, weight: 600, fill: cssVar('--text'), plain: true,
    }, tex, text);
    return;
  }
  g.append('text').attr('x', PAD_L).attr('y', y)
    .attr('font-size', 12).attr('font-weight', 600).attr('fill', cssVar('--text'))
    .text(text);
}

/** Panel (a): the scale ruler. Draws into `g` (already translated to its
 * section origin) and returns the section's total height. */
function drawPanelA(g, s) {
  const width = VB_W;
  sectionTitle(g, 'Scale ruler: where m_ent sits', 12, 'Scale ruler: where $m_{\\mathrm{ent}}$ sits');
  g.append('text').attr('x', width - PAD_R).attr('y', 12).attr('text-anchor', 'end')
    .attr('font-size', 9).attr('font-style', 'italic').attr('fill', cssVar('--text-faint'))
    .text('illustrative constants');

  const domainEnd = s.mEnt + 6;
  const x = d3.scaleLinear().domain([0, domainEnd]).range([PAD_L, width - PAD_R]);

  const bandY = 100;
  const bandH = 26;

  // Stages in proof order, lightest -> darkest: a WIDE opacity spread (not
  // 0.22-0.9) so the sequential ramp -- and the even-lower-opacity open
  // guarantee region past m_ent -- stay visually distinct from each other,
  // never just "solid orange" (audit feedback). Short visible captions
  // BELOW each band, not left to a hover-only <title>.
  const stages = [
    {
      from: s.cKap,
      to: s.jstar,
      op: 0.16,
      cap: 'C(B+1) log_3(2+Π)',
      capTex: '$C(B+1)\\log_3(2+\\Pi)$',
      title: 'C(B+1) log_3(2+Π)',
    },
    {
      from: s.jstar,
      to: s.R,
      op: 0.34,
      cap: '⌈B log_3(2+Π)⌉',
      capTex: '$\\lceil B\\log_3(2+\\Pi)\\rceil$',
      title: 'ceil(B log_3(2+Π))',
    },
    {
      from: s.R, to: s.n0, op: 0.52, cap: 'init', title: 'initialization (Euclidean grid)',
    },
    {
      from: s.n0,
      to: s.t,
      op: 0.7,
      cap: 'global selection',
      title: 'global selection: steps of a number of scales independent of Π',
    },
    {
      from: s.t,
      to: s.mEnt,
      op: 0.88,
      cap: 'response + transfer',
      title: 'response and transfer to Euclidean cubes',
    },
  ];

  // Axis line.
  g.append('line')
    .attr('x1', x(0)).attr('x2', x(domainEnd)).attr('y1', bandY + bandH).attr('y2', bandY + bandH)
    .attr('stroke', cssVar('--border'));

  // Hatched j_* sub-band [0, cKap] -- depends only on K.
  const root = d3.select(g.node().ownerSVGElement);
  let defs = root.select('defs');
  if (defs.empty()) defs = root.insert('defs', ':first-child');
  const hatchId = 'hcp-pe-hatch';
  if (defs.select(`#${hatchId}`).empty()) {
    const pattern = defs.append('pattern')
      .attr('id', hatchId).attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)');
    pattern.append('rect').attr('width', 5).attr('height', 5).attr('fill', cssVar('--surface-2'));
    pattern.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 5)
      .attr('stroke', cssVar('--accent')).attr('stroke-width', 1.5);
  }

  g.append('rect')
    .attr('x', x(0)).attr('y', bandY).attr('width', x(s.cKap) - x(0)).attr('height', bandH)
    .attr('fill', `url(#${hatchId})`).attr('stroke', cssVar('--border'))
    .append('title').text('C_src log_3(2 K)');
  d3TexLabel(g, {
    x: (x(0) + x(s.cKap)) / 2, y: bandY - 6, anchor: 'middle', size: 9.5, fill: cssVar('--text-dim'),
  }, '$C_{\\mathrm{src}}\\log_3(2K_{\\Psi_{\\S}})$', 'C_{src} log_3(2K_{Ψ_S})');

  // Remaining sequential-accent stages, each with a visible caption below
  // the band (rotated slightly clear of neighbours when the band is
  // narrow). A caption long enough to need it is split onto several
  // SHORTER rotated lines (each its own <text>, same angle, own pivot)
  // instead of one long diagonal run -- audit feedback: a single long
  // line reached far enough along the rotation to cross back UP into the
  // coloured band at one end, or into the "t" landmark/guide at the
  // other.
  const CAP_LINE_H = 9;
  for (const st of stages) {
    g.append('rect')
      .attr('x', x(st.from)).attr('y', bandY).attr('width', Math.max(0, x(st.to) - x(st.from))).attr('height', bandH)
      .attr('fill', cssVar('--accent')).attr('fill-opacity', st.op).attr('stroke', cssVar('--border'))
      .append('title').text(st.title);
    const capX = (x(st.from) + x(st.to)) / 2;
    const texLines = (st.capTex || st.cap).split('\n');
    st.cap.split('\n').forEach((line, li) => {
      const cy = bandY + bandH + 44 + li * CAP_LINE_H;
      d3TexLabel(g, {
        x: capX, y: cy, anchor: 'middle', size: 7, fill: cssVar('--text-dim'), transform: `rotate(-28, ${capX}, ${cy})`,
      }, texLines[li], line);
    });
  }

  // n0 marked at the right end of its window.
  g.append('line')
    .attr('x1', x(s.n0)).attr('x2', x(s.n0)).attr('y1', bandY - 4).attr('y2', bandY + bandH + 4)
    .attr('stroke', cssVar('--text')).attr('stroke-width', 1.5);
  d3TexLabel(g, {
    x: x(s.n0), y: bandY + bandH + 16, anchor: 'middle', size: 10, fill: cssVar('--text'),
  }, '$n_0$', 'n_0');

  // Small bracket [s,t] with t = s + H (H = 2, illustrative) at the end of
  // the global-selection band. Drawn ABOVE the band (not below, where the
  // rotated stage captions live) -- once the global-selection caption was
  // lengthened to the brief's full required wording it reached far enough
  // right to cross straight through this bracket (audit feedback).
  const H = 2;
  const sMark = s.t - H;
  const bracketY = bandY - 8;
  g.append('path')
    .attr('d', `M ${x(sMark)} ${bracketY} L ${x(sMark)} ${bracketY - 6} L ${x(s.t)} ${bracketY - 6} L ${x(s.t)} ${bracketY}`)
    .attr('fill', 'none').attr('stroke', cssVar('--text-faint'));
  d3TexLabel(g, {
    x: (x(sMark) + x(s.t)) / 2, y: bracketY - 10, anchor: 'middle', size: 7.5, fill: cssVar('--text-faint'),
  }, '$s,\\ t=s+H$', 's,t=s+H');

  // Open shaded band beyond m_ent: Theta_m <= 1+sigma -- clearly the
  // LOWEST opacity of the whole ruler.
  g.append('rect')
    .attr('x', x(s.mEnt)).attr('y', bandY).attr('width', Math.max(0, x(domainEnd) - x(s.mEnt))).attr('height', bandH)
    .attr('fill', cssVar('--accent')).attr('fill-opacity', 0.08);

  // Integer scale ticks (minor) and the scale-m axis label -- previously
  // absent entirely.
  for (let m = 0; m <= domainEnd; m += 1) {
    g.append('line').attr('x1', x(m)).attr('x2', x(m)).attr('y1', bandY + bandH).attr('y2', bandY + bandH + (m % 5 === 0 ? 3 : 1.5))
      .attr('stroke', cssVar('--text-faint')).attr('stroke-width', 0.5);
  }

  // Stage-boundary ticks + landmark labels, positioned to clear the
  // rotated stage captions and the "illustrative constants" note (both
  // used to overlap m_ent -- audit feedback).
  // +90 (was +64): room for the now-up-to-3-line rotated stage captions
  // above, whose last line can sit as low as bandY+bandH+44+2*CAP_LINE_H.
  const landmarkY = bandY + bandH + 90;
  const landmarks = [
    [0, '0', '$0$'], [s.jstar, 'j_*', '$j_*$'], [s.R, 'R', '$R$'], [s.t, 't', '$t$'],
    [s.mEnt, 'm_{ent}', '$m_{\\mathrm{ent}}$'],
  ];
  for (const [pos, label, tex] of landmarks) {
    g.append('line')
      .attr('x1', x(pos)).attr('x2', x(pos)).attr('y1', bandY + bandH).attr('y2', landmarkY - 6)
      .attr('stroke', cssVar('--text-faint')).attr('stroke-dasharray', '1.5,1.5');
    d3TexLabel(g, {
      x: x(pos), y: landmarkY, anchor: 'middle', size: 9, fill: cssVar('--text-faint'),
    }, tex, label);
  }
  d3TexLabel(g, {
    x: (x(0) + x(domainEnd)) / 2, y: landmarkY + 14, anchor: 'middle', size: 8, fill: cssVar('--text-faint'), plain: true,
  }, 'scale $m$', 'scale m');

  // (Drawn after the guides, so that its background patch covers them.)
  // Right-anchored at the viewBox's own right margin (not centred over the
  // narrow guarantee band, which is only ~ceil(ell) units wide and far too
  // short to hold this text without it running past the right edge --
  // audit feedback: the full "for every m >= m_ent" condition was clipped).
  // Just BELOW the band's right end, on a background patch over the dashed
  // t/m_ent guides: above the band it ran into the [s,t] bracket, which
  // sits only ceil(ell)+6 scales from the right edge.
  d3TexLabel(g, {
    x: width - PAD_R, y: bandY + bandH + 13, anchor: 'end', size: 8, fill: cssVar('--text-dim'), halo: true,
  }, '$\\Theta_m\\leq1+\\sigma$ for every $m\\geq m_{\\mathrm{ent}}$', 'Θ_m≤1+σ for every m≥m_{ent}');

  // Secondary top axis: length 3^m. Ticks sit at the scale m whose length
  // is EXACTLY the printed round power of ten (m = E / log10(3)) --
  // previously ticks sat at evenly spaced m and were mislabelled with a
  // nearby round exponent that did not match that position.
  const topY = bandY - 34;
  g.append('line').attr('x1', x(0)).attr('x2', x(domainEnd)).attr('y1', topY).attr('y2', topY)
    .attr('stroke', cssVar('--border')).attr('stroke-dasharray', '2,2');
  const maxExp = Math.floor(domainEnd * Math.log10(3));
  const expStep = Math.max(1, Math.ceil(maxExp / 4));
  for (let exp = 0; exp <= maxExp; exp += expStep) {
    const m = exp / Math.log10(3);
    g.append('line').attr('x1', x(m)).attr('x2', x(m)).attr('y1', topY - 3).attr('y2', topY + 3)
      .attr('stroke', cssVar('--text-faint'));
    d3TexLabel(g, {
      x: x(m), y: topY - 7, anchor: 'middle', size: 8.5, fill: cssVar('--text-faint'),
    }, `$10^{${exp}}$`, `10^{${exp}}`);
  }
  d3TexLabel(g, {
    x: PAD_L, y: topY - 20, size: 8.5, fill: cssVar('--text-faint'), plain: true,
  }, 'length $3^m$', 'length 3^m');

  // Readout, drawn inside the SVG so it survives the audit snapshot.
  // "X scales" and "length 3^X" are kept explicitly distinct (audit
  // feedback: an earlier version's wording read as if the scale COUNT
  // itself equalled a power of (2+Pi), rather than its LENGTH 3^X doing so).
  const ePi = s.mEnt / log3(2 + s.Pi * s.K);
  const exp10 = (s.mEnt * Math.log10(3)).toFixed(1);
  const readoutY = landmarkY + 34;
  d3TexLabel(g, {
    x: PAD_L, y: readoutY, size: 11, fill: cssVar('--text'), cls: 'figure-readout-svg',
  }, `$m_{\\mathrm{ent}}=${s.mEnt}$ scales;\u2002length $3^{m_{\\mathrm{ent}}}\\approx10^{${exp10}}=(2+\\Pi K_{\\Psi_{\\S}})^{${ePi.toFixed(1)}}$`,
  `m_{ent}=${s.mEnt} scales;  length 3^{m_{ent}} ≈ 10^{${exp10}} = (2+Π K_{Ψ_S})^{${ePi.toFixed(1)}}`);

  return readoutY + 16;
}

/** Panel (b): earlier-argument vs this-paper bars. Draws into `g` and
 * returns the section's total height. */
function drawPanelB(g, s) {
  const width = VB_W;
  sectionTitle(g, 'Why the exponent is a constant', 12);
  // "Put 'illustrative constants' in the corner of each panel" (design
  // brief) -- panel (a) already carries this; panel (b) only had its own
  // "set to one; compare growth" caption at the bottom (kept below), not
  // this corner label (audit feedback).
  g.append('text').attr('x', width - PAD_R).attr('y', 12).attr('text-anchor', 'end')
    .attr('font-size', 9).attr('font-style', 'italic').attr('fill', cssVar('--text-faint'))
    .text('illustrative constants');

  const earlierTotal = s.cEll * s.cEll;
  const stepBlock = 2;
  const nSteps = s.cEll;
  const thisPaperTotal = s.cEll + nSteps * stepBlock + s.cEll;
  const maxTotal = Math.max(earlierTotal, thisPaperTotal, 1);

  // Bars use the FULL available width (not width-minus-a-fixed-margin
  // reserved for a readout drawn to their right): that margin was too
  // narrow for the readout text once the numbers involved got large
  // (audit feedback: "81 scales; length 3^81 ..." clipped at the right
  // edge). Every readout instead goes on its own line below the bar,
  // left-aligned at barX, where it always has the panel's full width.
  const barX = PAD_L;
  const barW = width - PAD_L - PAD_R;
  const xs = d3.scaleLinear().domain([0, maxTotal]).range([0, barW]);

  const rowA = 40;
  const rowB = 130;

  g.append('text').attr('x', barX).attr('y', rowA - 8).attr('font-size', 10.5).attr('fill', cssVar('--text'))
    .text('earlier argument');
  g.append('text').attr('x', barX).attr('y', rowB - 8).attr('font-size', 10.5).attr('fill', cssVar('--text'))
    .text('this paper');

  // Earlier argument: cEll blocks of cEll scales, alternating tints (warm:
  // --draft), label growth ~ log(2+Pi) stages x ~log(2+Pi) scales each.
  let cursor = 0;
  for (let i = 0; i < s.cEll; i += 1) {
    const w = xs(cursor + s.cEll) - xs(cursor);
    g.append('rect').attr('x', barX + xs(cursor)).attr('y', rowA).attr('width', w).attr('height', 22)
      .attr('fill', cssVar('--draft')).attr('fill-opacity', i % 2 === 0 ? 0.85 : 0.5)
      .attr('stroke', cssVar('--surface'));
    cursor += s.cEll;
  }
  const eA = earlierTotal / s.ell;
  d3TexLabel(g, {
    x: barX, y: rowA + 34, size: 9, fill: cssVar('--text-dim'),
  }, `${earlierTotal} scales; length $3^{${earlierTotal}}\\approx(2+\\Pi)^{${eA.toFixed(1)}}$`,
  `${earlierTotal} scales; length 3^{${earlierTotal}} ≈ (2+Π)^{${eA.toFixed(1)}}`);
  d3TexLabel(g, {
    x: barX, y: rowA + 46, size: 8.5, italic: true, fill: cssVar('--text-faint'), plain: true,
  }, '$\\sim\\log(2+\\Pi)$ stages $\\times$ $\\sim\\log(2+\\Pi)$ scales each', '~log(2+Π) stages × ~log(2+Π) scales each');

  // This paper: init block, then cEll small 2-scale step blocks, then
  // transfer block -- both large blocks in the primary accent, the small
  // step blocks at lower opacity of the same token, each individually
  // captioned with what it represents (audit feedback: "init"/"steps"/
  // "transfer" alone did not say "once" or "a fixed number of scales").
  cursor = 0;
  g.append('rect').attr('x', barX + xs(cursor)).attr('y', rowB).attr('width', xs(s.cEll)).attr('height', 22)
    .attr('fill', cssVar('--accent')).attr('stroke', cssVar('--surface'));
  cursor += s.cEll;
  for (let i = 0; i < nSteps; i += 1) {
    g.append('rect').attr('x', barX + xs(cursor)).attr('y', rowB).attr('width', xs(cursor + stepBlock) - xs(cursor))
      .attr('height', 22).attr('fill', cssVar('--accent')).attr('fill-opacity', 0.5).attr('stroke', cssVar('--surface'));
    cursor += stepBlock;
  }
  g.append('rect').attr('x', barX + xs(cursor)).attr('y', rowB).attr('width', xs(cursor + s.cEll) - xs(cursor))
    .attr('height', 22).attr('fill', cssVar('--accent')).attr('stroke', cssVar('--surface'));
  cursor += s.cEll;
  const eB = thisPaperTotal / s.ell;
  d3TexLabel(g, {
    x: barX, y: rowB + 34, size: 9, fill: cssVar('--text-dim'),
  }, `${thisPaperTotal} scales; length $3^{${thisPaperTotal}}\\approx(2+\\Pi)^{${eB.toFixed(1)}}$`,
  `${thisPaperTotal} scales; length 3^{${thisPaperTotal}} ≈ (2+Π)^{${eB.toFixed(1)}}`);
  g.append('text').attr('x', barX).attr('y', rowB + 46).attr('font-size', 8.5)
    .attr('font-style', 'italic').attr('fill', cssVar('--text-faint'))
    .text(`init (once, ${s.cEll} scales) → steps (fixed ${stepBlock} scales each, ${nSteps} of them) → transfer (once, ${s.cEll} scales)`);

  const axisY = rowB + 60;
  g.append('line').attr('x1', barX).attr('x2', barX + barW).attr('y1', axisY).attr('y2', axisY).attr('stroke', cssVar('--border'));
  // Numeric ticks on the shared axis -- previously just a line + a text
  // label with no numbers, making the block lengths harder to read off
  // directly (audit feedback).
  const tickStep = Math.max(1, Math.round(maxTotal / 8));
  for (let v = 0; v <= maxTotal; v += tickStep) {
    const tx = barX + xs(v);
    g.append('line').attr('x1', tx).attr('x2', tx).attr('y1', axisY).attr('y2', axisY + 4)
      .attr('stroke', cssVar('--text-faint'));
    g.append('text').attr('x', tx).attr('y', axisY + 13).attr('text-anchor', 'middle').attr('font-size', 7.5)
      .attr('fill', cssVar('--text-faint')).text(v);
  }
  g.append('text').attr('x', barX + barW / 2).attr('y', axisY + 26).attr('text-anchor', 'middle').attr('font-size', 8)
    .attr('fill', cssVar('--text-faint')).text('scales used after the starting scale');

  const footY = axisY + 42;
  g.append('text').attr('x', barX).attr('y', footY).attr('font-size', 9)
    .attr('font-style', 'italic').attr('fill', cssVar('--text-faint'))
    .text('illustrative constants set to one; compare growth, not values');

  return footY + 10;
}

export function render(el, {
  theme = 'light', params = {}, snapshot = false,
} = {}) {
  try {
    renderInner(el, params, snapshot);
  } catch (err) {
    showAssertionError(el, 'fig.polynomial-entry', err.message);
  }
}

function renderInner(el, params, snapshot) {
  el.innerHTML = '';
  el.classList.add('figure-poly-entry');
  // One column wrapper for the banner, controls and SVG: the mount itself
  // (.figure-mount) is a centring flex ROW, which laid these side by side
  // and shrank the SVG to a sliver.
  const root = document.createElement('div');
  root.className = 'd3-figure';
  root.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;min-width:0;';
  el.appendChild(root);

  const piSpec = paramSpec(params, 'log10_Pi', {
    min: 0, max: 12, step: 0.25, default: 4,
  });
  const kSpec = paramSpec(params, 'log10_K', {
    min: 0.05, max: 12, step: 0.25, default: 1,
  });
  const bannerText = 'schematic · illustrative constants (not the paper’s)';

  const banner = document.createElement('p');
  banner.className = 'figure-banner';
  banner.textContent = bannerText;
  root.appendChild(banner);

  const controls = document.createElement('div');
  controls.className = 'figure-controls';
  const piCtl = makeSliderControl({
    id: `${elId(el)}-log10pi`,
    label: 'Π = 10^x',
    labelTex: '$\\Pi=10^x$',
    min: piSpec.min,
    max: piSpec.max,
    step: piSpec.step,
    value: piSpec.default,
    formatValue: (v) => `10^${v}`,
    formatTex: (v) => `$10^{${v}}$`,
  });
  const kCtl = makeSliderControl({
    id: `${elId(el)}-log10k`,
    label: 'K_{Ψ_S} = 10^x',
    labelTex: '$K_{\\Psi_{\\S}}=10^x$',
    min: kSpec.min,
    max: kSpec.max,
    step: kSpec.step,
    value: kSpec.default,
    formatValue: (v) => `10^${v}`,
    formatTex: (v) => `$10^{${v}}$`,
  });
  controls.append(piCtl.wrap, kCtl.wrap);
  root.appendChild(controls);

  const svgHost = document.createElement('div');
  root.appendChild(svgHost);

  function redraw() {
    const Pi = 10 ** Number(piCtl.input.value);
    const K = 10 ** Number(kCtl.input.value);
    const s = computeStages(Pi, K);
    checkMustHold(s);

    svgHost.innerHTML = '';
    const svg = d3.select(svgHost).append('svg')
      .attr('width', '100%')
      .attr('role', 'img')
      .attr('aria-label', `Where the entry scale sits: m_ent = ${s.mEnt}`);

    let captionHeight = 0;
    if (snapshot) {
      const capG = svg.append('g');
      captionHeight = drawSnapshotCaption(capG, VB_W, [
        `banner: ${bannerText}`,
        `Π = 10^x (slider ${piSpec.min}..${piSpec.max} step ${piSpec.step}, default ${piSpec.default})`,
        `K_PsiS = 10^x (slider ${kSpec.min}..${kSpec.max} step ${kSpec.step}, default ${kSpec.default})`,
      ]);
    }
    const yOff = captionHeight + (captionHeight > 0 ? 8 : 0);
    const body = svg.append('g').attr('transform', `translate(0,${yOff})`);

    const gA = body.append('g').attr('transform', 'translate(0,0)');
    const hA = drawPanelA(gA, s);

    const gapBetween = 18;
    const gB = body.append('g').attr('transform', `translate(0,${hA + gapBetween})`);
    const hB = drawPanelB(gB, s);

    const totalHeight = hA + gapBetween + hB + yOff;
    svg.attr('viewBox', `0 0 ${VB_W} ${totalHeight}`);
  }

  piCtl.input.addEventListener('input', redraw);
  kCtl.input.addEventListener('input', redraw);
  redraw();
}

let idCounter = 0;
const idMap = new WeakMap();
function elId(el) {
  if (!idMap.has(el)) {
    idCounter += 1;
    idMap.set(el, `fig-poly-entry-${idCounter}`);
  }
  return idMap.get(el);
}
