import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

/* =================== GEOMETRY (normalized 0..1 of the canvas box) ===================
 * Head spans y .030 (crown) -> .620 (chin), so head height Hc ~= .59 canvas units.
 * Profile canon, as a ratio of Hc:  brow .42  eye .50  nose base .68  mouth .78  chin 1
 *   -> canvas y:                    brow .268 eye .325 nose base .431 mouth .490 chin .620
 * Skull depth (forehead .872 -> occiput .338) / head height ~= .78, which is the canon.
 * Pushing the occiput further back than .338 makes the head balloon.
 */
const HEAD_PROFILE = [
  // crown & forehead
  [0.566, 0.030], [0.676, 0.044], [0.774, 0.082], [0.842, 0.140], [0.872, 0.196],
  // brow ridge & nasion (dip between the brows)
  [0.886, 0.232], [0.864, 0.262], [0.878, 0.292],
  // nose bridge -> tip
  [0.894, 0.322], [0.932, 0.360], [0.972, 0.398], [1.000, 0.428],
  // columella / underside of the nose
  [0.946, 0.449],
  // philtrum -> upper lip -> parting -> lower lip
  [0.938, 0.468], [0.962, 0.484], [0.950, 0.495], [0.958, 0.511],
  // mentolabial sulcus -> chin
  [0.920, 0.536], [0.938, 0.566], [0.914, 0.596],
  // jaw line down to the neck
  [0.856, 0.626], [0.790, 0.656], [0.716, 0.684],
  // front of the neck — short (chin .62 -> shoulder .81) so the head does not
  // read as a lollipop on a long stalk
  [0.682, 0.722], [0.670, 0.768],
  // shoulders, flaring out to the frame edge
  [0.752, 0.838], [0.860, 0.898], [0.950, 0.952], [0.985, 1.000],
  [0.105, 1.000], [0.145, 0.950], [0.235, 0.892], [0.322, 0.844],
  // back of the neck — sits ~.13 forward of the occiput. Without that gap the
  // back edge is a straight vertical wall and the whole thing reads as an egg.
  // Points here are deliberately close together: the midpoint-quadratic
  // smoothing damps isolated inflections, so the nuchal hollow only survives
  // if several points describe it.
  [0.462, 0.792], [0.474, 0.752], [0.482, 0.712], [0.484, 0.672],
  // skull-base notch (nuchal hollow). The braincase bottoms out just under the
  // ear (~y .46); only the jaw hangs lower than that, down to the chin at .62.
  [0.478, 0.638], [0.462, 0.604], [0.440, 0.570], [0.416, 0.534],
  [0.396, 0.498], [0.378, 0.462],
  // occipital bulge -> crown
  [0.360, 0.418], [0.346, 0.372], [0.338, 0.322], [0.340, 0.272],
  [0.352, 0.222], [0.372, 0.176], [0.400, 0.132], [0.440, 0.086], [0.498, 0.048]
];

/* Open polylines marking anatomical lines. Uniform point density reads as a
 * head-shaped blob; these are what make it read as a face.
 * Face front x .872, occiput x .338 -> skull span .534. The ear sits ~45-62%
 * back from the face front, spanning vertically from brow to nose base. */
