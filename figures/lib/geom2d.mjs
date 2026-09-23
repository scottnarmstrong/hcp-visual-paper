// Convex-polygon primitives shared by the figures that select or clip
// aligned triadic squares against a (possibly skewed) target cube --
// content/figures/fig.two-grid-sandwich.yaml's FILL/PACK constructions.
// A polygon is a plain array of [x, y] points.

export function polygonAreaSigned(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polygonArea(poly) {
  return poly.length >= 3 ? Math.abs(polygonAreaSigned(poly)) : 0;
}

export function ensureCCW(poly) {
  return polygonAreaSigned(poly) < 0 ? [...poly].reverse() : poly;
}

export function boundingBox(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return {
    xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys),
  };
}

export function squareCorners(cx, cy, halfSide) {
  return [
    [cx - halfSide, cy - halfSide],
    [cx + halfSide, cy - halfSide],
    [cx + halfSide, cy + halfSide],
    [cx - halfSide, cy + halfSide],
  ];
}

/** True if `pt` lies in the closed region bounded by CCW convex `poly`,
 * up to tolerance `eps` (so points on the boundary count as inside). */
export function pointInConvexCCW(pt, poly, eps = 1e-9) {
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    const cross = (bx - ax) * (pt[1] - ay) - (by - ay) * (pt[0] - ax);
    if (cross < -eps) return false;
  }
  return true;
}

export function allPointsInConvexCCW(pts, poly, eps = 1e-9) {
  return pts.every((p) => pointInConvexCCW(p, poly, eps));
}

function intersectEdge(p1, p2, a, b) {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dax = bx - ax;
  const day = by - ay;
  const d1 = dax * (y1 - ay) - day * (x1 - ax);
  const d2 = dax * (y2 - ay) - day * (x2 - ax);
  const t = d1 / (d1 - d2);
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

/** Sutherland-Hodgman clip of polygon `subject` (any orientation) against
 * convex CCW polygon `clip`. Returns the (possibly empty) intersection
 * polygon. */
export function clipConvex(subject, clip) {
  let output = subject;
  const n = clip.length;
  for (let i = 0; i < n && output.length > 0; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % n];
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j += 1) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const curIn = (b[0] - a[0]) * (cur[1] - a[1]) - (b[1] - a[1]) * (cur[0] - a[0]) >= -1e-12;
      const prevIn = (b[0] - a[0]) * (prev[1] - a[1]) - (b[1] - a[1]) * (prev[0] - a[0]) >= -1e-12;
      if (curIn) {
        if (!prevIn) output.push(intersectEdge(prev, cur, a, b));
        output.push(cur);
      } else if (prevIn) {
        output.push(intersectEdge(prev, cur, a, b));
      }
    }
  }
  return output;
}

/** Area of the interior overlap of `polyA` (any orientation) and CCW
 * convex `polyB`. */
export function overlapArea(polyA, polyB) {
  const clipped = clipConvex(polyA, polyB);
  return polygonArea(clipped);
}

/** Apply a linear map `matVecFn` (e.g. `(v) => matVec(q, v)`) to every
 * vertex of `poly`, then translate by `[tx, ty]`. */
export function transformPolygon(poly, matVecFn, t = [0, 0]) {
  return poly.map((p) => {
    const [x, y] = matVecFn(p);
    return [x + t[0], y + t[1]];
  });
}

export function distance(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }

/** Distance from point `p` to the closed segment `[a, b]`. */
export function distPointToSegment(p, a, b) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2)) : 0;
  return distance(p, [a[0] + t * abx, a[1] + t * aby]);
}

/**
 * The true minimum Euclidean distance between two convex polygons AS
 * SETS (not their centers): 0 if they overlap, otherwise the smallest
 * vertex-to-edge distance over both polygons (sufficient for convex,
 * non-overlapping shapes -- the closest pair of points always includes a
 * vertex of one polygon and a point on an edge of the other). Also
 * returns the closest point pair, for drawing an accurate dimension line.
 */
export function polygonDistance(polyA, polyB) {
  const A = ensureCCW(polyA);
  const B = ensureCCW(polyB);
  if (A.some((v) => pointInConvexCCW(v, B)) || B.some((v) => pointInConvexCCW(v, A))) {
    return { dist: 0, pointA: A[0], pointB: A[0] };
  }
  let best = { dist: Infinity, pointA: A[0], pointB: B[0] };
  const consider = (pt, poly, swap) => {
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const len2 = abx * abx + aby * aby;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * abx + (pt[1] - a[1]) * aby) / len2)) : 0;
      const proj = [a[0] + t * abx, a[1] + t * aby];
      const d = distance(pt, proj);
      if (d < best.dist) best = swap ? { dist: d, pointA: proj, pointB: pt } : { dist: d, pointA: pt, pointB: proj };
    }
  };
  for (const v of A) consider(v, B, false);
  for (const v of B) consider(v, A, true);
  return best;
}

/** Distance from point `p` to the boundary of convex polygon `poly`
 * (0 if `p` is inside), used for an "does this cell meet a disc of
 * radius r around p" test. */
export function distPointToPolygon(p, poly) {
  const P = ensureCCW(poly);
  if (pointInConvexCCW(p, P)) return 0;
  let d = Infinity;
  for (let i = 0; i < P.length; i += 1) {
    d = Math.min(d, distPointToSegment(p, P[i], P[(i + 1) % P.length]));
  }
  return d;
}
