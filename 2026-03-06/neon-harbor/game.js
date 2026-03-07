// Neon Harbor - minimal game skeleton (prototype entry)
(() => {
  const w = 960, h = 540; // base canvas size
  const container = document.getElementById('game');
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.style.width = '100%'; canvas.style.height = '100%';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // simple player state
  const player = { x: w/2, y: h/2, vx:0, vy:0, angle:0 };
  const keys = {};
  window.addEventListener('keydown', e => keys[e.key] = true);
  window.addEventListener('keyup', e => keys[e.key] = false);

  function update(dt){
    // input: Arrow keys or WASD
    const accel = 0.0025 * dt;
    if (keys.ArrowUp || keys.w) { player.vx += Math.cos(player.angle)*accel; player.vy += Math.sin(player.angle)*accel; }
    if (keys.ArrowDown || keys.s) { player.vx *= 0.99; player.vy *= 0.99; }
    if (keys.ArrowLeft || keys.a) { player.angle -= 0.003 * dt; }
    if (keys.ArrowRight || keys.d) { player.angle += 0.003 * dt; }
    // simple physics
    player.x += player.vx; player.y += player.vy;
    // friction
    player.vx *= 0.998; player.vy *= 0.998;
    // wrap
    if (player.x < 0) player.x = w; if (player.x > w) player.x = 0;
    if (player.y < 0) player.y = h; if (player.y > h) player.y = 0;
  }

  function draw(){
    ctx.fillStyle = '#001218'; ctx.fillRect(0,0,w,h);
    // draw player as triangle
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#0ff';
    ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(-8,6); ctx.lineTo(-8,-6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  let last = performance.now();
  function frame(t){
    const dt = t - last; last = t;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // smoke test hook
  window.__smokeTest = function(){
    return {ok:true,player:{x:player.x,y:player.y,vx:player.vx,vy:player.vy}};
  };
})();