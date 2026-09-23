// Tiny vanilla-DOM element builder shared by the D3 figures.
//
// D3's own selection API is deliberately NOT used inside figure modules:
// site/index.html loads vendor/d3.min.js as a classic global <script>
// (before app.js, which has no import map), so a figure module that did
// `import * as d3 from 'd3'` would resolve fine under Node (the bare
// specifier is what scripts/snapshot_figures.mjs's dynamic `import()` and
// `npm test` both run under) but fail to resolve in the browser; relying
// on a global `d3`/`window.d3` instead fails the other way, since the
// headless jsdom snapshot harness (scripts/lib/figureSnapshot.mjs) never
// attaches one. Plain DOM calls -- available as globals `document` in the
// browser and set as such by the snapshot harness -- work identically in
// both places, so figures are built with them directly.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create one element. `svg: true` (default) uses the SVG namespace;
 * `svg: false` creates a plain HTML element (for controls/captions
 * alongside the SVG). Attribute values of `null`/`undefined` are skipped
 * so callers can pass conditional attributes inline; an `on:<event>` key
 * attaches a listener instead of setting an attribute. */
export function el(tag, attrs = {}, children = [], { svg = true } = {}) {
  const node = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k.startsWith('on:')) node.addEventListener(k.slice(3), v);
    else if (k === 'class') node.setAttribute('class', v);
    else node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
}

export function svgEl(tag, attrs, children) { return el(tag, attrs, children, { svg: true }); }
export function htmlEl(tag, attrs, children) { return el(tag, attrs, children, { svg: false }); }

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function setAttrs(node, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) node.removeAttribute(k);
    else node.setAttribute(k, String(v));
  }
  return node;
}
