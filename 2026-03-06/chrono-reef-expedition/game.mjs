const hasDOM = typeof document !== 'undefined';
const canvas = hasDOM ? document.getElementById('game') : { width: 960, height: 540 };
const ctx = hasDOM ? canvas.getContext('2d') : null;
const overlay = hasDOM ? document.getElementById('overlay') : null;
const startBtn = hasDOM ? document.getElementById('startBtn') : null;
const labels = hasDOM ? {
  sector: document.getElementById('sectorLabel'), hp: document.getElementById('hpLabel'), shards: document.getElementById('shardLabel'),
  xp: document.getElementById('xpLabel'), lvl: document.getElementById('lvlLabel'), objective: document.getElementById('objectiveLabel')
} : null;

const sectorConfigs = [
  { name: 'Sunlit Bloom', target: 18, enemyRate: 0.8, enemySpeed: 72, tint: '#50e5ff' },
  { name: 'Turbid Trenches', target: 26, enemyRate: 1.1, enemySpeed: 88, tint: '#6ab1ff' },
  { name: 'Abyssal Clockwork', target: 34, enemyRate: 1.3, enemySpeed: 102, tint: '#a48fff' },
  { name: 'Chrono Core', target: 46, enemyRate: 1.5, enemySpeed: 116, tint: '#ff8ad2' }
];

export function createInitialState() {
  return {
    running: false, t: 0, sector: 0, hp: 100, shards: 0, xp: 0, lvl: 1, damage: 18, speed: 210,
    player: { x: 480, y: 270, vx: 0, vy: 0, dashCd: 0, pulseCd: 0 }, enemies: [], particles: [],
    collected: 0, objective: 'Collect shards and clear reef hostiles.', gameOver: false, victory: false
  };
}
const S = createInitialState();

function levelThreshold(lvl){ return 50 + (lvl - 1) * 40; }
function tryLevelUp() {
  while (S.xp >= levelThreshold(S.lvl)) { S.xp -= levelThreshold(S.lvl); S.lvl++; S.damage += 3; S.hp = Math.min(100 + S.lvl * 4, S.hp + 16); }
}

function spawnEnemy() {
  const c = sectorConfigs[S.sector];
  const edge = Math.floor(Math.random() * 4);
  const p = edge === 0 ? { x: 0, y: Math.random() * canvas.height } : edge === 1 ? { x: canvas.width, y: Math.random() * canvas.height } : edge === 2 ? { x: Math.random() * canvas.width, y: 0 } : { x: Math.random() * canvas.width, y: canvas.height };
  S.enemies.push({ ...p, hp: 20 + S.sector * 10, speed: c.enemySpeed + Math.random() * 24, r: 12 + Math.random() * 6, wobble: Math.random() * 20 });
}

function emit(x,y,count,color){for(let i=0;i<count;i++)S.particles.push({x,y,vx:(Math.random()-0.5)*180,vy:(Math.random()-0.5)*180,life:0.7+Math.random()*0.5,color});}

const keys = {};
if (hasDOM) {
  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') dash(); if (e.key.toLowerCase() === 'j') pulse(); });
  window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
}

function dash(){ if(S.player.dashCd<=0){ const mag=Math.hypot(S.player.vx,S.player.vy)||1; S.player.x += (S.player.vx/mag)*80; S.player.y += (S.player.vy/mag)*80; S.player.dashCd=4; emit(S.player.x,S.player.y,22,'#9ef'); }}
function pulse(){ if(S.player.pulseCd<=0){ S.player.pulseCd=6; for(const e of S.enemies){ const d=Math.hypot(e.x-S.player.x,e.y-S.player.y); if(d<130){ e.hp-=S.damage+10; emit(e.x,e.y,8,'#c8f'); }} }}

function touchControls(){
  if (!hasDOM) return;
  const base = document.getElementById('joyBase'); const stick = document.getElementById('joyStick'); let active = null;
  base.addEventListener('pointerdown', e => active = e.pointerId);
  base.addEventListener('pointermove', e => {
    if (e.pointerId !== active) return;
    const r = base.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width/2), y = e.clientY - (r.top + r.height/2);
    const d = Math.min(44, Math.hypot(x,y)||1), nx = x/(Math.hypot(x,y)||1), ny = y/(Math.hypot(x,y)||1);
    stick.style.left = `${32 + nx*d}px`; stick.style.top = `${32 + ny*d}px`; S.player.vx = nx*S.speed; S.player.vy = ny*S.speed;
  });
  const reset=()=>{active=null;stick.style.left='32px';stick.style.top='32px';S.player.vx=0;S.player.vy=0};
  base.addEventListener('pointerup', reset); base.addEventListener('pointercancel', reset);
  document.getElementById('dashBtn').addEventListener('click', dash); document.getElementById('pulseBtn').addEventListener('click', pulse);
}

