const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('stats');
const objective = document.getElementById('objective');
const overlay = document.getElementById('overlay');
const dashBtn = document.getElementById('dashBtn');

const state = {
  t: 0, level: 1, wave: 1, phase: 'play', kills: 0, runSeconds: 0,
  player: { x: 480, y: 300, r: 18, hp: 100, maxHp: 100, speed: 180, fireRate: 0.26, fireCd: 0, dmg: 12, dashCd: 0, xp: 0, lvl: 1, ammoArc: 0 },
  bullets: [], enemies: [], particles: [], pickups: [], shake: 0,
  waveTimer: 0, waveBudget: 8, bossAlive: false, upgradesOffered: false,
};

const keys = new Set();
let pointer = { x: 480, y: 300, down: false, active: false };
let joystick = { active:false, ox:0, oy:0, x:0, y:0 };

const mobile = matchMedia('(pointer:coarse)').matches;

addEventListener('keydown', e => keys.add(e.key.toLowerCase()));
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
canvas.addEventListener('pointerdown', e => { pointer.down = true; pointer.active = true; setPointer(e); if (mobile) { joystick.active = true; joystick.ox = e.clientX; joystick.oy = e.clientY; }});
canvas.addEventListener('pointermove', e => { setPointer(e); if (joystick.active) { joystick.x = e.clientX - joystick.ox; joystick.y = e.clientY - joystick.oy; }});
addEventListener('pointerup', () => { pointer.down = false; joystick.active = false; joystick.x = joystick.y = 0; });
dashBtn.addEventListener('click', () => dash());

function setPointer(e){
  const r = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX-r.left)/r.width) * canvas.width;
  pointer.y = ((e.clientY-r.top)/r.height) * canvas.height;
}

function spawnWave(){
  if (state.enemies.length || state.bossAlive) return;
  if (state.wave > 6) return spawnBoss();
  const count = 4 + state.wave + state.level;
  for(let i=0;i<count;i++){
    const side = Math.floor(Math.random()*4);
    const pos = side===0?[Math.random()*960,-20]:side===1?[980,Math.random()*540]:side===2?[Math.random()*960,560]:[-20,Math.random()*540];
    const speed = 40 + Math.random()*45 + state.wave*4;
    state.enemies.push({x:pos[0],y:pos[1],r:14+Math.random()*4,hp:24+state.wave*8+state.level*10,speed,type:'raider'});
  }
  state.waveTimer = 0;
}

function spawnBoss(){
  if (state.bossAlive) return;
  state.bossAlive = true;
  const hp = state.level===1?950:1400;
  state.enemies.push({x:480,y:-80,r:42,hp,maxHp:hp,speed:38,type:'boss',theta:0,shotCd:0});
}

function dash(){
  const p = state.player;
  if (p.dashCd>0) return;
  let dx = (keys.has('d')||keys.has('arrowright')?1:0) - (keys.has('a')||keys.has('arrowleft')?1:0);
  let dy = (keys.has('s')||keys.has('arrowdown')?1:0) - (keys.has('w')||keys.has('arrowup')?1:0);
  if (joystick.active){ dx = joystick.x/40; dy = joystick.y/40; }
  const m = Math.hypot(dx,dy)||1;
  p.x += dx/m*90; p.y += dy/m*90; p.dashCd = 2.8; state.shake = 7;
  for(let i=0;i<16;i++) state.particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*220,vy:(Math.random()-.5)*220,life:.45,c:'#8ff'});
}

function offerUpgrade(){
  state.phase='upgrade'; state.upgradesOffered = true;
  const choices = [
    {name:'Arc Spread', apply:()=>state.player.ammoArc++},
    {name:'Rail Overclock', apply:()=>state.player.fireRate=Math.max(0.12,state.player.fireRate-0.035)},
    {name:'Tempered Hull', apply:()=>{state.player.maxHp+=20; state.player.hp=Math.min(state.player.maxHp,state.player.hp+20);}},
    {name:'Shard Lance', apply:()=>state.player.dmg+=5},
    {name:'Flux Boots', apply:()=>state.player.speed+=22}
  ].sort(()=>Math.random()-.5).slice(0,3);

  overlay.style.display='block';
  overlay.textContent = `Wave cleared. Choose upgrade:\n\n1) ${choices[0].name}\n2) ${choices[1].name}\n3) ${choices[2].name}\n\nPress 1/2/3`;
  const onKey=(e)=>{
    const idx = ['1','2','3'].indexOf(e.key);
    if(idx>-1){ choices[idx].apply(); cleanup(); }
  };
  const cleanup=()=>{ removeEventListener('keydown',onKey); overlay.style.display='none'; state.phase='play'; state.wave++; if(state.wave===8&&state.level===1){state.level=2;state.wave=1;} };
  addEventListener('keydown', onKey);
}

