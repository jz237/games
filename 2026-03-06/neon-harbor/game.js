// Neon Harbor - movement updated for smooth, continuous tile-to-tile animation
(() => {
  const w = 960, h = 540; // base canvas size
  const tile = 48; // grid tile size
  const cols = Math.floor(w / tile);
  const rows = Math.floor(h / tile);

  const container = document.getElementById('game');
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.style.width = '100%'; canvas.style.height = '100%';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // player on grid
  const player = { gx: Math.floor(cols/2), gy: Math.floor(rows/2), x:0, y:0, moving:false, tx:0, ty:0, speed: 0.25 };
  player.x = player.gx * tile + tile/2;
  player.y = player.gy * tile + tile/2;

  const keys = {};
  window.addEventListener('keydown', e => keys[e.key] = true);
  window.addEventListener('keyup', e => keys[e.key] = false);

  // touch / swipe handling for mobile
  let touchStart = null;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStart = {x: t.clientX, y: t.clientY};
    }
  }, {passive:true});
  canvas.addEventListener('touchend', e => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const absx = Math.abs(dx), absy = Math.abs(dy);
    if (Math.max(absx,absy) < 10) {
      // tap: move to tapped tile gradually
      const rect = canvas.getBoundingClientRect();
      const tx = Math.floor((t.clientX - rect.left) / rect.width * w / tile);
      const ty = Math.floor((t.clientY - rect.top) / rect.height * h / tile);
      requestMoveTo(tx, ty);
    } else {
      // swipe: move one tile in direction
      if (absx > absy) moveBy(dx>0?1:-1,0); else moveBy(0,dy>0?1:-1);
    }
    touchStart = null;
  }, {passive:true});

  function moveBy(dx, dy){
    if (player.moving) return; // queue ignored for now
    const nx = player.gx + dx, ny = player.gy + dy;
    if (nx<0||ny<0||nx>=cols||ny>=rows) return;
    startMoveTo(nx, ny);
  }

  function requestMoveTo(gx, gy){
    if (player.moving) return;
    // simple path: step horizontally then vertically
    const path = [];
    const dx = gx - player.gx, dy = gy - player.gy;
    const stepX = dx>0?1:(dx<0?-1:0);
    const stepY = dy>0?1:(dy<0?-1:0);
    let cx = player.gx, cy = player.gy;
    while (cx !== gx){ cx += stepX; path.push([cx,cy]); }
    while (cy !== gy){ cy += stepY; path.push([cx,cy]); }
    if (path.length) followPath(path);
  }

  let pathQueue = [];
  function followPath(p){ pathQueue = p.slice(); advancePath(); }
  function advancePath(){
    if (!pathQueue.length) return;
    const [nx,ny] = pathQueue.shift();
    startMoveTo(nx,ny, () => { if (pathQueue.length) advancePath(); });
  }

  function startMoveTo(nx, ny, cb){
    player.moving = true;
    player.tx = nx * tile + tile/2;
    player.ty = ny * tile + tile/2;
    player.gx = nx; player.gy = ny;
    player._onArrive = cb || null;
  }

  function update(dt){
    // keyboard: gentle directional control (one tile per press)
    if (!player.moving){
      if (keys.ArrowUp || keys.w) moveBy(0,-1);
      else if (keys.ArrowDown || keys.s) moveBy(0,1);
      else if (keys.ArrowLeft || keys.a) moveBy(-1,0);
      else if (keys.ArrowRight || keys.d) moveBy(1,0);
    }
    if (player.moving){
      // interpolate toward target
      const dx = player.tx - player.x;
      const dy = player.ty - player.y;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if (dist < 1){ player.x = player.tx; player.y = player.ty; player.moving = false; if (player._onArrive) { const cb=player._onArrive; player._onArrive=null; cb(); } }
      else {
        const mx = (dx/dist) * player.speed * dt;
        const my = (dy/dist) * player.speed * dt;
        player.x += mx; player.y += my;
      }
    }
  }

  function draw(){
    ctx.fillStyle = '#001218'; ctx.fillRect(0,0,w,h);
    // grid
    ctx.strokeStyle = '#022';
    for (let i=0;i<=cols;i++){ ctx.beginPath(); ctx.moveTo(i*tile,0); ctx.lineTo(i*tile,h); ctx.stroke(); }
    for (let j=0;j<=rows;j++){ ctx.beginPath(); ctx.moveTo(0,j*tile); ctx.lineTo(w,j*tile); ctx.stroke(); }
    // player smooth
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = '#ff8c42';
    ctx.beginPath(); ctx.arc(0,0, tile*0.35, 0, Math.PI*2); ctx.fill();
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

})();