const FEATURE_CURVES = [
  { pts: [[0.764, 0.327], [0.797, 0.311], [0.832, 0.309], [0.858, 0.319]] },   // upper lid
  { pts: [[0.764, 0.327], [0.794, 0.339], [0.830, 0.340], [0.858, 0.319]] },   // lower lid
  { pts: [[0.830, 0.314], [0.842, 0.321], [0.830, 0.334], [0.818, 0.321], [0.830, 0.314]] }, // iris
  { pts: [[0.737, 0.295], [0.782, 0.281], [0.828, 0.279], [0.868, 0.291]] },   // brow
  { pts: [[0.770, 0.311], [0.804, 0.299], [0.838, 0.299]] },                   // lid crease
  { pts: [[0.874, 0.298], [0.890, 0.340], [0.914, 0.380], [0.946, 0.414]] },   // nose bridge
  { pts: [[0.906, 0.434], [0.931, 0.426], [0.949, 0.436], [0.937, 0.448], [0.913, 0.446]] }, // nostril
  { pts: [[0.901, 0.450], [0.889, 0.438], [0.893, 0.422]] },                   // nose wing
  { pts: [[0.846, 0.493], [0.885, 0.491], [0.921, 0.493], [0.949, 0.496]] },   // lip parting
  { pts: [[0.849, 0.492], [0.883, 0.478], [0.919, 0.476], [0.953, 0.484]] },   // upper lip
  { pts: [[0.851, 0.495], [0.885, 0.508], [0.921, 0.510], [0.956, 0.509]] },   // lower lip
  { pts: [[0.899, 0.452], [0.879, 0.472], [0.853, 0.493]] },                   // nasolabial fold
  { pts: [[0.869, 0.534], [0.901, 0.540], [0.927, 0.536]] },                   // chin crease
  { pts: [[0.824, 0.356], [0.766, 0.360], [0.700, 0.356], [0.640, 0.346]] },   // cheekbone
  { pts: [[0.876, 0.562], [0.804, 0.572], [0.722, 0.560], [0.660, 0.512], [0.628, 0.456]] }, // jaw/masseter
  { pts: [                                                                     // ear helix
      [0.620, 0.424], [0.574, 0.416], [0.540, 0.382], [0.534, 0.332],
      [0.558, 0.290], [0.602, 0.274], [0.640, 0.286]
  ] },
  { pts: [[0.610, 0.398], [0.578, 0.370], [0.584, 0.328], [0.612, 0.306]] },   // ear antihelix
  { pts: [[0.620, 0.424], [0.636, 0.410], [0.638, 0.390]] },                   // ear lobe
  { pts: [[0.598, 0.448], [0.632, 0.552], [0.658, 0.664], [0.672, 0.772]] },   // sternocleidomastoid
  { pts: [[0.430, 0.606], [0.482, 0.706], [0.500, 0.812]] },                   // trapezius
  { pts: [[0.836, 0.172], [0.764, 0.128], [0.672, 0.106], [0.582, 0.114]] }    // hairline
];

const BRAIN_CEREBRUM = [
  [0.606, 0.104], [0.688, 0.116], [0.750, 0.150], [0.788, 0.200],
  [0.798, 0.248], [0.778, 0.288], [0.732, 0.310], [0.668, 0.318],
  [0.602, 0.318], [0.540, 0.310], [0.488, 0.292], [0.450, 0.262],
  [0.430, 0.218], [0.434, 0.174], [0.468, 0.134], [0.530, 0.108]
];

const BRAIN_CEREBELLUM = [
  [0.452, 0.316], [0.500, 0.328], [0.518, 0.356], [0.498, 0.382],
  [0.456, 0.384], [0.424, 0.366], [0.418, 0.338]
];

const BRAIN_GYRI = [
  [[0.470, 0.166], [0.532, 0.148], [0.598, 0.148], [0.654, 0.164]],
  [[0.446, 0.220], [0.512, 0.204], [0.586, 0.202], [0.654, 0.214], [0.708, 0.236]],
  [[0.476, 0.272], [0.540, 0.264], [0.610, 0.264], [0.680, 0.274], [0.736, 0.288]],
  [[0.640, 0.122], [0.670, 0.172], [0.680, 0.230], [0.672, 0.294]],
  [[0.748, 0.164], [0.740, 0.212], [0.750, 0.260]]
];

/* Where a portrait would lay down shading ("arsiran"). Each blob is a soft
 * radial falloff [x, y, radius, strength] that raises local point density —
 * shaded zones end up both denser and hotter, which is what sells the form.
 * Tuning the look means nudging these, not re-authoring coordinates. */
const SHADE_BLOBS = [
  [0.858, 0.616, 0.075, 0.55], [0.800, 0.648, 0.075, 0.55], [0.736, 0.676, 0.070, 0.50], // under chin
  [0.680, 0.700, 0.070, 0.42], [0.648, 0.744, 0.085, 0.38],                              // under jaw / neck
  [0.786, 0.572, 0.090, 0.42],                                                            // masseter
  [0.766, 0.440, 0.105, 0.34], [0.700, 0.420, 0.090, 0.26],                              // cheek hollow
  [0.806, 0.328, 0.055, 0.60], [0.772, 0.318, 0.045, 0.40],                              // eye socket
  [0.726, 0.286, 0.075, 0.34],                                                            // temple
  [0.900, 0.440, 0.045, 0.50], [0.918, 0.472, 0.035, 0.34],                              // nose side & philtrum
  [0.902, 0.524, 0.040, 0.40],                                                            // under lower lip
  [0.586, 0.348, 0.062, 0.50], [0.512, 0.404, 0.055, 0.34],                              // ear & behind ear
  [0.636, 0.720, 0.080, 0.34], [0.560, 0.800, 0.090, 0.26],                              // neck shadow
  [0.372, 0.320, 0.090, 0.34], [0.398, 0.430, 0.080, 0.30],                              // back-of-skull rim
  [0.560, 0.200, 0.115, 0.28], [0.660, 0.230, 0.105, 0.26], [0.470, 0.230, 0.090, 0.24], // brain interior
  [0.300, 0.928, 0.100, 0.24], [0.520, 0.906, 0.110, 0.22],                              // shoulders — kept
  [0.740, 0.916, 0.100, 0.22], [0.878, 0.952, 0.085, 0.20]                               // low so the head still leads
];