function shootAt(tx,ty){
  const p=state.player; if(p.fireCd>0) return;
  const dx=tx-p.x, dy=ty-p.y, a=Math.atan2(dy,dx), spread=p.ammoArc;
  for(let i=0;i<=spread;i++){
    const off = (i-(spread/2))*0.17;
    state.bullets.push({x:p.x,y:p.y,vx:Math.cos(a+off)*420,vy:Math.sin(a+off)*420,life:1.2,dmg:p.dmg});
  }
  p.fireCd = p.fireRate;
}

function update(dt){
  const p=state.player;
  if(state.phase!=='play') return;
  state.runSeconds += dt;
  p.fireCd=Math.max(0,p.fireCd-dt); p.dashCd=Math.max(0,p.dashCd-dt);

  let mx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  let my=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
  if(joystick.active){ mx=joystick.x/36; my=joystick.y/36; }
  const m=Math.hypot(mx,my)||1; p.x+=mx/m*p.speed*dt; p.y+=my/m*p.speed*dt;
  p.x=Math.max(20,Math.min(940,p.x)); p.y=Math.max(20,Math.min(520,p.y));

  if(pointer.down || keys.has(' ')) shootAt(pointer.x,pointer.y);

  state.waveTimer+=dt;
  if(state.waveTimer>0.5) spawnWave();

  for(const b of state.bullets){ b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt; }
  state.bullets=state.bullets.filter(b=>b.life>0&&b.x>-60&&b.x<1020&&b.y>-60&&b.y<620);

  for(const e of state.enemies){
    if(e.type==='boss'){
      e.theta += dt;
      const tx = 480 + Math.cos(e.theta*0.6)*180;
      const ty = 180 + Math.sin(e.theta)*90;
      e.x += (tx-e.x)*dt*1.8; e.y += (ty-e.y)*dt*1.8;
      e.shotCd=(e.shotCd||0)-dt;
      if(e.shotCd<=0){
        e.shotCd = 0.8;
        const a=Math.atan2(p.y-e.y,p.x-e.x);
        for(let i=-1;i<=1;i++) state.enemies.push({x:e.x,y:e.y,r:9,hp:12,speed:120,type:'drone',vx:Math.cos(a+i*0.3)*160,vy:Math.sin(a+i*0.3)*160,ttl:6});
      }
    } else if(e.type==='drone'){
      e.x += e.vx*dt; e.y += e.vy*dt; e.ttl -= dt; if(e.ttl<0) e.hp=0;
    } else {
      const a=Math.atan2(p.y-e.y,p.x-e.x); e.x+=Math.cos(a)*e.speed*dt; e.y+=Math.sin(a)*e.speed*dt;
    }

    if(Math.hypot(e.x-p.x,e.y-p.y)<e.r+p.r){
      p.hp -= e.type==='boss'?18*dt:14*dt;
      state.shake = 4;
    }
  }

  for(const b of state.bullets){
    for(const e of state.enemies){
      if(e.hp<=0) continue;
      if(Math.hypot(b.x-e.x,b.y-e.y)<e.r+4){
        e.hp -= b.dmg; b.life = 0;
        state.particles.push({x:b.x,y:b.y,vx:(Math.random()-.5)*180,vy:(Math.random()-.5)*180,life:.35,c:'#aff'});
        if(e.hp<=0){
          state.kills++; state.player.xp += 8; 
          if(Math.random()<0.27) state.pickups.push({x:e.x,y:e.y,r:7,type:'hp'});
          if(e.type==='boss'){ state.bossAlive=false; }
        }
      }
    }
  }

  for(const pk of state.pickups){
    if(Math.hypot(pk.x-p.x,pk.y-p.y)<pk.r+p.r){ p.hp = Math.min(p.maxHp,p.hp+14); pk.dead=true; }
  }
  state.pickups=state.pickups.filter(p=>!p.dead);

  for(const pt of state.particles){ pt.x+=pt.vx*dt; pt.y+=pt.vy*dt; pt.life-=dt; }
  state.particles=state.particles.filter(p=>p.life>0);

  state.enemies = state.enemies.filter(e=>e.hp>0);

  const nextLvlXp = state.player.lvl*90;
  if(state.player.xp>=nextLvlXp){
    state.player.xp -= nextLvlXp; state.player.lvl++; state.player.maxHp += 8; state.player.hp = Math.min(state.player.maxHp, state.player.hp+18);
  }

  if(!state.enemies.length && !state.bossAlive && state.waveTimer>1){
    if(state.level===2 && state.wave>6){ state.phase='victory'; }
    else offerUpgrade();
  }

  if(p.hp<=0) state.phase='defeat';
}

