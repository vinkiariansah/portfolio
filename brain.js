import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// Siluet kepala (profil menghadap kanan) digambar dari daftar titik manual
// (bukan aset gambar) dan dipakai sebagai mask, bukan garis outline yang
// digambar langsung — bentuknya terbaca dari kepadatan titik "neuron" saja.
const HEAD_PROFILE = [
  [0.50, 0.02], [0.60, 0.03], [0.70, 0.06], [0.78, 0.12], [0.83, 0.18],
  [0.85, 0.21], [0.82, 0.24], [0.84, 0.27], [0.87, 0.31], [0.93, 0.36],
  [0.98, 0.40], [0.93, 0.43], [0.94, 0.45], [0.96, 0.47], [0.92, 0.50],
  [0.94, 0.52], [0.89, 0.55], [0.90, 0.59], [0.84, 0.64], [0.78, 0.68],
  [0.72, 0.74], [0.68, 0.82], [0.67, 0.92], [0.66, 1.00], [0.30, 1.00],
  [0.32, 0.90], [0.34, 0.78], [0.33, 0.66], [0.30, 0.52], [0.32, 0.38],
  [0.38, 0.24], [0.44, 0.12]
];

// Menelusuri titik-titik profil dengan kurva halus (tiap titik jadi control
// point, kurva sebenarnya lewat titik tengah antar-titik) supaya garis wajah
// mulus, bukan garis lurus patah-patah.
function traceHeadPath(ctx, width, height) {
  const pts = HEAD_PROFILE.map(([nx, ny]) => [nx * width, ny * height]);
  const last = pts[pts.length - 1];
  const first = pts[0];

  ctx.beginPath();
  ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];
    const midX = (curr[0] + next[0]) / 2;
    const midY = (curr[1] + next[1]) / 2;
    ctx.quadraticCurveTo(curr[0], curr[1], midX, midY);
  }
  ctx.closePath();
}

function buildHeadMask(width, height) {
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const octx = off.getContext('2d');
  octx.fillStyle = '#000';
  traceHeadPath(octx, width, height);
  octx.fill();
  return octx.getImageData(0, 0, width, height);
}

function isInsideMask(mask, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return mask.data[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] > 80;
}

