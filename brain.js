import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// Siluet kepala (profil menghadap kanan) digambar dari daftar titik manual
// (bukan aset gambar), lalu di dalamnya tumbuh struktur cabang "neuron" secara
// rekursif dari leher ke atas, dibatasi supaya tetap di dalam siluet.
const HEAD_PROFILE = [
  [0.50, 0.02], [0.60, 0.03], [0.70, 0.06], [0.78, 0.12], [0.83, 0.18],
  [0.85, 0.21], [0.82, 0.24], [0.84, 0.27], [0.87, 0.31], [0.93, 0.36],
  [0.98, 0.40], [0.93, 0.43], [0.94, 0.45], [0.96, 0.47], [0.92, 0.50],
  [0.94, 0.52], [0.89, 0.55], [0.90, 0.59], [0.84, 0.64], [0.78, 0.68],
  [0.72, 0.74], [0.68, 0.82], [0.67, 0.92], [0.66, 1.00], [0.30, 1.00],
  [0.32, 0.90], [0.34, 0.78], [0.33, 0.66], [0.30, 0.52], [0.32, 0.38],
  [0.38, 0.24], [0.44, 0.12]
];

const MAX_DEPTH = 13;

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

// Menumbuhkan cabang secara rekursif dari leher ke atas. Cabang yang keluar
// dari siluet kepala dihentikan (jadi ujung/leaf), sehingga bentuknya secara
// alami mengikuti kontur kepala tanpa perlu kliping tambahan.
function buildTree(mask, width, height) {
  const branches = [];
  const nodes = [];
  const maxDepth = MAX_DEPTH;

  // Otak cuma menempati bagian atas tengkorak (kira-kira mulai dari alis ke
  // atas). Batang naik ke sana dengan "menuju" satu titik target di tengah
  // tengkorak (bukan random-walk) supaya selalu sampai dengan aman, tanpa
  // pernah nyasar keluar leher/rahang yang sempit karena akumulasi noise.
  const brainYLimit = height * 0.4;
  const brainTargetX = width * 0.54;
  const brainTargetY = height * 0.26;

  function grow(x, y, angle, length, depth) {
    const x2 = x + Math.cos(angle) * length;
    const y2 = y + Math.sin(angle) * length;
    const inBounds = x2 >= 0 && x2 < width && y2 >= 0 && y2 < height;
    const insideMask = inBounds && mask.data[(Math.floor(y2) * width + Math.floor(x2)) * 4 + 3] > 80;
    const isLeaf = depth >= maxDepth || !insideMask;

    branches.push({
      x1: x, y1: y, x2, y2, depth,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.4
    });

    if (isLeaf || Math.random() < 0.25) {
      nodes.push({
        x: x2, y: y2, baseX: x2, baseY: y2, depth,
        r: isLeaf ? 1.3 + Math.random() * 1.5 : 0.9 + Math.random() * 0.8,
        driftPhase: Math.random() * Math.PI * 2,
        driftAngle: Math.random() * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.7
      });
    }

    if (!isLeaf) {
      // Batang tetap satu garis nyaris lurus ke atas sampai mencapai area
      // otak; baru di sana boleh menyebar lebar mengisi tengkorak sampai ke
      // dahi/belakang kepala, bukan cuma lurus ke ubun-ubun.
      const inBrain = y2 < brainYLimit;
      const childCount = !inBrain ? 1 : depth < 5 ? 2 : Math.random() < 0.8 ? 2 : 1;
      for (let i = 0; i < childCount; i++) {
        let childAngle;
        if (inBrain) {
          const spread = 0.3 + Math.random() * 0.45;
          const dir = childCount === 1 ? (Math.random() < 0.5 ? -1 : 1) : i === 0 ? -1 : 1;
          childAngle = angle + dir * spread * (0.5 + Math.random() * 0.7);
        } else {
          const targetAngle = Math.atan2(brainTargetY - y2, brainTargetX - x2);
          childAngle = targetAngle + (Math.random() - 0.5) * 0.12;
        }
        const decay = inBrain ? 0.86 : 0.9;
        const childLength = length * (decay + Math.random() * 0.05);
        grow(x2, y2, childAngle, childLength, depth + 1);
      }
    }
  }

  grow(width * 0.48, height * 0.995, -Math.PI / 2, height * 0.15, 0);
  return { branches, nodes };
}

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
    let branches = [];
    let nodes = [];
    let animId = null;
    let resizeTimer = null;
    const mouse = { x: -9999, y: -9999 };

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
      const tree = buildTree(mask, width, height);
      branches = tree.branches;
      nodes = tree.nodes;

      canvas.classList.add('is-loaded');
    }

    function frame(t) {
      ctx.clearRect(0, 0, width, height);
      const time = t / 1000;

      // Garis siluet kepala, digambar tipis dengan sedikit glow.
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.25;
      ctx.globalAlpha = 0.55;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 6;
      traceHeadPath(ctx, width, height);
      ctx.stroke();
      ctx.restore();

      // Cabang "neuron" digoyang pelan seperti tertiup angin: makin jauh dari
      // batang (makin dalam), makin besar simpangannya — mirip ranting asli.
      // Offset dihitung linear terhadap depth, jadi selisih antar-sambungan
      // kecil sekali dan cabang tetap terlihat menyambung rapi.
      const wind = reduceMotion ? 0 : Math.sin(time * 0.35);

      branches.forEach((b) => {
        const sway = wind * (b.depth / MAX_DEPTH) * 6;
        const x1 = b.x1 + sway;
        const y1 = b.y1;
        const x2 = b.x2 + sway;
        const y2 = b.y2;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const proximity = Math.max(0, 1 - Math.hypot(mouse.x - midX, mouse.y - midY) / 140);
        const pulse = reduceMotion ? 0.5 : Math.sin(time * b.speed + b.phase) * 0.5 + 0.5;
        const depthFade = Math.max(0.25, 1 - b.depth / 12);

        ctx.strokeStyle = accent;
        ctx.globalAlpha = Math.min((0.2 + pulse * 0.15) * depthFade + proximity * 0.5, 0.95);
        ctx.lineWidth = Math.max(0.5, 2.6 * depthFade) + proximity * 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      // Node "neuron": pulsa kilau + goyangan pohon + gerak melayang kecil.
      nodes.forEach((n) => {
        const sway = wind * (n.depth / MAX_DEPTH) * 6;
        if (!reduceMotion) {
          const drift = 1.6;
          n.x = n.baseX + sway + Math.cos(n.driftAngle + time * 0.15) * drift;
          n.y = n.baseY + Math.sin(n.driftAngle + time * 0.15) * drift;
        } else {
          n.x = n.baseX;
          n.y = n.baseY;
        }

        const proximity = Math.max(0, 1 - Math.hypot(mouse.x - n.x, mouse.y - n.y) / 130);
        const glow = reduceMotion ? 0.6 : Math.sin(time * n.speed + n.phase) * 0.35 + 0.65;
        const depthFade = Math.max(0.35, 1 - n.depth / 12);

        ctx.save();
        ctx.fillStyle = accent;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 4 + proximity * 6;
        ctx.globalAlpha = Math.min(glow * depthFade + proximity * 0.4, 1);
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