function draw(){
  const shakeX = (Math.random()-0.5)*state.shake, shakeY=(Math.random()-0.5)*state.shake;
  state.shake*=0.88;
  ctx.save();
  ctx.setTransform(1,0,0,1,shakeX,shakeY);

  // background layers
  ctx.fillStyle='#060912'; ctx.fillRect(0,0,960,540);
  for(let i=0;i<80;i++){
    const x=(i*173+state.t*12)%980, y=(i*97)%560;
    ctx.fillStyle=`rgba(120,200,255,${0.03+((i%5)/100)})`; ctx.fillRect(x,y,2,2);
  }

  ctx.strokeStyle='rgba(130,220,255,0.16)';
  for(let x=0;x<960;x+=48){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,540); ctx.stroke(); }
  for(let y=0;y<540;y+=48){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(960,y); ctx.stroke(); }

  // pickups
  for(const p of state.pickups){
    const t=state.t*4; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(t);
    ctx.fillStyle='#9ff'; ctx.fillRect(-5,-5,10,10); ctx.restore();
  }

  // bullets
  for(const b of state.bullets){ ctx.fillStyle='#bff'; ctx.beginPath(); ctx.arc(b.x,b.y,3.5,0,7); ctx.fill(); }

  // enemies
  for(const e of state.enemies){
    const g=ctx.createRadialGradient(e.x-5,e.y-6,2,e.x,e.y,e.r+5);
    g.addColorStop(0,e.type==='boss'?'#ffd':'#f88'); g.addColorStop(1,e.type==='boss'?'#a53':'#612');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,7); ctx.fill();
    if(e.type==='boss'){ ctx.fillStyle='#0008'; ctx.fillRect(300,20,360,12); ctx.fillStyle='#f66'; ctx.fillRect(302,22,356*(e.hp/e.maxHp),8); }
  }

  // player
  const p=state.player;
  const pg=ctx.createRadialGradient(p.x-6,p.y-8,2,p.x,p.y,p.r+7); pg.addColorStop(0,'#dff'); pg.addColorStop(1,'#47a');
  ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill();
  ctx.strokeStyle='#aff'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(p.x,p.y,p.r+5,0,7); ctx.stroke();

  // particles
  for(const pt of state.particles){ ctx.fillStyle=pt.c.replace(')',`,`+Math.max(0,pt.life*2)+`)`).replace('rgb','rgba'); ctx.globalAlpha=Math.max(0,pt.life*3); ctx.fillRect(pt.x,pt.y,2,2); }
  ctx.globalAlpha=1;

  ctx.restore();

  hud.textContent = `HP ${Math.round(p.hp)}/${p.maxHp}  | Lvl ${state.level} Wave ${state.wave} | Engineer ${p.lvl} | Kills ${state.kills} | Run ${Math.floor(state.runSeconds)}s`;
  objective.textContent = state.level===1 ? 'Objective: Survive Skybridge Approach' : 'Objective: Break through Citadel Breach';

  if(state.phase==='defeat' || state.phase==='victory'){
    overlay.style.display='block';
    overlay.textContent = state.phase==='victory'
      ? `VICTORY! The rail bastion survives.\nRun time: ${Math.floor(state.runSeconds/60)}m ${Math.floor(state.runSeconds%60)}s\nRefresh to play again.`
      : 'DEFEAT. The bastion was overrun.\nRefresh to retry.';
  }
}

let last = performance.now();
function loop(now){
  const dt = Math.min(0.033,(now-last)/1000); last=now; state.t += dt;
  update(dt); draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (new URLSearchParams(location.search).get('smoke') === '1') {
  const smoke = { title:'Glassrail Bastion Smoke', ok:true, checks:[] };
  smoke.checks.push({name:'canvas', pass: !!canvas});
  smoke.checks.push({name:'player-initialized', pass: !!state.player && state.player.hp===100});
  smoke.checks.push({name:'two-level-structure', pass: state.level===1});
  setTimeout(()=>{
    smoke.checks.push({name:'render-loop-running', pass: state.t>0.2});
    smoke.ok = smoke.checks.every(c=>c.pass);
    document.body.dataset.smoke = JSON.stringify(smoke);
    console.log('SMOKE', JSON.stringify(smoke));
  }, 400);
}