/* =================== CURVE HELPERS =================== */

// Traces a polyline as a smooth curve: each point is a quadratic control point
// and the curve passes through the midpoints between them.
function traceCurve(ctx, pts, width, height, closed) {
  const p = pts.map(([nx, ny]) => [nx * width, ny * height]);
  ctx.beginPath();
  if (closed) {
    const last = p[p.length - 1];
    ctx.moveTo((last[0] + p[0][0]) / 2, (last[1] + p[0][1]) / 2);
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      const n = p[(i + 1) % p.length];
      ctx.quadraticCurveTo(c[0], c[1], (c[0] + n[0]) / 2, (c[1] + n[1]) / 2);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length - 1; i++) {
      const c = p[i];
      const n = p[i + 1];
      ctx.quadraticCurveTo(c[0], c[1], (c[0] + n[0]) / 2, (c[1] + n[1]) / 2);
    }
    ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
  }
}

// Same curve as traceCurve, but returned as a dense list of points so nodes can
// be placed along it instead of it being stroked.
function flattenCurve(pts, width, height, closed) {
  const p = pts.map(([nx, ny]) => [nx * width, ny * height]);
  const out = [];
  const STEPS = 12;
  const quad = (p0, p1, p2, t) => {
    const mt = 1 - t;
    return [
      mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
      mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
    ];
  };

  let cur;
  if (closed) {
    const last = p[p.length - 1];
    cur = [(last[0] + p[0][0]) / 2, (last[1] + p[0][1]) / 2];
    out.push(cur);
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      const n = p[(i + 1) % p.length];
      const end = [(c[0] + n[0]) / 2, (c[1] + n[1]) / 2];
      for (let s = 1; s <= STEPS; s++) out.push(quad(cur, c, end, s / STEPS));
      cur = end;
    }
  } else {
    cur = p[0];
    out.push(cur);
    for (let i = 1; i < p.length - 1; i++) {
      const c = p[i];
      const n = p[i + 1];
      const end = [(c[0] + n[0]) / 2, (c[1] + n[1]) / 2];
      for (let s = 1; s <= STEPS; s++) out.push(quad(cur, c, end, s / STEPS));
      cur = end;
    }
    out.push(p[p.length - 1]);
  }
  return out;
}

// Walks a dense point list and emits points at a fixed arc-length spacing.
function resample(points, spacing) {
  const out = [points[0]];
  let carried = 0;
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1];
    const b = points[i];
    let d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (carried + d >= spacing) {
      const t = (spacing - carried) / d;
      const nx = a[0] + (b[0] - a[0]) * t;
      const ny = a[1] + (b[1] - a[1]) * t;
      out.push([nx, ny]);
      a = [nx, ny];
      d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      carried = 0;
    }
    carried += d;
  }
  return out;
}

/* =================== MASK & DENSITY =================== */

function buildHeadMask(width, height) {
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const octx = off.getContext('2d');
  octx.fillStyle = '#000';
  traceCurve(octx, HEAD_PROFILE, width, height, true);
  octx.fill();
  return octx.getImageData(0, 0, width, height);
}

function buildDensityMap(width, height) {
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const c = off.getContext('2d');

  c.fillStyle = '#000';
  c.fillRect(0, 0, width, height);

  // Clip to the head so shading never spills outside the silhouette.
  c.save();
  traceCurve(c, HEAD_PROFILE, width, height, true);
  c.clip();
  c.fillStyle = 'rgb(66,66,66)';
  c.fillRect(0, 0, width, height);

  c.globalCompositeOperation = 'lighter';
  const scale = Math.max(width, height);
  SHADE_BLOBS.forEach(([bx, by, br, strength]) => {
    const x = bx * width;
    const y = by * height;
    const r = br * scale;
    const v = Math.round(strength * 255);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v},${v},${v},1)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  });
  c.restore();

  return c.getImageData(0, 0, width, height);
}

