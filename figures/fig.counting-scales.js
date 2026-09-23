// fig.counting-scales (content/figures/fig.counting-scales.yaml): a TOY RUN
// of the global selection's step count -- schematic, synthetic determinant
// losses, illustrative constants. One root <svg> (see fig.polynomial-
// entry.js's header comment) holds all six panels (A-F); controls
// (sliders/buttons) are real HTML outside it, and are ALSO listed in a
// caption strip drawn into the SVG when snapshotting (see
// site/figures/lib/theme.mjs's drawSnapshotCaption).
//
// MODEL: the reference toyRun (fig.counting-scales.yaml's "MODEL" section)
// is kept INLINE in this file, not in a shared lib module, so it is the
// one file an auditor comparing this figure against its brief needs to
// read.
//
// `d3` is the global from vendor/d3.min.js -- no import here.
/* global d3 */

import {
  cssVar, showAssertionError, makeSliderControl, makeButtonControl, motionOk, drawSnapshotCaption,
} from './lib/theme.mjs';
import { d3TexLabel, texHtml } from './lib/texLabel.mjs';
import { drawCaseMarker, roleColor } from './lib/caseRoles.mjs';

const NARROW_BREAKPOINT = 700;

// fig.counting-scales.yaml "parameters": the canonical slider ranges, used
// both as renderInner's own default (when the page passes none) and as
// checkMustHoldSweep's sweep range below -- kept as ONE source so the
// sweep can never silently drift from what the sliders actually expose
// (audit feedback: the sweep used to hardcode its own Pi/p values,
// including an out-of-range Pi=1 and p=0.4, and missed both endpoints).
const PI_SLIDER = {
  min: 0.5, max: 12, step: 0.5, default: 3,
};
const P_SLIDER = {
  min: 0, max: 0.3, step: 0.01, default: 0.03,
};

// ---------------------------------------------------------------------
// MODEL (fig.counting-scales.yaml "MODEL"): ported verbatim, RNG kept so a
// seed reproduces a run. Case tests and output data are those of the
// scale-selection alternatives (Cases 1-5) and of the continuing data of
// the global selection's Step 1; everything else (the synthetic
// determinant-loss schedule, the target drift, the jump at a change of
// geometry) is a stated toy choice.
// ---------------------------------------------------------------------

export const TOY_CONSTANTS = Object.freeze({
  d: 2, Q: 2, h: 2, L: 3, H: 4, C: 2, eta: 0.05, eps: 0.5, sigma: 0.1, delta: 0.01, Etr: 0.5, beta: 0.001, bmin: 0.05, bmax: 0.4, maxSteps: 5000,
});

