// Phase to Space: the starry background (a slow drift of stars, a nebula glow and now and then a comet).
export function startStars(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let stars = [];
  let comets = [];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.width = Math.floor(innerWidth * dpr);
    H = canvas.height = Math.floor(innerHeight * dpr);
    const n = Math.floor((innerWidth * innerHeight) / 6500);
    stars = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.2 + Math.random() * 0.8, t: Math.random() * 6.28, tint: Math.random() }));
  };
  resize();
  addEventListener('resize', resize);
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      s.t += dt * (0.5 + s.z);
      s.y += dt * 4 * s.z * (H / 800);
      if (s.y > H) {
        s.y = 0;
        s.x = Math.random() * W;
      }
      ctx.globalAlpha = (0.3 + 0.7 * Math.abs(Math.sin(s.t))) * s.z;
      ctx.fillStyle = s.tint > 0.88 ? '#ffb3d1' : s.tint > 0.72 ? '#9fe8ff' : '#ffffff';
      const r = s.z * 1.6 * (W / 1400 + 0.6);
      ctx.fillRect(s.x, s.y, r, r);
    }
    if (!reduce && Math.random() < dt * 0.15) comets.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.3) * 240, vy: 360 + Math.random() * 220, life: 1 });
    comets = comets.filter((c) => c.life > 0);
    for (const c of comets) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.life -= dt * 0.55;
      const g = ctx.createLinearGradient(c.x, c.y, c.x - c.vx * 0.18, c.y - c.vy * 0.18);
      g.addColorStop(0, `rgba(190,240,255,${Math.max(0, c.life)})`);
      g.addColorStop(1, 'rgba(190,240,255,0)');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x - c.vx * 0.18, c.y - c.vy * 0.18);
      ctx.stroke();
    }
    if (!reduce) requestAnimationFrame(frame);
  };
  if (reduce) frame(performance.now());
  else requestAnimationFrame(frame);
}