function sampleMap(map, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return map.data[(Math.floor(y) * width + Math.floor(x)) * 4];
}

function isInsideMask(mask, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return mask.data[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] > 80;
}

/* =================== NODE / EDGE CONSTRUCTION =================== */

function buildPointCloud(mask, density, width, height) {
  const unit = Math.sqrt(width * height);
  const nodes = [];
  const chains = [];

  const addNode = (x, y, weight, onCurve) => {
    const d = sampleMap(density, width, height, x, y) / 255;
    const bright = onCurve ? Math.random() < 0.12 : Math.random() < 0.05 + d * 0.10;
    nodes.push({
      x, y, baseX: x, baseY: y,
      // Curve nodes are deliberately chunkier and brighter than fill nodes —
      // if the two overlap in weight the anatomical lines drown in the fill
      // and the face stops reading.
      r: (bright ? 2.1 + Math.random() * 1.2
                 : onCurve ? 1.15 + Math.random() * 0.6
                           : 0.55 + Math.random() * 0.5) * weight,
      alpha: onCurve ? 0.76 + Math.random() * 0.24 : 0.18 + d * 0.42,
      bright,
      flare: null,
      depthFactor: 0.6 + Math.random() * 0.4,
      driftAngle: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.6
    });
    return nodes.length - 1;
  };

  // Chains of nodes along a curve, recorded so consecutive ones can be wired
  // together explicitly (the kNN mesh alone can leave gaps in thin features).
  const addCurve = (pts, closed, spacing, weight) => {
    const dense = flattenCurve(pts, width, height, closed);
    const sampled = resample(dense, spacing);
    const start = nodes.length;
    sampled.forEach(([x, y]) => addNode(x, y, weight, true));
    if (nodes.length > start) chains.push([start, nodes.length - 1, closed]);
  };

  // (a) silhouette — carried by nodes, which is how the reference image reads
  addCurve(HEAD_PROFILE, true, unit / 78, 1.05);
  // (b) facial features
  FEATURE_CURVES.forEach((f) => addCurve(f.pts, false, unit / 105, 0.95));
  // (c) brain
  addCurve(BRAIN_CEREBRUM, true, unit / 82, 1.0);
  addCurve(BRAIN_CEREBELLUM, true, unit / 88, 0.95);
  BRAIN_GYRI.forEach((g) => addCurve(g, false, unit / 74, 0.85));

  // (d) density-driven fill: rejection-sample a fine jittered grid so shaded
  // regions collect far more points than open planes like the forehead.
  const step = Math.max(9, unit / 60);
  for (let gy = 0; gy < height; gy += step) {
    for (let gx = 0; gx < width; gx += step) {
      const x = gx + (Math.random() - 0.5) * step * 0.9;
      const y = gy + (Math.random() - 0.5) * step * 0.9;
      if (!isInsideMask(mask, width, height, x, y)) continue;
      const d = sampleMap(density, width, height, x, y) / 255;
      if (Math.random() > d * 1.05) continue;
      addNode(x, y, 0.85 + d * 0.5, false);
    }
  }

  // Flares on a subset of bright nodes plus some sitting on the silhouette,
  // a few long enough to escape the outline into the background.
  const edgeProbe = step * 1.4;
  nodes.forEach((n) => {
    const nearEdge =
      !isInsideMask(mask, width, height, n.x + edgeProbe, n.y) ||
      !isInsideMask(mask, width, height, n.x - edgeProbe, n.y) ||
      !isInsideMask(mask, width, height, n.x, n.y - edgeProbe) ||
      !isInsideMask(mask, width, height, n.x, n.y + edgeProbe);
    if (!(n.bright && Math.random() < 0.28) && !(nearEdge && Math.random() < 0.05)) return;
    const baseLen = nearEdge ? step * (2.2 + Math.random() * 1.6) : step * (0.7 + Math.random() * 0.5);
    n.flare = Array.from({ length: 4 }, (_, i) => ({
      angle: (i / 4) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
      length: baseLen * (0.6 + Math.random() * 0.7)
    }));
  });

  const edges = buildEdges(nodes, chains, step * 2.05);
  return { nodes, edges };
}