export function mulberry32(a) {
  let state = a | 0;
  return function next() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Port of the design brief's `toyRun(P)`. `P` = {Pi, seed, p} plus the
 * fixed TOY_CONSTANTS fields. Returns the array of step records: out[0] is
 * the initial startup (Case 1, not counted); the last record is the stop;
 * everything between is a continuing step. `M = out.length - 2`.
 */
export function toyRun(P) {
  const {
    Pi, seed, p, d, Q, h, L, H, C, eta, eps, sigma, delta, Etr, beta, bmin, bmax, maxSteps,
  } = P;
  const rnd = mulberry32(seed);
  const geoms = [];
  const newGeom = (k0, ell0, tgt0) => {
    const g = { k0, ell: [ell0], tgt: [tgt0] };
    geoms.push(g);
    return g;
  };
  function ensure(g, r) {
    while (g.k0 + g.ell.length - 1 < r) {
      const i = g.ell.length - 1;
      const ell = g.ell[i];
      let loss = Math.min(ell, beta);
      if (rnd() < p) loss = Math.min(ell, loss + bmin + (bmax - bmin) * rnd());
      g.ell.push(ell - loss);
      g.tgt.push(g.tgt[i] + 0.5 * loss * (2 * rnd() - 1));
    }
  }
  const ld = (g, r) => { ensure(g, r); return g.ell[r - g.k0]; };
  const tg = (g, r) => { ensure(g, r); return g.tgt[r - g.k0]; };
  const dl = (g, j, k) => ld(g, j) - ld(g, k);
  const dHat = (g, n) => {
    let s = 0;
    for (let a = n + 1; a <= n + h; a += 1) s += dl(g, a - h, a);
    return s;
  };
  const n0 = 0;
  const mu0 = 0.5 * Math.log(Pi) + 0.5 * Math.log(24 * Pi);
  const ell0 = d * Math.log(24 * Pi);
  let g = newGeom(n0, ell0, mu0);
  let x = 0;
  let k = n0;
  let n = n0;
  let E = 1;
  E = C * h * (E + Math.exp(Q * dl(g, n, n + h)) - 1);
  n += h;
  let mu = Math.abs(x - tg(g, k));
  const out = [{
    i: 0, kind: 'startup', E, mu, n, k, grid: 0, ell: ld(g, n), adv: h,
  }];
  for (let i = 1; i <= maxSteps; i += 1) {
    let kind;
    let adv;
    const nBefore = n;
    if (E > eta) {
      const y = dHat(g, n);
      kind = y <= d * sigma ? 'contraction' : 'obstruction4';
      E = (1 / 8) * Math.exp(Q * y) * E + C * (Math.exp(Q * y) - 1);
      n += h;
      adv = h;
    } else {
      const y = dl(g, n, n + 2 * L);
      if (y > d * eps * sigma) {
        kind = 'obstruction5';
        E = C * 2 * L * (E + Math.exp(Q * y) - 1);
        n += 2 * L;
        adv = 2 * L;
      } else {
        const X = tg(g, n + 2 * L);
        const candDist = Math.abs(X - x);
        const reached = candDist <= eps;
        x = reached ? X : x + Math.sign(X - x) * eps;
        const oldEll2L = ld(g, n + 2 * L);
        const ellNew = Math.max(0, oldEll2L + 2 * d * Math.log(1 + delta) * (2 * rnd() - 1));
        const tNew = X + 0.5 * Math.log((1 + delta) / (1 - delta)) * (2 * rnd() - 1);
        const kNew = n + L;
        g = newGeom(kNew, ellNew, tNew);
        if (!reached) {
          kind = 'update';
          E = C * h * (Etr + Math.exp(Q * dl(g, kNew, kNew + h)) - 1);
          k = kNew;
          n = kNew + h;
        } else {
          const y2 = dl(g, kNew, kNew + H);
          if (y2 < d * sigma) {
            kind = 'stop';
            k = kNew;
            n = kNew;
            E = Etr;
          } else {
            kind = 'testfail';
            E = C * H * (Etr + Math.exp(Q * y2) - 1);
            k = kNew;
            n = kNew + H;
          }
        }
        adv = n - nBefore;
        out.push({
          i, kind, E, mu: Math.abs(x - tg(g, k)), n, k, grid: geoms.length - 1, ell: ld(g, n), adv, jumpFrom: oldEll2L, jumpTo: ellNew, candDist,
        });
        if (kind === 'stop') break;
        continue;
      }
    }
    mu = Math.abs(x - tg(g, k));
    out.push({
      i, kind, E, mu, n, k, grid: geoms.length - 1, ell: ld(g, n), adv,
    });
    if (kind === 'stop') break;
  }
  // Expose the raw per-grid log-det/target sequences (not just the
  // per-step-record snapshots already on `out`) so checkMustHold can
  // verify EVERY generated within-grid value, not only the ones landing
  // on a step boundary -- audit feedback. Non-enumerable: `out` still
  // behaves like a plain array of step records everywhere else (length,
  // forEach, JSON.stringify, ...).
  Object.defineProperty(out, 'geoms', { value: geoms });
  return out;
}

/** Number of continuing steps (excludes step 0's startup and the final
 * stop record) -- fig.counting-scales.yaml: "M = (number of records) - 2.
 * Never count step 0 or the stop in M." */
export function continuingSteps(out) {
  return out.length - 2;
}

export function didStop(out) {
  return out.length > 0 && out[out.length - 1].kind === 'stop';
}

const FIXED_GRID_KINDS = ['contraction', 'obstruction4', 'obstruction5'];
const VALID_KINDS = ['startup', 'contraction', 'obstruction4', 'obstruction5', 'update', 'testfail', 'stop'];

/** Verify every "MUST HOLD" clause of fig.counting-scales.yaml against one
 * run's output records. Throws on the first violation. */
export function checkMustHold(out, constants) {
  const {
    d, delta, eta, sigma, eps, Q, C, L, H, Etr,
  } = constants;
  if (!didStop(out)) throw new Error('no stop within the step limit');
  if (out[0].kind !== 'startup') throw new Error('step 0 must be the initial startup');
  if (out[out.length - 1].kind !== 'stop') throw new Error('the last record must be the stop');
  for (const rec of out) {
    if (!VALID_KINDS.includes(rec.kind)) throw new Error(`unrecognized case kind: ${rec.kind}`);
  }
  for (let i = 1; i < out.length; i += 1) {
    const rec = out[i];
    if (FIXED_GRID_KINDS.includes(rec.kind) && Math.abs(rec.mu - out[i - 1].mu) > 1e-9) {
      throw new Error(`mu changed on a fixed-grid step (${rec.kind}) at i=${i}`);
    }
  }
  // The case a step is assigned to must actually match the DECIDING
  // INEQUALITY that step's own E-update formula (toyRun, above) encodes --
  // not merely be one of the allowed case-name strings (audit feedback).
  // The raw decision value y (a log-det difference) is not itself stored
  // in a record, but every branch's E-update formula is invertible in the
  // previous record's E, so y (or the E-only special case for "stop") can
  // be reconstructed and checked against its own threshold.
  const TOL = 1e-6;
  for (let i = 1; i < out.length; i += 1) {
    const rec = out[i];
    const prevE = out[i - 1].E;
    if (rec.kind === 'contraction' || rec.kind === 'obstruction4') {
      if (!(prevE > eta)) throw new Error(`${rec.kind} at i=${i} requires the previous E (${prevE}) > eta (${eta})`);
      // E = (1/8) exp(Q y) prevE + C(exp(Q y) - 1)  =>  y = ln((E+C)/((1/8)prevE+C)) / Q
      const y = Math.log((rec.E + C) / (0.125 * prevE + C)) / Q;
      if (!(y >= -TOL)) throw new Error(`reconstructed y=${y} at i=${i} must be >= 0 (log det is non-increasing)`);
      const isContraction = y <= d * sigma + TOL;
      if (rec.kind === 'contraction' && !isContraction) throw new Error(`contraction at i=${i} needs y=${y} <= d*sigma=${d * sigma}`);
      if (rec.kind === 'obstruction4' && (y <= d * sigma - TOL)) throw new Error(`obstruction4 at i=${i} needs y=${y} > d*sigma=${d * sigma}`);
    } else {
      if (!(prevE <= eta + TOL)) throw new Error(`${rec.kind} at i=${i} requires the previous E (${prevE}) <= eta (${eta})`);
      if (rec.kind === 'obstruction5') {
        // E = C*2L*(prevE + exp(Q y) - 1)  =>  y = ln(E/(C*2L) - prevE + 1) / Q
        const y = Math.log(rec.E / (C * 2 * L) - prevE + 1) / Q;
        if (!(y >= -TOL)) throw new Error(`reconstructed y=${y} at i=${i} must be >= 0`);
        if (!(y > d * eps * sigma - TOL)) throw new Error(`obstruction5 at i=${i} needs y=${y} > d*eps*sigma=${d * eps * sigma}`);
      } else if (rec.kind === 'testfail') {
        // E = C*H*(Etr + exp(Q y2) - 1)  =>  y2 = ln(E/(C*H) - Etr + 1) / Q
        const y2 = Math.log(rec.E / (C * H) - Etr + 1) / Q;
        if (!(y2 >= -TOL)) throw new Error(`reconstructed y2=${y2} at i=${i} must be >= 0`);
        if (!(y2 >= d * sigma - TOL)) throw new Error(`testfail at i=${i} needs y2=${y2} >= d*sigma=${d * sigma}`);
      } else if (rec.kind === 'stop') {
        // E is set to exactly Etr on the stop branch (no exp(.) term).
        if (Math.abs(rec.E - Etr) > 1e-9) throw new Error(`stop at i=${i} must set E to exactly Etr (${Etr}), got ${rec.E}`);
      } else if (rec.kind === 'update') {
        // E = C*h*(Etr + exp(Q y') - 1) with y' = dl(...) >= 0 (log det is
        // non-increasing), so E >= C*h*Etr is a necessary (if weak) bound.
        if (!(rec.E >= constants.h * Etr * C - TOL)) throw new Error(`update at i=${i}: E=${rec.E} must be >= C*h*Etr=${constants.h * Etr * C}`);
      }
      // "Case 3" covers update/stop/testfail alike: all three are only
      // reached because the loss test y = Delta_{n,n+2L} passed
      // (y <= d*eps*sigma, the complement of obstruction5's test) --
      // reconstructed EXACTLY (no exp/log round-trip) from the previous
      // record's own log det and this record's stored jumpFrom, since
      // both are the SAME fixed grid at the SAME scale (audit feedback:
      // "does not verify the Case 3 loss ... tests").
      // Whether the move reached its canonical candidate decides update
      // (not reached) versus stop/testfail (reached): candDist is the
      // distance from the metric to the candidate BEFORE the move of at
      // most eps (fc.G1: "does not verify whether the geometry update
      // actually reached its candidate").
      if (['update', 'stop', 'testfail'].includes(rec.kind)) {
        if (rec.candDist === undefined) throw new Error(`${rec.kind} at i=${i} must record candDist`);
        const reached = rec.candDist <= eps;
        if (rec.kind === 'update' && reached) throw new Error(`update at i=${i} but the candidate was within eps (${rec.candDist} <= ${eps})`);
        if (rec.kind !== 'update' && !reached) throw new Error(`${rec.kind} at i=${i} but the candidate was not reached (${rec.candDist} > ${eps})`);
      }
      if (['update', 'stop', 'testfail'].includes(rec.kind)) {
        if (rec.jumpFrom === undefined) throw new Error(`${rec.kind} at i=${i} must record jumpFrom (the old grid's value at n+2L)`);
        const y = out[i - 1].ell - rec.jumpFrom;
        if (!(y >= -TOL)) throw new Error(`Case 3 loss y=${y} at i=${i} must be >= 0`);
        if (!(y <= d * eps * sigma + TOL)) throw new Error(`${rec.kind} at i=${i} needs the Case 3 loss y=${y} <= d*eps*sigma=${d * eps * sigma}`);
      }
      // The "candidate" test that a reached geometry change is stopped or
      // continued (testfail): read straight off the exposed grid data
      // (out.geoms), not re-derived from E, so the check is against the
      // actual generated within-grid value and can enforce the STRICT
      // "<" the stop test uses -- audit feedback: "the strict stop-loss
      // test" was unchecked (only E === Etr was verified).
      if ((rec.kind === 'stop' || rec.kind === 'testfail') && out.geoms) {
        const gNew = out.geoms[rec.grid];
        const kNew = rec.k;
        const y2 = gNew.ell[kNew - gNew.k0] - gNew.ell[(kNew + H) - gNew.k0];
        if (!(y2 >= -TOL)) throw new Error(`candidate test y2=${y2} at i=${i} must be >= 0`);
        // Exactly the value toyRun's own stop test compared (the same two
        // array entries subtracted in the same order), so the STRICT "<" is
        // checked with no tolerance (fc.G1).
        if (rec.kind === 'stop' && !(y2 < d * sigma)) {
          throw new Error(`stop at i=${i} needs the STRICT candidate test y2=${y2} < d*sigma=${d * sigma}`);
        }
        if (rec.kind === 'testfail' && !(y2 >= d * sigma)) {
          throw new Error(`testfail at i=${i} needs y2=${y2} >= d*sigma=${d * sigma}`);
        }
      }
    }
  }
  if (out.geoms) {
    // Every log-det value toyRun actually GENERATED while extending a
    // grid (ensure()'s g.ell array), not merely the ones that happen to
    // land on a step-record boundary -- audit feedback: "checks recorded
    // log determinants rather than every generated within-grid value".
    for (const g of out.geoms) {
      for (let j = 0; j < g.ell.length; j += 1) {
        if (g.ell[j] < -1e-9) throw new Error(`grid k0=${g.k0}: generated log det ${g.ell[j]} at scale ${g.k0 + j} is negative`);
        if (j > 0 && g.ell[j] > g.ell[j - 1] + 1e-9) {
          throw new Error(`grid k0=${g.k0}: generated log det increased from ${g.ell[j - 1]} to ${g.ell[j]} at scale ${g.k0 + j}`);
        }
      }
    }
  } else {
    // Fallback for a hand-built `out` with no attached .geoms (e.g. a
    // test fixture): the weaker per-step-record check.
    const byGrid = new Map();
    for (const rec of out) {
      if (!byGrid.has(rec.grid)) byGrid.set(rec.grid, []);
      byGrid.get(rec.grid).push(rec.ell);
    }
    for (const seq of byGrid.values()) {
      for (let i = 1; i < seq.length; i += 1) {
        if (seq[i] > seq[i - 1] + 1e-9) throw new Error('log det must be non-increasing within a fixed grid');
      }
      for (const v of seq) if (v < -1e-9) throw new Error('log det must stay >= 0');
    }
  }
  const maxJump = 2 * d * Math.log(1 + delta);
  for (const rec of out) {
    if (rec.jumpFrom !== undefined) {
      const jump = Math.abs(rec.jumpTo - rec.jumpFrom);
      if (jump > maxJump + 1e-9) throw new Error(`jump at a change of grid (${jump}) exceeds 2d log(1+delta) (${maxJump})`);
    }
  }
  if (continuingSteps(out) !== out.length - 2) throw new Error('M must exclude step 0 and the stop');
}

/** checkMustHold above only ever saw the ONE run currently on screen. Sweep
 * seeds 1-3 across the full Pi/p ranges the sliders expose, so a
 * combination the viewer never happens to dial in can't silently violate a
 * MUST HOLD clause. Cheap (a few dozen toyRun calls, each capped by
 * maxSteps) and idempotent -- runs once per page load. */
let sweepDone = false;

/** Every value the log10(Pi)/p sliders can actually be set to: lo, lo+step,
 * lo+2*step, ..., hi (hi included exactly even if it does not fall on a
 * step, mirroring how a real range input still lets you reach its own
 * max). Used by checkMustHoldSweep so the sweep genuinely covers "all
 * selectable values across the stated ranges" (audit feedback), not a
 * coarser hand-picked sample. */
function selectableValues({ min, max, step }) {
  const out = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.min(v, max));
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

export function checkMustHoldSweep(constants = TOY_CONSTANTS, force = false) {
  if (sweepDone && !force) return;
  sweepDone = true;
  // Every selectable log10(Pi) and p value (24 x 31 = 744 combinations)
  // across seeds 1-3: ~2200 toyRun+checkMustHold calls, well under 150ms
  // even including the new within-grid/Case-3/strict-stop checks --
  // cheap enough to run once per page load in full, rather than a sparser
  // sample (audit feedback: the old 8x7 grid missed most slider settings).
  const piGrid = selectableValues(PI_SLIDER).map((logPi) => 10 ** logPi);
  const pGrid = selectableValues(P_SLIDER);
  for (let seed = 1; seed <= 3; seed += 1) {
    for (const Pi of piGrid) {
      for (const p of pGrid) {
        const out = toyRun({
          Pi, seed, p, ...constants,
        });
        checkMustHold(out, constants);
      }
    }
  }
}

// ---------------------------------------------------------------------
// DRAWING
// ---------------------------------------------------------------------

function log3(x) { return Math.log(x) / Math.log(3); }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const LEGEND_ORDER = ['startup', 'contraction', 'update', 'obstruction4', 'obstruction5', 'testfail', 'stop'];
const LEGEND_TEXT = {
  startup: 'startup',
  contraction: 'contraction (Case 2)',
  update: 'geometry update (change + startup)',
  obstruction4: 'obstruction (Case 4)',
  obstruction5: 'obstruction (Case 5)',
  testfail: 'failed test',
  stop: 'stop',
};

/** Panel (F)'s Monte-Carlo inset: for log10(Pi) in {0.5,...,12} and seeds
 * 1..5, at the current burst rate p, run toyRun and record M (continuing
 * steps only). */
function computeInsetData(p) {
  const points = [];
  for (let logPi = 0.5; logPi <= 12 + 1e-9; logPi += 0.5) {
    const Pi = 10 ** logPi;
    for (let seed = 1; seed <= 5; seed += 1) {
      const out = toyRun({
        Pi, seed, p, ...TOY_CONSTANTS,
      });
      // MUST HOLD: "if a run does not stop, show 'no stop within the step
      // limit' rather than truncating silently" -- computeInsetData used
      // to count continuingSteps(out) regardless, silently assigning an M
      // value to a run that never actually reached a stop (audit
      // feedback).
      if (!didStop(out)) throw new Error('no stop within the step limit');
      points.push({ logPi, x: log3(2 + Pi), m: continuingSteps(out) });
    }
  }
  return points;
}

function sectionTitle(g, text, x, y, tex = null) {
  if (tex) {
    d3TexLabel(g, {
      x, y, size: 11, weight: 600, fill: cssVar('--text'), plain: true,
    }, tex, text);
    return;
  }
  g.append('text').attr('x', x).attr('y', y).attr('font-size', 11).attr('font-weight', 600)
    .attr('fill', cssVar('--text')).text(text);
}

/** "1e-3" style tick of a log axis, typeset as a power of ten. */
function powerTick(t) {
  return `$10^{${Math.round(Math.log10(t))}}$`;
}

/** A threshold label drawn ON TOP of the data, with a halo in the panel's
 * own ground colour so plotted markers never obscure it (fc.H1). Call it
 * after the panel's markers are drawn. */
function thresholdLabel(g, x, y, text, tex) {
  d3TexLabel(g, {
    x, y, size: 8, fill: cssVar('--text-dim'), halo: true, plain: true,
  }, tex, text);
}

function numericYAxis(g, box, y, ticks, format, formatTex = null) {
  for (const t of ticks) {
    const ty = y(t);
    g.append('line').attr('x1', box.x - 3).attr('x2', box.x).attr('y1', ty).attr('y2', ty).attr('stroke', cssVar('--text-faint'));
    if (formatTex) {
      d3TexLabel(g, {
        x: box.x - 5, y: ty + 3, anchor: 'end', size: 7, fill: cssVar('--text-faint'), plain: true,
      }, formatTex(t), format(t));
      continue;
    }
    g.append('text').attr('x', box.x - 5).attr('y', ty + 3).attr('text-anchor', 'end').attr('font-size', 7)
      .attr('fill', cssVar('--text-faint')).text(format(t));
  }
}

/** Panel (A): the case strip, plus a shared step-index axis explaining
 * step 0 / continuing steps / the stop, and a case legend. */
function drawPanelA(g, box, revealed) {
  sectionTitle(g, 'Case strip (hover/tap a step)', box.x, box.y + 8);
  const top = box.y + 18;
  const cellH = 16;
  const dense = revealed.length > 150;
  const x = d3.scaleLinear().domain([0, Math.max(1, revealed.length - 1)]).range([box.x, box.x + box.w]);
  const cellW = Math.max(dense ? 0.6 : 2, (box.w / Math.max(1, revealed.length)));
  const svg = d3.select(g.node().ownerSVGElement);
  const markerSize = Math.min(cellW, cellH) / 2 - 0.5;

  // Current-scale labels and step-index ticks every 10 steps; for a long
  // (dense) run, every multiple of 10 that keeps about 15 labels or fewer,
  // rather than dropping the labels altogether (fc.G1).
  const labelEvery = 10 * Math.max(1, Math.ceil(revealed.length / 150));
  const cols = g.append('g').attr('class', 'cs-columns');
  revealed.forEach((rec, i) => {
    const cx0 = x(i);
    const cy0 = top + cellH / 2;
    if (rec.kind === 'update') {
      cols.append('rect').attr('x', cx0 - cellW / 2).attr('y', top).attr('width', cellW / 2).attr('height', cellH)
        .attr('fill', roleColor('update')).attr('fill-opacity', 0.35);
      cols.append('rect').attr('x', cx0).attr('y', top).attr('width', cellW / 2).attr('height', cellH)
        .attr('fill', roleColor('startup')).attr('fill-opacity', 0.35);
      if (!dense) {
        drawCaseMarker(cols, svg, 'update', cx0 - cellW / 4, cy0, markerSize);
        drawCaseMarker(cols, svg, 'startup', cx0 + cellW / 4, cy0, markerSize * 0.8);
      }
    } else {
      const bg = rec.kind === 'stop' ? cssVar('--surface-2') : roleColor(rec.kind);
      cols.append('rect').attr('x', cx0 - cellW / 2).attr('y', top).attr('width', cellW).attr('height', cellH)
        .attr('fill', bg).attr('fill-opacity', rec.kind === 'stop' ? 1 : (rec.kind === 'testfail' ? 0.15 : 0.35));
      if (!dense || rec.kind === 'stop') drawCaseMarker(cols, svg, rec.kind, cx0, cy0, markerSize);
    }
    if (i % labelEvery === 0) {
      g.append('text').attr('x', cx0).attr('y', top + cellH + 11).attr('text-anchor', 'middle')
        .attr('font-size', 7.5).attr('fill', cssVar('--text-faint')).text(rec.n);
    }
  });
  // Row heading placed ABOVE the strip, clear of the tick labels below it
  // (audit-driven fix: anchoring it on the same baseline as the tick
  // labels collided with whichever one happened to land near the right
  // edge).
  d3TexLabel(g, {
    x: box.x + box.w, y: top - 4, anchor: 'end', size: 7, italic: true, fill: cssVar('--text-faint'), plain: true, halo: true,
  }, 'current scale $n_i$', 'current scale n_i');

  // Shared step-index axis: 0 = first application (startup); 1..M =
  // continuing steps; M+1 = stop. Numeric step-index ticks (not just the
  // scale-value labels above), every 10 steps.
  const stepTicksY = top + cellH + 24;
  {
    for (let i = 0; i < revealed.length; i += labelEvery) {
      d3TexLabel(g, {
        x: x(i), y: stepTicksY, anchor: 'middle', size: 7, fill: cssVar('--text-faint'), plain: true, halo: true,
      }, `$i=${i}$`, `i=${i}`);
    }
  }
  const axisY = stepTicksY + 10;
  g.append('line').attr('x1', box.x).attr('x2', box.x + box.w).attr('y1', axisY).attr('y2', axisY).attr('stroke', cssVar('--border'));
  d3TexLabel(g, {
    x: box.x, y: axisY + 11, size: 7.5, italic: true, fill: cssVar('--text-faint'), plain: true,
  }, 'step index $i$: $0$ = first application (startup); $1,\\dots,M$ = continuing steps; $M+1$ = stop ($M$ shown above)',
  'step index i: 0 = first application (startup); 1..M = continuing steps; M+1 = stop (M shown above)');

  // Case legend: wraps onto a new row instead of overrunning the panel's
  // own width into whatever is drawn to its right (audit feedback: the
  // legend used to bleed into the phase-plane column and its markers could
  // be mistaken for plotted records there).
  let legendY = axisY + 24;
  let lx = box.x;
  const legendG = g.append('g').attr('class', 'cs-legend');
  for (const role of LEGEND_ORDER) {
    const label = LEGEND_TEXT[role];
    // jsdom has no text-metrics API (getComputedTextLength): estimate the
    // label's width from its character count instead of measuring it.
    const itemW = 13 + label.length * 4.3 + 14;
    if (lx + itemW > box.x + box.w && lx > box.x) {
      lx = box.x;
      legendY += 13;
    }
    drawCaseMarker(legendG, svg, role, lx + 5, legendY, 5);
    legendG.append('text').attr('x', lx + 13).attr('y', legendY + 3).attr('font-size', 7.5)
      .attr('fill', cssVar('--text-dim')).text(label);
    lx += itemW;
  }

  return {
    x, top, cellH, bottom: legendY + 6,
  };
}

/** Interactive hit layer for the shared step-index column (panels A-D):
 * drawn into its OWN <g>, appended to `body` AFTER panels A-D so it sits on
 * top in paint order and therefore wins pointer hit-testing everywhere in
 * that column -- including directly over a panel B/C/D mark, which would
 * otherwise swallow the event with no handler of its own (audit feedback,
 * source inspection: "hover/focus targets are installed only on panel A").
 * Spans down through panel D's bottom (`colBottom`). */
function drawStepHitLayer(g, box, revealed, x, top, onHover, defaultI, colBottom, dense) {
  const hitBottom = colBottom != null ? colBottom : box.y + box.h;
  const hitTop = top - 2;
  const hit = g.append('g').attr('class', 'cs-hit');

  // A single "scrub" surface UNDER the per-step rects below: it resolves
  // the NEAREST step from the pointer's x position, so there is no dead
  // zone between per-step rects, and it is the only practical mechanism
  // once the strip is too dense for one rect per step (audit feedback:
  // "the dense strip lacks nearest-step handling"). Also keyboard-operable
  // (arrow keys/Home/End) so it does not depend on the per-step tab stops.
  let focusIdx = defaultI;
  const scrub = hit.append('rect')
    .attr('x', box.x).attr('y', hitTop).attr('width', box.w).attr('height', hitBottom - hitTop)
    .attr('fill', 'transparent').attr('tabindex', 0).attr('role', 'slider')
    .attr('aria-label', 'scrub the case strip by step index (also selects the matching mark in the panels below and the phase plane)')
    .attr('aria-valuemin', 0).attr('aria-valuemax', Math.max(0, revealed.length - 1)).attr('aria-valuenow', focusIdx);
  scrub.on('pointermove pointerenter', (event) => {
    const [px] = d3.pointer(event, g.node());
    focusIdx = clamp(Math.round(x.invert(px)), 0, revealed.length - 1);
    onHover(focusIdx);
  });
  scrub.on('pointerleave', () => onHover(defaultI));
  scrub.on('focus', () => onHover(focusIdx));
  scrub.on('blur', () => onHover(defaultI));
  scrub.on('keydown', (event) => {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowRight') focusIdx = clamp(focusIdx + step, 0, revealed.length - 1);
    else if (event.key === 'ArrowLeft') focusIdx = clamp(focusIdx - step, 0, revealed.length - 1);
    else if (event.key === 'Home') focusIdx = 0;
    else if (event.key === 'End') focusIdx = revealed.length - 1;
    else return;
    event.preventDefault();
    scrub.attr('aria-valuenow', focusIdx);
    onHover(focusIdx);
  });

  // Per-step rects on TOP of the scrub surface: precise, individually
  // tab-focusable targets with a full data readout in their label. Only
  // when not dense -- with thousands of steps these would be sub-pixel
  // and thousands of tab stops impractical; the scrub surface above
  // already covers that case.
  if (!dense) {
    const cellW = Math.max(2, box.w / Math.max(1, revealed.length));
    revealed.forEach((rec, i) => {
      hit.append('rect')
        .attr('x', x(i) - Math.max(cellW, 3) / 2).attr('y', hitTop).attr('width', Math.max(cellW, 3)).attr('height', hitBottom - hitTop)
        .attr('fill', 'transparent').attr('tabindex', 0).attr('role', 'button')
        .attr('aria-label', `step ${i}: ${rec.kind}, n=${rec.n}, k=${rec.k}, advanced ${rec.adv}, E=${rec.E.toFixed(3)}, mu=${rec.mu.toFixed(3)}, log det=${rec.ell.toFixed(2)}`)
        .on('pointerenter focus', () => { focusIdx = i; onHover(i); })
        .on('pointerleave blur', () => onHover(defaultI));
    });
  }
}

function yLog(box, domain) {
  return d3.scaleLog().domain(domain).range([box.y + box.h, box.y + 28]).clamp(true);
}

function drawPanelB(g, box, revealed, xScale, dense) {
  sectionTitle(g, 'Error + drift E_i', box.x, box.y + 8, 'Error + drift $E_i$');
  d3TexLabel(g, {
    x: box.x, y: box.y + 18, size: 7, fill: cssVar('--text-faint'),
  }, '$E_i=\\mathcal P_{\\qq_i}(n_i;k_i)+D_{\\qq_i,j_*}(n_i)$', 'E_i = P_{q_i}(n_i;k_i) + D_{q_i,j_*}(n_i)');
  const y = yLog(box, [1e-3, 1e3]);
  numericYAxis(g, box, y, [1e-3, 1e-2, 0.1, 1, 10, 100, 1e3], (t) => t.toExponential(0), powerTick);
  const eta = TOY_CONSTANTS.eta;
  // Threshold labels on the LEFT (audit feedback: right-edge labels were
  // crowded by the default/stop guideline, which sits at the rightmost step).
  const thresholds = [[eta, 'η', '$\\eta$'], [1, '1', '$1$']];
  for (const [val] of thresholds) {
    g.append('line').attr('x1', box.x).attr('x2', box.x + box.w).attr('y1', y(val)).attr('y2', y(val))
      .attr('stroke', roleColor('threshold')).attr('stroke-dasharray', '3,2');
  }
  const line = d3.line().x((_d, i) => xScale(i)).y((d) => y(clamp(d.E, 1e-3, 1e3)));
  g.append('path').attr('d', line(revealed)).attr('fill', 'none').attr('stroke', cssVar('--border')).attr('stroke-width', 1);
  const svg = d3.select(g.node().ownerSVGElement);
  revealed.forEach((rec, i) => {
    drawCaseMarker(g, svg, rec.kind, xScale(i), y(clamp(rec.E, 1e-3, 1e3)), dense ? 1.5 : 3.5);
  });
  // Just past the plot's right end, outside the data (the step markers
  // crowd the left end, where step 0 and the first steps sit).
  for (const [val, label, tex] of thresholds) thresholdLabel(g, box.x + box.w + 4, y(val) + 3, label, tex);
}

function drawPanelC(g, box, revealed, xScale) {
  sectionTitle(g, 'Distance to canonical metric μ_i', box.x, box.y + 8, 'Distance to canonical metric $\\mu_i$');
  d3TexLabel(g, {
    x: box.x, y: box.y + 18, size: 7, fill: cssVar('--text-faint'),
  }, '$\\mu_i=|x_i-\\mathrm{target}_g(k_i)|$', 'μ_i = |x_i - target_g(k_i)|');
  const mu0 = revealed.length ? revealed[0].mu : 1;
  // Plot top left at box.y+22 used to butt straight up against the title
  // and mu_i formula rows above it, with no room for the "-eps" annotation
  // below them; +34 opens a clear band for it.
  const plotTop = box.y + 34;
  const y = d3.scaleLinear().domain([0, Math.max(1e-6, 1.05 * mu0)]).range([box.y + box.h, plotTop]);
  numericYAxis(g, box, y, d3.ticks(0, mu0, 4), (t) => t.toFixed(2));
  const line = d3.line().x((_d, i) => xScale(i)).y((d) => y(d.mu)).curve(d3.curveStepAfter);
  g.append('path').attr('d', line(revealed)).attr('fill', 'none').attr('stroke', roleColor('update')).attr('stroke-width', 1.5);
  const firstUpdate = revealed.findIndex((r) => r.kind === 'update');
  if (firstUpdate > 0) {
    // Fixed vertical position in the band opened above (clear of the
    // title/formula rows above and the plot/gridlines below, regardless of
    // where the marked point falls); horizontal position follows the
    // point but is clamped so the label can't run off either edge (audit
    // feedback: it used to clip at the left edge when the first update
    // happened early).
    const px = xScale(firstUpdate);
    const labelW = 90;
    const lx = clamp(px, box.x, box.x + box.w - labelW);
    d3TexLabel(g, {
      x: lx, y: box.y + 28, size: 7.5, fill: cssVar('--text-dim'), plain: true,
    }, '$-\\varepsilon$ (up to target drift)', '-ε (up to target drift)');
  }
}

function drawPanelD(g, box, revealed, xScale) {
  sectionTitle(g, 'log det of the current block', box.x, box.y + 8, '$\\log\\det$ of the current block');
  const top = TOY_CONSTANTS.d * Math.log(24 * revealed.piRef);
  const y = d3.scaleLinear().domain([0, Math.max(1e-6, 1.05 * top)]).range([box.y + box.h, box.y + 20]);
  numericYAxis(g, box, y, d3.ticks(0, top, 4), (t) => t.toFixed(1));
  g.append('line').attr('x1', box.x).attr('x2', box.x + box.w).attr('y1', y(top)).attr('y2', y(top))
    .attr('stroke', roleColor('threshold')).attr('stroke-dasharray', '3,2');
  d3TexLabel(g, {
    x: box.x + 2, y: y(top) - 3, size: 7.5, fill: cssVar('--text-faint'), plain: true,
  }, '$d\\log(24\\Pi)$', 'd log(24Π)');
  g.append('line').attr('x1', box.x).attr('x2', box.x + box.w).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', cssVar('--border'));
  d3TexLabel(g, {
    x: box.x + 2, y: y(0) + 10, size: 7.5, fill: cssVar('--text-faint'), plain: true,
  }, '$\\det\\geq1$', 'det ≥ 1');
  const line = d3.line().x((_d, i) => xScale(i)).y((d) => y(d.ell));
  g.append('path').attr('d', line(revealed)).attr('fill', 'none').attr('stroke', cssVar('--text-dim')).attr('stroke-width', 1);
  revealed.forEach((rec, i) => {
    if (rec.kind === 'obstruction4' || rec.kind === 'obstruction5' || rec.kind === 'testfail') {
      g.append('line').attr('x1', xScale(i)).attr('x2', xScale(i)).attr('y1', y(rec.ell) - 4).attr('y2', y(rec.ell) + 4)
        .attr('stroke', roleColor(rec.kind));
    }
  });
}

function drawPanelE(g, box, revealed, dense, onHover, defaultI) {
  sectionTitle(g, 'Phase plane (μ, E)', box.x, box.y + 8, 'Phase plane $(\\mu,E)$');
  const muMax = Math.max(1e-6, ...revealed.map((r) => r.mu), revealed.length ? revealed[0].mu : 1);
  const x = d3.scaleLinear().domain([0, muMax * 1.05]).range([box.x, box.x + box.w]);
  // Reserve room at the bottom of the panel's OWN box for the x-axis ticks
  // and label, instead of drawing them past box.h -- previously they spilled
  // into the next panel's (F's) heading below (audit feedback: crowding).
  const plotBottom = box.y + box.h - 24;
  const y = d3.scaleLog().domain([1e-3, 1e3]).range([plotBottom, box.y + 26]).clamp(true);
  numericYAxis(g, box, y, [1e-3, 0.1, 1, 10, 1e3], (t) => t.toExponential(0), powerTick);
  const xTicks = d3.ticks(0, muMax, 4);
  for (const t of xTicks) {
    g.append('text').attr('x', x(t)).attr('y', plotBottom + 11).attr('text-anchor', 'middle').attr('font-size', 7)
      .attr('fill', cssVar('--text-faint')).text(t.toFixed(2));
  }
  d3TexLabel(g, {
    x: box.x + box.w / 2, y: plotBottom + 21, anchor: 'middle', size: 7.5, fill: cssVar('--text-faint'), plain: true,
  }, '$\\mu$ (distance)', 'μ (distance)');
  g.append('line').attr('x1', box.x).attr('x2', box.x + box.w).attr('y1', y(TOY_CONSTANTS.eta)).attr('y2', y(TOY_CONSTANTS.eta))
    .attr('stroke', roleColor('threshold')).attr('stroke-dasharray', '3,2');
  // The eta label (audit feedback: "the phase-plane eta threshold is drawn
  // but has no eta label") is drawn after the markers, below, just past
  // the plot's right end, with a halo (fc.H1).

  const svg = d3.select(g.node().ownerSVGElement);
  let defs = svg.select('defs');
  if (defs.empty()) defs = svg.insert('defs', ':first-child');
  if (defs.select('#cs-arrow').empty()) {
    defs.append('marker').attr('id', 'cs-arrow').attr('viewBox', '0 0 8 8').attr('refX', 6).attr('refY', 4)
      .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto-start-reverse')
      .append('path').attr('d', 'M0,0 L8,4 L0,8 Z').attr('fill', cssVar('--text-faint'));
  }

  // Pull each arrow's head back off the destination marker's centre (by
  // roughly the marker's own radius) so the arrowhead is not entirely
  // hidden underneath the opaque marker drawn there -- audit feedback:
  // "arrowheads are largely hidden beneath the endpoint markers".
  const markerR = dense ? 1.5 : 3.5;
  const pullback = markerR + 3;
  for (let i = 1; i < revealed.length; i += 1) {
    const a = revealed[i - 1];
    const b = revealed[i];
    const x1 = x(a.mu);
    const y1 = y(clamp(a.E, 1e-3, 1e3));
    let x2 = x(b.mu);
    let y2 = y(clamp(b.E, 1e-3, 1e3));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len > pullback) {
      x2 -= (dx / len) * pullback;
      y2 -= (dy / len) * pullback;
    }
    g.append('line')
      .attr('x1', x1).attr('y1', y1)
      .attr('x2', x2).attr('y2', y2)
      .attr('stroke', cssVar('--text-faint')).attr('stroke-width', 0.75)
      .attr('marker-end', 'url(#cs-arrow)');
  }
  const markerG = g.append('g').attr('class', 'cs-phase-markers');
  // A single highlight RING, moved to whichever step is selected, instead
  // of toggling stroke on the markers themselves -- audit feedback,
  // source inspection: the old code cleared stroke on every marker
  // (including the unfilled startup circle at step 0, whose stroke IS its
  // only visible pixel, and open diamond markers), making them invisible
  // whenever a step was selected, including the default selection.
  const ring = g.append('circle').attr('class', 'cs-phase-ring')
    .attr('r', markerR + 3).attr('fill', 'none').attr('stroke', cssVar('--text')).attr('stroke-width', 1.5)
    .attr('visibility', 'hidden');
  // Invisible, generously-sized hit circles OVER the (often tiny) markers:
  // the phase plane uses (mu, E) coordinates, not the shared step-index
  // axis, so it needs its own hover/tap + keyboard targets (audit
  // feedback, source inspection: hover/focus was installed only on panel
  // A -- the phase plane is one of the panels left out).
  const hitG = onHover ? g.append('g').attr('class', 'cs-hit') : null;
  const positions = [];
  revealed.forEach((rec, i) => {
    const cx = x(rec.mu);
    const cy = y(clamp(rec.E, 1e-3, 1e3));
    positions.push([cx, cy]);
    if (i === 0) {
      markerG.append('circle').attr('cx', cx).attr('cy', cy).attr('r', dense ? 1.5 : 4).attr('fill', 'none')
        .attr('stroke', cssVar('--text'));
    } else {
      drawCaseMarker(markerG, svg, rec.kind, cx, cy, markerR);
    }
    if (hitG) {
      // Keyboard targets only: pointer hover is resolved by the
      // nearest-point surface below, since in a dense run these circles
      // overlap and the one that happens to receive the event need not be
      // the nearest point (fc.H1).
      hitG.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 6)
        .attr('fill', 'transparent').attr('pointer-events', 'none').attr('tabindex', 0).attr('role', 'button')
        .attr('aria-label', `phase-plane point for step ${i}: ${rec.kind}, μ=${rec.mu.toFixed(3)}, E=${rec.E.toExponential(2)}`)
        .on('focus', () => onHover(i))
        .on('blur', () => onHover(defaultI));
    }
  });
  thresholdLabel(g, box.x + box.w + 4, y(TOY_CONSTANTS.eta) + 3, 'η', '$\\eta$');
  if (hitG && positions.length) {
    // One transparent surface over the plot that selects the step whose
    // marker is NEAREST the pointer (Euclidean distance in pixels).
    const surface = hitG.append('rect')
      .attr('x', box.x).attr('y', box.y + 20).attr('width', box.w).attr('height', plotBottom - box.y - 20)
      .attr('fill', 'transparent');
    surface.on('pointermove pointerenter', (event) => {
      const [px, py] = d3.pointer(event, g.node());
      let best = 0;
      let bestD = Infinity;
      positions.forEach(([cx, cy], i) => {
        const dd = (cx - px) ** 2 + (cy - py) ** 2;
        if (dd < bestD) { bestD = dd; best = i; }
      });
      onHover(best);
    });
    surface.on('pointerleave', () => onHover(defaultI));
  }
  return {
    x,
    y,
    markerG,
    selectStep(i) {
      const p = positions[clamp(i, 0, positions.length - 1)];
      if (!p) { ring.attr('visibility', 'hidden'); return; }
      ring.attr('cx', p[0]).attr('cy', p[1]).attr('visibility', 'visible');
    },
  };
}