// Titik-titik "neuron" disebar merata ke SELURUH siluet kepala lewat
// jittered-grid sampling, dihubungkan ke tetangga terdekat jadi mesh, dan
// sebagian titik terang/dekat tepi dapat "flare" (garis cahaya memancar,
// sebagian sengaja menembus keluar garis kepala).
function buildPointCloud(mask, width, height) {
  const cellSize = Math.max(14, Math.sqrt(width * height) / 17);
  const nodes = [];

  for (let gy = 0; gy < height; gy += cellSize) {
    for (let gx = 0; gx < width; gx += cellSize) {
      const x = gx + (Math.random() - 0.5) * cellSize * 0.85;
      const y = gy + (Math.random() - 0.5) * cellSize * 0.85;
      if (!isInsideMask(mask, width, height, x, y)) continue;

      const nearEdge =
        !isInsideMask(mask, width, height, x + cellSize * 1.4, y) ||
        !isInsideMask(mask, width, height, x - cellSize * 1.4, y) ||
        !isInsideMask(mask, width, height, x, y - cellSize * 1.4) ||
        !isInsideMask(mask, width, height, x, y + cellSize * 1.4);
      const bright = Math.random() < 0.09;

      let flare = null;
      if (bright || (nearEdge && Math.random() < 0.22)) {
        const rayCount = 4;
        const baseLen = nearEdge ? cellSize * (2.2 + Math.random() * 1.6) : cellSize * (0.9 + Math.random() * 0.6);
        flare = {
          rays: Array.from({ length: rayCount }, (_, i) => ({
            angle: (i / rayCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
            length: baseLen * (0.6 + Math.random() * 0.7)
          }))
        };
      }

      nodes.push({
        x, y, baseX: x, baseY: y,
        r: bright ? 2.2 + Math.random() * 1.0 : 1 + Math.random() * 0.8,
        bright,
        flare,
        depthFactor: 0.6 + Math.random() * 0.4,
        driftAngle: Math.random() * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.6
      });
    }
  }

  const edges = [];
  const maxDist = cellSize * 2.3;
  for (let i = 0; i < nodes.length; i++) {
    const candidates = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < maxDist) candidates.push({ j, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    candidates.slice(0, 4).forEach(({ j }) => {
      if (i < j) {
        edges.push({ a: i, b: j, phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.4 });
      }
    });
  }

  return { nodes, edges };
}

const MAX_PARALLAX = 14;

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
      const cloud = buildPointCloud(mask, width, height);
      nodes = cloud.nodes;
      edges = cloud.edges;

      canvas.classList.add('is-loaded');
    }

    function frame(t) {
      ctx.clearRect(0, 0, width, height);
      const time = t / 1000;

      // Jaringan bergeser halus mengikuti arah kursor (parallax/tilt ringan,
      // dibatasi MAX_PARALLAX supaya bentuk kepala tidak pernah hilang
      // detailnya), dengan easing supaya tidak "menyentak".
      if (!reduceMotion) {
        const nx = Math.max(-1, Math.min(1, (mouse.x - width / 2) / (width / 2)));
        const ny = Math.max(-1, Math.min(1, (mouse.y - height / 2) / (height / 2)));
        parallax.x += (nx * MAX_PARALLAX - parallax.x) * 0.06;
        parallax.y += (ny * MAX_PARALLAX - parallax.y) * 0.06;
      } else {
        parallax.x = 0;
        parallax.y = 0;
      }

      // Garis siluet sangat tipis sebagai penuntun bentuk — ikut bergeser
      // sama besar dengan parallax supaya tetap menyatu dengan titik-titik
      // di dalamnya (bukan diam sementara isinya bergerak).
      ctx.save();
      ctx.translate(parallax.x, parallax.y);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.16;
      traceHeadPath(ctx, width, height);
      ctx.stroke();
      ctx.restore();

      nodes.forEach((n) => {
        if (!reduceMotion) {
          const drift = 1.6;
          n.x = n.baseX + parallax.x * n.depthFactor + Math.cos(n.driftAngle + time * 0.15) * drift;
          n.y = n.baseY + parallax.y * n.depthFactor + Math.sin(n.driftAngle + time * 0.15) * drift;
        } else {
          n.x = n.baseX;
          n.y = n.baseY;
        }
      });

      edges.forEach((e) => {
        const a = nodes[e.a];
        const b = nodes[e.b];
        if (!a || !b) return;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const proximity = Math.max(0, 1 - Math.hypot(mouse.x - midX, mouse.y - midY) / 140);
        const pulse = reduceMotion ? 0.5 : Math.sin(time * e.speed + e.phase) * 0.5 + 0.5;
        ctx.strokeStyle = accent;
        ctx.globalAlpha = Math.min(0.08 + pulse * 0.16 + proximity * 0.55, 0.9);
        ctx.lineWidth = 0.6 + proximity * 1.2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });

      nodes.forEach((n) => {
        const proximity = Math.max(0, 1 - Math.hypot(mouse.x - n.x, mouse.y - n.y) / 130);
        const glow = reduceMotion ? 0.6 : Math.sin(time * n.speed + n.phase) * 0.35 + 0.65;

        if (n.flare) {
          const shimmer = reduceMotion ? 0.7 : Math.sin(time * n.speed * 0.6 + n.phase) * 0.3 + 0.7;
          ctx.save();
          ctx.strokeStyle = accent;
          ctx.lineWidth = 0.6;
          n.flare.rays.forEach((ray) => {
            ctx.globalAlpha = Math.min(0.22 * shimmer + proximity * 0.3, 0.6);
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(n.x + Math.cos(ray.angle) * ray.length, n.y + Math.sin(ray.angle) * ray.length);
            ctx.stroke();
          });
          ctx.restore();
        }

        ctx.save();
        ctx.fillStyle = accent;
        ctx.shadowColor = accent;
        ctx.shadowBlur = (n.bright ? 6 : 4) + proximity * 6;
        ctx.globalAlpha = Math.min(glow + proximity * 0.4, 1);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + proximity * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

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