// Nearest-neighbour mesh via a spatial hash. The old O(n^2) double loop was
// fine at ~180 nodes but is 1.4M+ distance checks at this density.
function buildEdges(nodes, chains, maxDist) {
  const cell = maxDist;
  const grid = new Map();
  const cellKey = (cx, cy) => (cx + 2048) * 4096 + (cy + 2048);

  nodes.forEach((n, i) => {
    const key = cellKey(Math.floor(n.x / cell), Math.floor(n.y / cell));
    let arr = grid.get(key);
    if (!arr) grid.set(key, (arr = []));
    arr.push(i);
  });

  const seen = new Set();
  const edges = [];
  const pairKey = (a, b) => a * 100000 + b;
  const push = (i, j) => {
    const a = Math.min(i, j);
    const b = Math.max(i, j);
    const key = pairKey(a, b);
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a, b, phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.4 });
  };

  // Wire each curve's consecutive nodes so thin features stay continuous.
  chains.forEach(([start, end, closed]) => {
    for (let i = start; i < end; i++) push(i, i + 1);
    if (closed && end > start) push(end, start);
  });

  const cand = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const cx = Math.floor(n.x / cell);
    const cy = Math.floor(n.y / cell);
    cand.length = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get(cellKey(cx + dx, cy + dy));
        if (!arr) continue;
        for (let m = 0; m < arr.length; m++) {
          const j = arr[m];
          if (j === i) continue;
          const d = Math.hypot(nodes[j].x - n.x, nodes[j].y - n.y);
          if (d < maxDist) cand.push({ j, d });
        }
      }
    }
    cand.sort((a, b) => a.d - b.d);
    for (let m = 0; m < Math.min(3, cand.length); m++) push(i, cand[m].j);
  }

  return edges;
}

const MAX_PARALLAX = 14;
const ALPHA_BUCKETS = 7;
const EDGE_ALPHA_MAX = 0.72;
const NODE_ALPHA_MAX = 1;