function drawPanelF(g, box, insetData, current) {
  sectionTitle(g, 'Steps vs log_3(2+Π)', box.x, box.y + 8, 'Steps vs $\\log_3(2+\\Pi)$');
  const x = d3.scaleLinear().domain([0, log3(2 + 1e12)]).range([box.x, box.x + box.w]);
  const maxM = Math.max(10, ...insetData.map((p) => p.m), current.m);
  const y = d3.scaleLinear().domain([0, maxM * 1.1]).range([box.y + box.h, box.y + 22]);
  numericYAxis(g, box, y, d3.ticks(0, maxM, 4), (t) => String(Math.round(t)));
  const xTicks = d3.ticks(0, log3(2 + 1e12), 4);
  for (const t of xTicks) {
    g.append('text').attr('x', x(t)).attr('y', box.y + box.h + 11).attr('text-anchor', 'middle').attr('font-size', 7)
      .attr('fill', cssVar('--text-faint')).text(t.toFixed(0));
  }
  g.append('g').selectAll('circle.inset-dot').data(insetData).enter().append('circle')
    .attr('cx', (p) => x(p.x)).attr('cy', (p) => y(p.m)).attr('r', 1.6)
    .attr('fill', cssVar('--text-faint')).attr('fill-opacity', 0.5);
  g.append('circle').attr('cx', x(current.x)).attr('cy', y(current.m)).attr('r', 4.5)
    .attr('fill', cssVar('--accent'));
  d3TexLabel(g, {
    x: box.x, y: box.y + box.h + 21, size: 7.5, fill: cssVar('--text-faint'), plain: true,
  }, '$\\log_3(2+\\Pi)$', 'log_3(2+Π)');
  d3TexLabel(g, {
    x: box.x, y: box.y + 20, size: 7.5, fill: cssVar('--text-faint'), plain: true,
  }, 'continuing steps $M$', 'continuing steps M');
  d3TexLabel(g, {
    x: box.x, y: box.y + box.h + 32, size: 7, italic: true, fill: cssVar('--text-faint'), plain: true,
  }, 'toy runs; the paper proves $M\\leq C\\log_3(2+\\Pi)$', 'toy runs; the paper proves M ≤ C log_3(2+Π)');
}