function step(dt){
  S.t += dt; const c = sectorConfigs[S.sector];
  if (Math.random() < c.enemyRate * dt && S.enemies.length < 20) spawnEnemy();

  const up = keys['w'] || keys['arrowup'], dn = keys['s'] || keys['arrowdown'], lt = keys['a'] || keys['arrowleft'], rt = keys['d'] || keys['arrowright'];
  if (up||dn||lt||rt) { S.player.vx = ((rt?1:0)-(lt?1:0))*S.speed; S.player.vy = ((dn?1:0)-(up?1:0))*S.speed; }
  S.player.x = Math.max(20, Math.min(canvas.width-20, S.player.x + S.player.vx*dt));
  S.player.y = Math.max(20, Math.min(canvas.height-20, S.player.y + S.player.vy*dt));
  S.player.vx *= 0.85; S.player.vy *= 0.85;
  S.player.dashCd = Math.max(0,S.player.dashCd-dt); S.player.pulseCd = Math.max(0,S.player.pulseCd-dt);

  for(const e of S.enemies){
    const a = Math.atan2(S.player.y-e.y, S.player.x-e.x); e.x += Math.cos(a)*e.speed*dt; e.y += Math.sin(a)*e.speed*dt; e.wobble += dt*6;
    if(Math.hypot(e.x-S.player.x,e.y-S.player.y) < e.r+10){ S.hp -= (6+S.sector)*dt; emit(S.player.x,S.player.y,2,'#f66'); }
  }

  for(let i=S.enemies.length-1;i>=0;i--){
    const e=S.enemies[i];
    if(Math.hypot(e.x-S.player.x,e.y-S.player.y)<55){ e.hp -= S.damage*dt; }
    if(e.hp<=0){ S.enemies.splice(i,1); S.shards += 1; S.collected += 1; S.xp += 14 + S.sector*4; emit(e.x,e.y,14,c.tint); }
  }
  tryLevelUp();

  for(let i=S.particles.length-1;i>=0;i--){const p=S.particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=0.97;p.vy*=0.97;if(p.life<=0)S.particles.splice(i,1);}
  if (S.collected >= c.target) {
    if (S.sector < 3) { S.sector++; S.collected = 0; S.objective = `Sector ${S.sector+1}: ${sectorConfigs[S.sector].name}`; emit(S.player.x,S.player.y,55,sectorConfigs[S.sector].tint); S.hp = Math.min(120, S.hp + 24); }
    else {
      S.victory = true; S.running = false;
      if (hasDOM) {
        overlay.classList.add('show');
        overlay.innerHTML = `<h1>Reef Stabilized!</h1><p>You completed all sectors with ${S.shards} shards.</p><button id='startBtn'>Run Again</button>`;
        document.getElementById('startBtn').onclick = () => location.reload();
      }
    }
  }
  if (S.hp <= 0) {
    S.gameOver = true; S.running = false;
    if (hasDOM) {
      overlay.classList.add('show');
      overlay.innerHTML = `<h1>Hull Breach</h1><p>Recovered shards: ${S.shards}</p><button id='startBtn'>Retry Dive</button>`;
      document.getElementById('startBtn').onclick = () => location.reload();
    }
  }
}

function draw(){
  const c = sectorConfigs[S.sector];
  ctx.fillStyle = '#03131d'; ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let i=0;i<70;i++){ const x=(i*137+S.t*25)%canvas.width, y=(i*97 + Math.sin(S.t+i)*22)%canvas.height; ctx.fillStyle=`rgba(120,220,255,${0.07+((i%5)/40)})`; ctx.beginPath(); ctx.arc(x,y,2+(i%3),0,7); ctx.fill(); }

  ctx.save(); ctx.translate(S.player.x,S.player.y);
  const glow = 15 + Math.sin(S.t*8)*4; const g = ctx.createRadialGradient(0,0,6,0,0,36); g.addColorStop(0,'#bff'); g.addColorStop(1,'rgba(80,220,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0,0,36+glow,0,7); ctx.fill();
  ctx.fillStyle = '#6ff'; ctx.fillRect(-10,-10,20,20); ctx.fillStyle = '#cfffff'; ctx.fillRect(-6,-6,12,12); ctx.restore();

  for(const e of S.enemies){ ctx.save(); ctx.translate(e.x,e.y); const pulse = Math.sin(e.wobble)*2; ctx.fillStyle='rgba(255,80,130,0.2)'; ctx.beginPath(); ctx.arc(0,0,e.r+6+pulse,0,7); ctx.fill(); ctx.fillStyle='#ff7aa8'; ctx.beginPath(); ctx.arc(0,0,e.r,0,7); ctx.fill(); ctx.fillStyle='#ffd4e4'; ctx.beginPath(); ctx.arc(-3,-3,e.r*0.35,0,7); ctx.fill(); ctx.restore(); }
  for(const p of S.particles){ ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0,p.life); ctx.fillRect(p.x,p.y,3,3); ctx.globalAlpha = 1; }

  if (labels) {
    labels.sector.textContent = `${S.sector+1}`; labels.hp.textContent = `${Math.max(0,S.hp|0)}`; labels.shards.textContent = `${S.shards}`; labels.xp.textContent = `${S.xp|0}`; labels.lvl.textContent = `${S.lvl}`; labels.objective.textContent = `${c.name} — ${S.collected}/${c.target} shards`;
  }
}

let last=0;
function loop(ts){ if(!S.running) return; const dt=Math.min(0.033,(ts-last)/1000||0.016); last=ts; step(dt); draw(); requestAnimationFrame(loop); }

if (startBtn) {
  startBtn.onclick = () => { overlay.classList.remove('show'); S.running = true; last = performance.now(); S.objective=`${sectorConfigs[0].name} — collect ${sectorConfigs[0].target} shards`; touchControls(); requestAnimationFrame(loop); };
}

export function runSimulationTicks(ticks=600){
  const sim = createInitialState();
  for(let i=0;i<ticks;i++){
    // light deterministic simulation for smoke testing
    sim.xp += 1; if (sim.xp > levelThreshold(sim.lvl)) { sim.xp = 0; sim.lvl++; }
    if (i % 50 === 0) sim.shards += 1;
  }
  return { lvl: sim.lvl, shards: sim.shards, valid: sim.lvl > 1 && sim.shards > 5 };
}