function BrainNetwork() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas.parentElement;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d97757';

    let width = 0;
    let height = 0;
    let nodes = [];
    let edges = [];
    let animId = null;
    let resizeTimer = null;
    const mouse = { x: -9999, y: -9999 };
    const parallax = { x: 0, y: 0 };

    // Reused per frame so the batching does not allocate.
    const edgeBuckets = Array.from({ length: ALPHA_BUCKETS }, () => []);
    const nodeBuckets = Array.from({ length: ALPHA_BUCKETS }, () => []);
    const hotEdges = [];
    const hotNodes = [];

    function buildNetwork() {
      width = container.clientWidth;
      height = container.clientHeight;
      if (!width || !height) return;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const mask = buildHeadMask(width, height);
      const density = buildDensityMap(width, height);
      const cloud = buildPointCloud(mask, density, width, height);
      nodes = cloud.nodes;
      edges = cloud.edges;

      canvas.classList.add('is-loaded');
    }

    function frame(t) {
      ctx.clearRect(0, 0, width, height);
      const time = t / 1000;

      // Whole network eases toward the cursor, capped so the head never
      // smears far enough to lose its detail.
      if (!reduceMotion) {
        const nx = Math.max(-1, Math.min(1, (mouse.x - width / 2) / (width / 2)));
        const ny = Math.max(-1, Math.min(1, (mouse.y - height / 2) / (height / 2)));
        parallax.x += (nx * MAX_PARALLAX - parallax.x) * 0.06;
        parallax.y += (ny * MAX_PARALLAX - parallax.y) * 0.06;
      } else {
        parallax.x = 0;
        parallax.y = 0;
      }

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (reduceMotion) {
          n.x = n.baseX;
          n.y = n.baseY;
        } else {
          n.x = n.baseX + parallax.x * n.depthFactor + Math.cos(n.driftAngle + time * 0.15) * 1.4;
          n.y = n.baseY + parallax.y * n.depthFactor + Math.sin(n.driftAngle + time * 0.15) * 1.4;
        }
      }

      for (let i = 0; i < ALPHA_BUCKETS; i++) {
        edgeBuckets[i].length = 0;
        nodeBuckets[i].length = 0;
      }
      hotEdges.length = 0;
      hotNodes.length = 0;

      // ---- edges: bucket by quantized alpha so this is ~7 stroke calls
      // instead of one per edge (there are a few thousand).
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const a = nodes[e.a];
        const b = nodes[e.b];
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const prox = Math.max(0, 1 - Math.hypot(mouse.x - midX, mouse.y - midY) / 140);
        const pulse = reduceMotion ? 0.5 : Math.sin(time * e.speed + e.phase) * 0.5 + 0.5;
        const alpha = Math.min(0.12 + pulse * 0.14 + prox * 0.5, EDGE_ALPHA_MAX);
        if (prox > 0.12) {
          hotEdges.push(a.x, a.y, b.x, b.y, alpha, prox);
          continue;
        }
        const bi = Math.min(ALPHA_BUCKETS - 1, Math.floor((alpha / EDGE_ALPHA_MAX) * ALPHA_BUCKETS));
        edgeBuckets[bi].push(a.x, a.y, b.x, b.y);
      }

      ctx.strokeStyle = accent;
      ctx.lineWidth = 0.55;
      for (let i = 0; i < ALPHA_BUCKETS; i++) {
        const arr = edgeBuckets[i];
        if (!arr.length) continue;
        ctx.globalAlpha = ((i + 0.5) / ALPHA_BUCKETS) * EDGE_ALPHA_MAX;
        ctx.beginPath();
        for (let m = 0; m < arr.length; m += 4) {
          ctx.moveTo(arr[m], arr[m + 1]);
          ctx.lineTo(arr[m + 2], arr[m + 3]);
        }
        ctx.stroke();
      }
      for (let m = 0; m < hotEdges.length; m += 6) {
        ctx.globalAlpha = hotEdges[m + 4];
        ctx.lineWidth = 0.55 + hotEdges[m + 5] * 1.2;
        ctx.beginPath();
        ctx.moveTo(hotEdges[m], hotEdges[m + 1]);
        ctx.lineTo(hotEdges[m + 2], hotEdges[m + 3]);
        ctx.stroke();
      }

      // ---- nodes: the dim majority batches the same way; only bright and
      // near-cursor nodes pay for an individual shadowBlur pass.
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const prox = Math.max(0, 1 - Math.hypot(mouse.x - n.x, mouse.y - n.y) / 130);
        const glow = reduceMotion ? 0.72 : Math.sin(time * n.speed + n.phase) * 0.28 + 0.72;
        const alpha = Math.min(n.alpha * glow + prox * 0.4, NODE_ALPHA_MAX);
        if (n.bright || n.flare || prox > 0.12) {
          hotNodes.push({ n, prox, alpha });
          continue;
        }
        const bi = Math.min(ALPHA_BUCKETS - 1, Math.floor((alpha / NODE_ALPHA_MAX) * ALPHA_BUCKETS));
        nodeBuckets[bi].push(n.x, n.y, n.r);
      }

      ctx.fillStyle = accent;
      for (let i = 0; i < ALPHA_BUCKETS; i++) {
        const arr = nodeBuckets[i];
        if (!arr.length) continue;
        ctx.globalAlpha = ((i + 0.5) / ALPHA_BUCKETS) * NODE_ALPHA_MAX;
        ctx.beginPath();
        for (let m = 0; m < arr.length; m += 3) {
          ctx.moveTo(arr[m] + arr[m + 2], arr[m + 1]);
          ctx.arc(arr[m], arr[m + 1], arr[m + 2], 0, Math.PI * 2);
        }
        ctx.fill();
      }

      ctx.save();
      ctx.shadowColor = accent;
      for (let i = 0; i < hotNodes.length; i++) {
        const { n, prox, alpha } = hotNodes[i];
        if (n.flare) {
          const shimmer = reduceMotion ? 0.7 : Math.sin(time * n.speed * 0.6 + n.phase) * 0.3 + 0.7;
          ctx.shadowBlur = 0;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 0.55;
          ctx.globalAlpha = Math.min(0.2 * shimmer + prox * 0.3, 0.55);
          ctx.beginPath();
          for (let r = 0; r < n.flare.length; r++) {
            const ray = n.flare[r];
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(n.x + Math.cos(ray.angle) * ray.length, n.y + Math.sin(ray.angle) * ray.length);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = (n.bright ? 6 : 3) + prox * 6;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + prox * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(frame);
    }

    function handlePointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }

    function handleWindowBlur() {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    function handleResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(buildNetwork, 150);
    }

    buildNetwork();
    animId = requestAnimationFrame(frame);

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  return React.createElement('canvas', { ref: canvasRef, className: 'intro__brain-canvas' });
}

const mountEl = document.getElementById('brain-root');
if (mountEl) {
  createRoot(mountEl).render(React.createElement(BrainNetwork));
}