function layoutBoxes(mode, vbW) {
  const GAP = 16;
  if (mode === 'wide') {
    const leftW = Math.round(vbW * 0.6) - GAP;
    // Left column starts further in (40, not 20): the y-axis tick labels
    // on panels B-D (e.g. "1e-3") are right-anchored just before this x
    // and were running past x=0, off the snapshot's own left edge (audit
    // feedback). The right edge stays put (w shrinks by the same amount).
    const leftX = 40;
    // Gutter wide enough for the right column's own right-anchored y-axis
    // tick labels (e.g. "1e+3", "300"), which sit just LEFT of its boxes:
    // at leftW + 2*GAP they ran into the left column's plots (fc.G1).
    const rightX = leftX + (leftW - 20) + 48;
    const rightW = vbW - rightX;
    let ly = 30;
    const A = {
      x: leftX, y: ly, w: leftW - 20, h: 135,
    };
    ly += A.h + GAP;
    const B = {
      x: leftX, y: ly, w: leftW - 20, h: 120,
    };
    ly += B.h + GAP;
    const C = {
      x: leftX, y: ly, w: leftW - 20, h: 90,
    };
    ly += C.h + GAP;
    const D = {
      x: leftX, y: ly, w: leftW - 20, h: 110,
    };
    ly += D.h + GAP;
    let ry = 30;
    const E = {
      x: rightX, y: ry, w: rightW - 20, h: 190,
    };
    ry += E.h + GAP;
    const F = {
      x: rightX, y: ry, w: rightW - 20, h: 130,
    };
    // Panel F draws its "toy runs; the paper proves..." caption 32px below
    // its own box bottom -- reserve that extra room so it isn't clipped by
    // the figure's overall viewBox height.
    ry += F.h + GAP + 20;
    return {
      boxes: {
        A, B, C, D, E, F,
      },
      height: Math.max(ly, ry),
    };
  }
  // 44, not 30: in the narrow column the hover readout gets its own row
  // (y = 28) under the "toy run" line instead of running into it.
  let y = 44;
  // Same left-margin fix as the wide layout, scaled to the narrow column.
  const leftXNarrow = 36;
  const mk = (h) => {
    const box = {
      x: leftXNarrow, y, w: vbW - 16 - leftXNarrow, h,
    };
    y += h + GAP;
    return box;
  };
  const A = mk(135);
  const B = mk(120);
  const C = mk(90);
  const D = mk(110);
  const E = mk(190);
  const F = mk(130);
  // Same bottom-overflow reservation as the wide layout (panel F's caption
  // draws 32px below its own box).
  y += 20;
  return {
    boxes: {
      A, B, C, D, E, F,
    },
    height: y,
  };
}

