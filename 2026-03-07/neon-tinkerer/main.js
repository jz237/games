// Neon Tinkerer - minimal prototype scaffold
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let keys = {};
window.addEventListener('keydown', e=>keys[e.key]=true);
window.addEventListener('keyup', e=>keys[e.key]=false);

const player = {x:100,y:100,w:24,h:24,speed:160};
const crates = [{x:300,y:200,w:20,h:20,collected:false}];

function update(dt){
  let dx=0,dy=0;
  if(keys.ArrowLeft||keys.a) dx=-1;
  if(keys.ArrowRight||keys.d) dx=1;
  if(keys.ArrowUp||keys.w) dy=-1;
  if(keys.ArrowDown||keys.s) dy=1;
  if(dx||dy){
    const len = Math.hypot(dx,dy)||1;
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
  // background grid
  ctx.fillStyle='#061226';
  ctx.fillRect(0,0,W,H);
  for(let x=0;x<W;x+=40){ctx.strokeStyle='rgba(0,255,200,0.03)';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

  // crates
  for(let c of crates) if(!c.collected){ctx.fillStyle='#ffaa33';ctx.fillRect(c.x,c.y,c.w,c.h)}

  // player
  ctx.fillStyle='#00ffd5';
  ctx.fillRect(player.x,player.y,player.w,player.h);

  // HUD
  ctx.fillStyle='#aaffee';ctx.font='16px Arial';
  const parts = crates.filter(c=>c.collected).length;
  ctx.fillText('Parts: '+parts,10,20);
}

let last=performance.now();
function loop(t){
  const dt=Math.min(0.05,(t-last)/1000);
  update(dt);
  draw();
  last=t;requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

console.log('Neon Tinkerer prototype scaffold loaded.');