// A short fireworks show on a full-screen canvas, shared by the games. Skipped for reduced motion.
// SPDX-License-Identifier: AGPL-3.0-only

export function fireworks({ colors, duration = 5200 } = {}) {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'fireworks';
  cv.setAttribute('aria-hidden', 'true');
  document.body.append(cv);
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size();
  colors = colors?.length ? colors : ['#d1386f', '#d9741c', '#6fa52a', '#1f9c66', '#2f78cc', '#7650c8', '#ffd166'];
  const parts = [];
  const rockets = [];
  const t0 = performance.now();
  const DUR = duration;
  let nextLaunch = 0;
  const launch = () => rockets.push({ x: innerWidth * (0.15 + Math.random() * 0.7), y: innerHeight, vx: (Math.random() - 0.5) * 1.5,
    vy: -Math.sqrt(2 * 0.12 * innerHeight * (0.45 + Math.random() * 0.35)), color: colors[Math.floor(Math.random() * colors.length)] });
  const burst = (r) => {
    const n = 90 + Math.floor(Math.random() * 50);
    const ring = Math.random() < 0.4; // some bursts as a clean wheel, like the table
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = ring ? 4.2 : 1 + Math.random() * 4.5;
      parts.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color: Math.random() < 0.85 ? r.color : '#ffd166' });
    }
  };
  const step = (now) => {
    const t = now - t0;
    if (t < DUR - Math.min(1500, DUR / 3) && t > nextLaunch) { launch(); nextLaunch = t + 260 + Math.random() * 380; }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.x += r.vx; r.y += r.vy; r.vy += 0.12;
      ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(r.x, r.y, 3, 0, Math.PI * 2); ctx.fill();
      if (r.vy >= -1) { burst(r); rockets.splice(i, 1); }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.05; p.life -= 0.011;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (t < DUR || parts.length) requestAnimationFrame(step);
    else cv.remove();
  };
  requestAnimationFrame(step);
}