export function render(el, {
  theme = 'light', params = {}, snapshot = false,
} = {}) {
  try {
    checkMustHoldSweep();
    renderInner(el, params, snapshot);
  } catch (err) {
    showAssertionError(el, 'fig.counting-scales', err.message);
  }
}

function renderInner(el, params, snapshot) {
  el.innerHTML = '';
  el.classList.add('figure-counting-scales');
  // One column wrapper for the banner, controls and SVG: the mount itself
  // (.figure-mount) is a centring flex ROW, which laid these side by side
  // and shrank the SVG to a sliver.
  const root = document.createElement('div');
  root.className = 'd3-figure';
  root.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;min-width:0;';
  el.appendChild(root);

  const piParam = (params && params.log10_Pi) || PI_SLIDER;
  const pParam = (params && params.p) || P_SLIDER;
  const idPrefix = elId(el);
  const bannerText = 'toy run · synthetic determinant losses · illustrative constants (not the paper’s)';

  const banner = document.createElement('p');
  banner.className = 'figure-banner';
  banner.textContent = bannerText;
  root.appendChild(banner);

  const controls = document.createElement('div');
  controls.className = 'figure-controls';
  const piCtl = makeSliderControl({
    id: `${idPrefix}-pi`,
    label: 'Π = 10^x',
    labelTex: '$\\Pi=10^x$',
    min: piParam.min,
    max: piParam.max,
    step: piParam.step,
    value: piParam.default,
    formatValue: (v) => `Π=10^${v}`,
    formatTex: (v) => `$\\Pi=10^{${v}}$`,
  });
  const pCtl = makeSliderControl({
    id: `${idPrefix}-p`,
    label: 'burst rate p',
    labelTex: 'burst rate $p$',
    min: pParam.min,
    max: pParam.max,
    step: pParam.step,
    value: pParam.default,
    formatValue: (v) => v.toFixed(2),
  });
  const newRunBtn = makeButtonControl({ id: `${idPrefix}-newrun`, label: 'new random run' });
  const playBtn = makeButtonControl({ id: `${idPrefix}-play`, label: 'play' });
  const showAllBtn = makeButtonControl({ id: `${idPrefix}-showall`, label: 'show all' });
  controls.append(piCtl.wrap, pCtl.wrap, newRunBtn, playBtn, showAllBtn);
  root.appendChild(controls);

  const svgHost = document.createElement('div');
  root.appendChild(svgHost);

  const constantsDetails = document.createElement('details');
  constantsDetails.className = 'figure-toy-constants';
  const summary = document.createElement('summary');
  summary.textContent = 'toy constants';
  constantsDetails.appendChild(summary);
  const constantsList = document.createElement('code');
  // The constants that stand for a symbol of the paper are typeset as that
  // symbol; the toy model's own knobs (Etr, beta, bmin, bmax, maxSteps)
  // have none and keep their code names.
  const TOY_SYMBOLS = {
    d: 'd', Q: 'Q', h: 'h', L: 'L', H: 'H', C: 'C', eta: '\\eta', eps: '\\varepsilon', sigma: '\\sigma', delta: '\\delta',
  };
  texHtml(
    constantsList,
    Object.entries(TOY_CONSTANTS).map(([k, v]) => (TOY_SYMBOLS[k] ? `$${TOY_SYMBOLS[k]}=${v}$` : `${k}=${v}`)).join('\u2003'),
    Object.entries(TOY_CONSTANTS).map(([k, v]) => `${k}=${v}`).join('  '),
  );
  constantsDetails.appendChild(constantsList);
  root.appendChild(constantsDetails);

  const state = {
    seed: 1, revealCount: null, playTimer: null,
  };

  function stopPlay() {
    if (state.playTimer) { clearInterval(state.playTimer); state.playTimer = null; }
  }

  function currentOut() {
    const Pi = 10 ** Number(piCtl.input.value);
    const p = Number(pCtl.input.value);
    const out = toyRun({
      Pi, seed: state.seed, p, ...TOY_CONSTANTS,
    });
    checkMustHold(out, TOY_CONSTANTS);
    out.piRef = Pi;
    return out;
  }

  function measuredWidth() {
    try {
      const r = el.getBoundingClientRect();
      if (r && r.width > 0) return r.width;
    } catch { /* jsdom: no layout box */ }
    return 900; // headless/default: render the wide layout
  }

  // Every redraw after the first (slider, buttons, play ticks, resize) goes
  // through this wrapper, so a failed MUST HOLD check -- or a run with no
  // stop within the step limit -- shows the required error box instead of
  // throwing from an event handler (fc.H1). The first render is already
  // covered by render()'s own try/catch.
  function safeRedraw() {
    try {
      redraw();
    } catch (err) {
      stopPlay();
      showAssertionError(el, 'fig.counting-scales', err.message);
    }
  }

  function redraw() {
    const out = currentOut();
    if (state.revealCount == null) state.revealCount = out.length;
    state.revealCount = clamp(state.revealCount, 1, out.length);

    const mode = measuredWidth() < NARROW_BREAKPOINT ? 'narrow' : 'wide';
    const vbW = mode === 'wide' ? 860 : 440;
    const { boxes, height: bodyHeight } = layoutBoxes(mode, vbW);

    svgHost.innerHTML = '';
    const svg = d3.select(svgHost).append('svg')
      .attr('width', '100%')
      .attr('role', 'img')
      .attr('aria-label', 'Counting the steps of the global selection: a toy run');

    let captionHeight = 0;
    if (snapshot) {
      const capG = svg.append('g');
      captionHeight = drawSnapshotCaption(capG, vbW, [
        `banner: ${bannerText}`,
        `Π = 10^x (slider ${piParam.min}..${piParam.max} step ${piParam.step}, default ${piParam.default})`,
        `burst rate p (slider ${pParam.min}..${pParam.max} step ${pParam.step}, default ${pParam.default})`,
        `seed: ${state.seed} (default 1; "new random run" advances it)`,
        'buttons: new random run | play | show all',
        `toy constants: ${Object.entries(TOY_CONSTANTS).map(([k, v]) => `${k}=${v}`).join(' ')}`,
      ]);
    }
    const yOff = captionHeight + (captionHeight > 0 ? 8 : 0);
    const height = bodyHeight + yOff;
    svg.attr('viewBox', `0 0 ${vbW} ${height}`);

    const body = svg.append('g').attr('transform', `translate(0,${yOff})`);

    d3TexLabel(body, {
      x: 20, y: 14, size: 9, italic: true, fill: cssVar('--text-faint'), plain: true,
    }, `toy run · $M=${continuingSteps(out)}$ continuing steps`, `toy run · M=${continuingSteps(out)} continuing steps`);

    const revealed = out.slice(0, state.revealCount);
    revealed.piRef = out.piRef;
    const dense = revealed.length > 150;

    const readout = body.append('g').attr('class', 'cs-readout');
    // The hover readout is redrawn (not re-texted) on every step change: a
    // typeset label is a foreignObject, not a <text> whose content can be
    // swapped.
    const sci = (v) => {
      const [m, e] = v.toExponential(2).split('e');
      return `${m}\\times10^{${Number(e)}}`;
    };

    let xScaleRef = null;
    let phaseRefs = null;
    function showReadout(i) {
      const rec = revealed[clamp(i, 0, revealed.length - 1)];
      if (!rec) return;
      readout.selectAll('*').remove();
      d3TexLabel(readout, {
        x: vbW - 16, y: mode === 'narrow' ? 28 : 14, anchor: 'end', size: 8.5, fill: cssVar('--text'), plain: true,
      }, `$i=${rec.i}$ ${rec.kind}\u2003$n=${rec.n}$\u2002$k=${rec.k}$\u2002$\\mathrm{adv}=${rec.adv}$\u2003$E=${sci(rec.E)}$\u2002$\\mu=${rec.mu.toFixed(3)}$\u2002$\\log\\det=${rec.ell.toFixed(2)}$`,
      `i=${rec.i} ${rec.kind}  n=${rec.n} k=${rec.k} adv=${rec.adv}  E=${rec.E.toExponential(2)} μ=${rec.mu.toFixed(3)} log det=${rec.ell.toFixed(2)}`);
      body.selectAll('.cs-guideline').remove();
      const gx = xScaleRef ? xScaleRef(i) : null;
      if (gx != null) {
        body.insert('line', ':first-child').attr('class', 'cs-guideline')
          .attr('x1', gx).attr('x2', gx).attr('y1', boxes.A.y).attr('y2', boxes.D.y + boxes.D.h)
          .attr('stroke', cssVar('--text-faint')).attr('stroke-dasharray', '2,2');
      }
      if (phaseRefs) phaseRefs.selectStep(i);
    }

    const gA = body.append('g');
    const defaultI = revealed.length - 1;
    const panelAScales = drawPanelA(gA, boxes.A, revealed);
    xScaleRef = panelAScales.x;

    const gB = body.append('g');
    drawPanelB(gB, boxes.B, revealed, xScaleRef, dense);
    const gC = body.append('g');
    drawPanelC(gC, boxes.C, revealed, xScaleRef);
    const gD = body.append('g');
    drawPanelD(gD, boxes.D, revealed, xScaleRef);
    const gE = body.append('g');
    phaseRefs = drawPanelE(gE, boxes.E, revealed, dense, showReadout, defaultI);
    // Appended AFTER panels A-D so it wins pointer hit-testing across the
    // whole shared column, including directly over a B/C/D mark.
    const gHit = body.append('g');
    drawStepHitLayer(gHit, boxes.A, revealed, xScaleRef, panelAScales.top, showReadout, defaultI, boxes.D.y + boxes.D.h, dense);
    const gF = body.append('g');
    const pNow = Number(pCtl.input.value);
    if (state.insetP !== pNow || !state.insetData) {
      state.insetData = computeInsetData(pNow);
      state.insetP = pNow;
    }
    drawPanelF(gF, boxes.F, state.insetData, { x: log3(2 + out.piRef), m: continuingSteps(out) });

    showReadout(defaultI);
  }

  piCtl.input.addEventListener('input', () => { stopPlay(); state.revealCount = null; safeRedraw(); });
  pCtl.input.addEventListener('input', () => { stopPlay(); state.revealCount = null; safeRedraw(); });
  newRunBtn.addEventListener('click', () => { stopPlay(); state.seed += 1; state.revealCount = null; safeRedraw(); });
  showAllBtn.addEventListener('click', () => { stopPlay(); state.revealCount = null; safeRedraw(); });
  playBtn.addEventListener('click', () => {
    stopPlay();
    let out;
    try {
      out = currentOut();
    } catch (err) {
      showAssertionError(el, 'fig.counting-scales', err.message);
      return;
    }
    if (!motionOk()) { state.revealCount = out.length; safeRedraw(); return; }
    state.revealCount = 1;
    safeRedraw();
    // Reveal exactly one record per tick (~40ms), per the design brief --
    // audit feedback: an earlier version cleared the timer on its own
    // first tick (redraw() unconditionally stopped any running timer) and
    // skipped multiple records per tick for long runs.
    state.playTimer = setInterval(() => {
      if (state.revealCount >= out.length) { stopPlay(); return; }
      state.revealCount += 1;
      safeRedraw();
      if (state.revealCount >= out.length) stopPlay();
    }, 40);
  });

  if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'function') {
    // Width changes only (see svgkit's watchResize): a redraw that changes
    // the mount's height must not trigger another one.
    let lastWidth = null;
    const ro = new window.ResizeObserver((entries) => {
      const w = Math.round(entries[entries.length - 1].contentRect.width);
      if (w === lastWidth) return;
      lastWidth = w;
      safeRedraw();
    });
    ro.observe(el);
  }

  redraw();
}

let idCounter = 0;
const idMap = new WeakMap();
function elId(el) {
  if (!idMap.has(el)) {
    idCounter += 1;
    idMap.set(el, `fig-counting-scales-${idCounter}`);
  }
  return idMap.get(el);
}
