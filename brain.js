import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// Siluet otak dibangun dari satu outline bergelombang (bukan aset gambar), diperbesar
// melebihi kanvas supaya jaringan neuron memenuhi seluruh latar belakang section
// (sisi-sisinya sengaja terpotong), lalu neuron disebar merata lewat jittered-grid
// sampling dan dihubungkan ke tetangga terdekat.
function buildBrainMask(width, height) {
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const octx = off.getContext('2d');
  octx.fillStyle = '#000';

  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.62;
  const ry = height * 0.62;

  octx.beginPath();
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const bump = 1 + 0.055 * Math.sin(theta * 5 + 0.6) + 0.03 * Math.sin(theta * 9 + 1.8);
    const notch = 0.12 * Math.exp(-((theta + Math.PI / 2) ** 2) / (2 * 0.09));
    const r = bump - notch;
    const x = cx + rx * r * Math.cos(theta);
    const y = cy + ry * r * Math.sin(theta);
    if (i === 0) octx.moveTo(x, y);
    else octx.lineTo(x, y);
  }
  octx.closePath();
  octx.fill();

  return octx.getImageData(0, 0, width, height);
}

function BrainNetwork() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas.parentElement;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const neuronColor =
      getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#9a9a94';

    let width = 0;
    let height = 0;
    let nodes = [];
    let edges = [];
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

      const mask = buildBrainMask(width, height);

      const cellSize = Math.max(18, Math.sqrt(width * height) / 24);
      nodes = [];
      for (let gy = 0; gy < height; gy += cellSize) {
        for (let gx = 0; gx < width; gx += cellSize) {
          const x = gx + (Math.random() - 0.5) * cellSize * 0.85;
          const y = gy + (Math.random() - 0.5) * cellSize * 0.85;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const alphaIndex = (Math.floor(y) * width + Math.floor(x)) * 4 + 3;
          if (mask.data[alphaIndex] > 80) {
            nodes.push({
              x,
              y,
              baseX: x,
              baseY: y,
              r: 1.2 + Math.random() * 1.3,
              phase: Math.random() * Math.PI * 2,
              speed: 0.5 + Math.random() * 0.7
            });
          }
        }
      }

      edges = [];
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

      canvas.classList.add('is-loaded');
    }

    function frame(t) {
      ctx.clearRect(0, 0, width, height);
      const time = t / 1000;

      edges.forEach((e) => {
        const a = nodes[e.a];
        const b = nodes[e.b];
        if (!a || !b) return;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const proximity = Math.max(0, 1 - Math.hypot(mouse.x - midX, mouse.y - midY) / 160);
        const pulse = reduceMotion ? 0.5 : Math.sin(time * e.speed + e.phase) * 0.5 + 0.5;
        ctx.strokeStyle = neuronColor;
        ctx.globalAlpha = Math.min(0.08 + pulse * 0.16 + proximity * 0.55, 0.9);
        ctx.lineWidth = 0.6 + proximity * 1.2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });

      nodes.forEach((n) => {
        const proximity = Math.max(0, 1 - Math.hypot(mouse.x - n.x, mouse.y - n.y) / 140);

        if (!reduceMotion) {
          n.x = n.baseX + Math.sin(time * n.speed + n.phase) * 1.2 - proximity * (mouse.x - n.baseX) * 0.06;
          n.y = n.baseY + Math.cos(time * n.speed * 0.8 + n.phase) * 1.2 - proximity * (mouse.y - n.baseY) * 0.06;
        }

        const glow = reduceMotion ? 0.6 : Math.sin(time * n.speed + n.phase) * 0.3 + 0.6;
        ctx.globalAlpha = Math.min(glow + proximity * 0.4, 1);
        ctx.fillStyle = neuronColor;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + proximity * 1.6, 0, Math.PI * 2);
        ctx.fill();
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
    // Listener di window (bukan cuma container) supaya kursor tetap terdeteksi
    // walau posisinya di atas elemen lain yang overlay di depan canvas (mis. nama).
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
