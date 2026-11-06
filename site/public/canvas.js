/** Decorative Canvas-in-HTML effect with motion, visibility and DPR limits. */
export function mountKnowledgeCanvas(canvas) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return () => {};
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible = true, active = true, raf = 0, last = 0, angle = 0;
  let w = 0, h = 0, dpr = 1;
  const points = [0.09, 0.23, 0.38, 0.49, 0.63, 0.81, 0.94];
  const size = () => {
    const b = canvas.getBoundingClientRect();
    w = b.width; h = b.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  };
  const draw = () => {
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const cx = w * .51, cy = h * .53;
    ctx.strokeStyle = 'rgba(34,42,40,.10)'; ctx.lineWidth = 1;
    const grid = Math.max(32, Math.round(w / 12));
    for (let x = grid; x < w; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = grid; y < h; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle * 0.03);
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.rotate(i * .78 + (media.matches ? 0 : angle * .065));
      ctx.beginPath(); ctx.ellipse(0, 0, w * (.30 - i * .053), h * (.23 + i * .026), 0, 0, Math.PI * 2);
      ctx.strokeStyle = i === 0 ? 'rgba(30,34,32,.30)' : 'rgba(30,34,32,.17)';
      ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    points.forEach((n, i) => {
      const t = n * Math.PI * 2 + angle * (i % 2 ? -.07 : .12);
      const x = cx + Math.cos(t) * w * (.29 + i % 3 * .035);
      const y = cy + Math.sin(t) * h * (.28 + (i % 2) * .07);
      ctx.fillStyle = '#f05435'; ctx.beginPath(); ctx.arc(x, y, i % 3 === 0 ? 4 : 2.7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f05435'; ctx.lineWidth = .9;
      ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10); ctx.stroke();
    });
    ctx.font = `bold ${Math.min(w * .27, 150)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(23,29,26,.20)'; ctx.lineWidth = 1.3;
    ctx.strokeText('?', cx, cy + h * .01);
    ctx.fillStyle = 'rgba(22,29,25,.61)';ctx.font = '10px ui-monospace, monospace';ctx.textAlign = 'left';
    ctx.fillText('KNOWLEDGE IS NOT A STRAIGHT LINE.', 22, h - 24);
  };
  const tick = (timestamp) => {
    if (!active || !visible || document.hidden || media.matches) return;
    if (timestamp - last > 34) { angle += .018; draw(); last = timestamp; }
    raf = requestAnimationFrame(tick);
  };
  const update = () => {
    cancelAnimationFrame(raf);
    if (active && visible && !document.hidden && !media.matches) raf = requestAnimationFrame(tick);
    else draw();
  };
  const observer = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; update(); });
  const resizeObserver = new ResizeObserver(size);
  observer.observe(canvas); resizeObserver.observe(canvas);
  document.addEventListener('visibilitychange', update);
  if (media.addEventListener) media.addEventListener('change', update);
  size(); update();
  return () => { active = false; cancelAnimationFrame(raf); observer.disconnect(); resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', update);
    if (media.removeEventListener) media.removeEventListener('change', update); };
}

/** Experimental native HTML-in-Canvas, decoration only. Never a prerequisite. */
export function mountNativeHTMLCanvas(canvas, fallback) {
  const node = canvas?.querySelector('[drawable]');
  const ctx = canvas?.getContext('2d');
  if (!node || !ctx || typeof ctx.drawElementImage !== 'function') return false;
  try {
    const size = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(100 * size); canvas.height = Math.round(100 * size);
    ctx.setTransform(size, 0, 0, size, 0, 0);
    const paint = () => {
      ctx.clearRect(0, 0, 100, 100);
      const transform = ctx.drawElementImage(node, 0, 0);
      if (transform?.toString) node.style.transform = transform.toString();
    };
    canvas.addEventListener('paint', paint);
    paint();
    canvas.classList.add('native-html-canvas');
    if (fallback) fallback.hidden = true;
    return true;
  } catch { return false; }
}
