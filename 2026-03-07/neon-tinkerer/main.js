// Neon Tinkerer - mobile-first prototype scaffold
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = canvas.width, H = canvas.height;

// resize canvas to fit viewport while preserving aspect ratio
function fitCanvas(){
  const vw = window.innerWidth, vh = window.innerHeight;
  const targetRatio = canvas.width / canvas.height;
  let w = vw, h = Math.min(vh, Math.round(vw / targetRatio));
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  W = canvas.width; H = canvas.height;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

let keys = {};
window.addEventListener('keydown', e=>keys[e.key]=true);
window.addEventListener('keyup', e=>keys[e.key]=false);

const player = {x:100,y:100,w:24,h:24,speed:160};
const crates = [{x:300,y:200,w:20,h:20,collected:false}];

// simple virtual joystick state
let joy = {active:false, x:0, y:0};
canvas.addEventListener('touchstart', e=>{
  e.preventDefault();
  const t = e.touches[0];
  joy.active = true; joy.x = t.clientX; joy.y = t.clientY;
}, {passive:false});
canvas.addEventListener('touchmove', e=>{
  e.preventDefault();
  const t = e.touches[0];
  joy.x = t.clientX; joy.y = t.clientY;
}, {passive:false});
canvas.addEventListener('touchend', e=>{ joy.active=false; }, {passive:true});

function update(dt){
  let dx=0,dy=0;
  if(keys.ArrowLeft||keys.a) dx=-1;
  if(keys.ArrowRight||keys.d) dx=1;
  if(keys.ArrowUp||keys.w) dy=-1;
  if(keys.ArrowDown||keys.s) dy=1;
  // touch joystick: convert touch pos to direction relative to canvas center
  if(joy.active){
    // find canvas bounding rect to normalize
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    const rx = (joy.x - cx) / (rect.width/2);
    const ry = (joy.y - cy) / (rect.height/2);
    dx += rx; dy += ry;
  }
  if(dx||dy){
    const len = Math.hypot(dx,dy) || 1;
    player.x += (dx/len)*player.speed*dt;
    player.y += (dy/len)*player.speed*dt;
  }
  // clamp
  player.x = Math.max(0,Math.min(W-player.w,player.x));
  player.y = Math.max(0,Math.min(H-player.h,player.y));

  // pickup crates
  for(let c of crates){
    if(!c.collected && rectOverlap(player,c)){
      c.collected = true;
      console.log('Picked up a part!');
    }
  }
}

function rectOverlap(a,b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}

function draw(){
  ctx.clearRect(0,0,W,H);
  // background
  ctx.fillStyle='#061226';
  ctx.fillRect(0,0,W,H);
  // subtle grid scaled to current display
  for(let x=0;x<W;x+=Math.max(20,Math.floor(W/20))){ctx.strokeStyle='rgba(0,255,200,0.03)';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=Math.max(20,Math.floor(H/20))){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

  // crates
  for(let c of crates) if(!c.collected){ctx.fillStyle='#ffaa33';ctx.fillRect(c.x,c.y,c.w,c.h)}

  // player
  ctx.fillStyle='#00ffd5';
  ctx.fillRect(player.x,player.y,player.w,player.h);

  // HUD
  ctx.fillStyle='#aaffee';ctx.font='16px Arial';
  const parts = crates.filter(c=>c.collected).length;
  ctx.fillText('Parts: '+parts,10,20);

  // draw simple joystick indicator when active (mobile)
  if(joy.active){
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.translate((joy.x - rect.left) * (canvas.width/rect.width), (joy.y - rect.top) * (canvas.height/rect.height));
    ctx.strokeStyle='rgba(0,255,200,0.6)'; ctx.beginPath(); ctx.arc(0,0,24,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }
}

let last=performance.now();
function loop(t){
  const dt=Math.min(0.05,(t-last)/1000);
  update(dt);
  draw();
  last=t;requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

console.log('Neon Tinkerer mobile-first prototype loaded.');