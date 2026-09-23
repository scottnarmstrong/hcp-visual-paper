// The top-down "maximal aligned triadic squares" selection shared by the
// Whitney-type constructions (content/figures/fig.whitney-fill.yaml's
// SELECTION ALGORITHM and fig.two-grid-sandwich.yaml's "SELECTION OF
// MAXIMAL SQUARES", which are the same rule): given a cap scale and a
// floor scale, find the maximal aligned squares of scale <= cap contained
// in a region, subdividing (into 9 triadic children) wherever a square
// only partly overlaps the region, down to the floor, where a still-
// straddling square is reported as "remainder" instead of being forced to
// a decision.
//
// Two region shapes are needed: a convex polygon (used directly), and
// "everything not covered by a fixed set of packed cells" (used by
// fig.two-grid-sandwich's PACK, where the packed cells are themselves
// convex polygons but their union need not be convex).

import {
  squareCorners, allPointsInConvexCCW, clipConvex, polygonArea, ensureCCW, boundingBox,
} from './geom2d.mjs';

function candidateCenters(bbox, capSide) {
  const iMin = Math.floor((bbox.xMin - capSide / 2) / capSide) - 1;
  const iMax = Math.ceil((bbox.xMax + capSide / 2) / capSide) + 1;
  const jMin = Math.floor((bbox.yMin - capSide / 2) / capSide) - 1;
  const jMax = Math.ceil((bbox.yMax + capSide / 2) / capSide) + 1;
  const out = [];
  for (let i = iMin; i <= iMax; i += 1) {
    for (let j = jMin; j <= jMax; j += 1) out.push([i * capSide, j * capSide]);
  }
  return out;
}

/**
 * Select the maximal aligned triadic squares of scale <= `cap` contained
 * in the convex polygon `polyT`, truncated at `floor`. Returns
 * `{ selected: [{cx,cy,r}], remainder: [{cx,cy,r}], areaT }`.
 */
export function selectInConvex(polyT, { cap, floor, eps = 1e-9 }) {
  const T = ensureCCW(polyT);
  const areaT = polygonArea(T);
  const bbox = boundingBox(T);
  const selected = [];
  const remainder = [];

  function recurse(cx, cy, r) {
    const hs = 3 ** r / 2;
    const corners = squareCorners(cx, cy, hs);
    if (allPointsInConvexCCW(corners, T, eps)) { selected.push({ cx, cy, r }); return; }
    const clipped = clipConvex(corners, T);
    const overlap = clipped.length >= 3 ? polygonArea(clipped) : 0;
    if (overlap < eps * 9 ** r) return; // interior(Sq) does not meet interior(T)
    if (r > floor) {
      const childSide = 3 ** (r - 1);
      for (let di = -1; di <= 1; di += 1) {
        for (let dj = -1; dj <= 1; dj += 1) {
          recurse(cx + di * childSide, cy + dj * childSide, r - 1);
        }
      }
    } else {
      remainder.push({ cx, cy, r });
    }
  }

  const side = 3 ** cap;
  for (const [cx, cy] of candidateCenters(bbox, side)) recurse(cx, cy, cap);
  return { selected, remainder, areaT };
}

/** Volume fraction f_r = (#selected at scale r) * 9^r / areaT, keyed by r
 * (as a string, since Map/object keys stringify numbers anyway). */
export function volumeFractionsByScale({ selected, areaT }) {
  const byScale = new Map();
  for (const { r } of selected) byScale.set(r, (byScale.get(r) || 0) + 9 ** r);
  const fractions = new Map();
  for (const [r, area] of byScale) fractions.set(r, area / areaT);
  return fractions;
}

/**
 * fig.two-grid-sandwich's PACK step: select the maximal aligned triadic
 * squares of scale <= `cap` contained in `S \ (union of packedCells)`,
 * where `packedCells` are convex polygons (need not tile or be axis
 * aligned) and `S` is itself convex (so the starting candidate squares are
 * generated exactly as in `selectInConvex`). A candidate square is:
 *  - SELECTED if it meets the interior of no packed cell (it is entirely
 *    in the uncovered part, or entirely outside S -- callers should only
 *    pass candidates overlapping S to begin with, via `startSquares`);
 *  - dropped if every packed cell it meets fully covers... rather, per the
 *    spec, dropped if it meets at least one cell and EVERY cell it meets
 *    is a packed cell (the paper's rule tests against ALL lattice cells
 *    the square meets, not just the packed ones -- here every cell passed
 *    in `packedCells` already IS a packed cell, and `unpackedNear(sq)`
 *    supplies the unpacked cells the square might also meet, exactly as
 *    the paper's Wsq does);
 *  - otherwise recursed into 9 children down to `floor`, where a still-
 *    mixed square is remainder.
 */
export function selectAroundPackedCells({
  startSquares, packedCells, unpackedNear, floor, eps = 1e-9,
}) {
  const selected = [];
  const remainder = [];
  const packed = packedCells.map((c) => ensureCCW(c));

  function meetingPacked(corners, areaSq) {
    const hits = [];
    for (const cell of packed) {
      const bb = boundingBox(cell);
      const bs = boundingBox(corners);
      if (bb.xMax < bs.xMin || bb.xMin > bs.xMax || bb.yMax < bs.yMin || bb.yMin > bs.yMax) continue;
      const clipped = clipConvex(corners, cell);
      if (clipped.length >= 3 && polygonArea(clipped) > eps * areaSq) hits.push(cell);
    }
    return hits;
  }

  function meetsAnyUnpacked(corners, areaSq, r) {
    if (!unpackedNear) return false;
    const nearby = unpackedNear(corners, r);
    for (const cell of nearby) {
      const clipped = clipConvex(corners, ensureCCW(cell));
      if (clipped.length >= 3 && polygonArea(clipped) > eps * areaSq) return true;
    }
    return false;
  }

  function recurse(cx, cy, r) {
    const hs = 3 ** r / 2;
    const corners = squareCorners(cx, cy, hs);
    const areaSq = 9 ** r;
    const packedHits = meetingPacked(corners, areaSq);
    if (packedHits.length === 0) { selected.push({ cx, cy, r }); return; }
    const touchesUnpacked = meetsAnyUnpacked(corners, areaSq, r);
    if (!touchesUnpacked) return; // every meeting cell is packed -> fully covered, drop
    if (r > floor) {
      const childSide = 3 ** (r - 1);
      for (let di = -1; di <= 1; di += 1) {
        for (let dj = -1; dj <= 1; dj += 1) {
          recurse(cx + di * childSide, cy + dj * childSide, r - 1);
        }
      }
    } else {
      remainder.push({ cx, cy, r });
    }
  }

  for (const { cx, cy, r } of startSquares) recurse(cx, cy, r);
  return { selected, remainder };
}
