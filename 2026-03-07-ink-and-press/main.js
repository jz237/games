// Ink & Press — mobile-first scaffold
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const scoreEl = document.getElementById('score');
let score = 0;
let state = 'idle';

// fit canvas to viewport width (mobile-first)
function fit(){
  const vw = window.innerWidth;
  canvas.style.width = vw + 'px';
  canvas.style.height = Math.round(vw * (canvas.height/canvas.width)) + 'px';
}
window.addEventListener('resize', fit); fit();

function drawBackground(){
  ctx.fillStyle = '#fbf7f2';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  // simple press bed
  ctx.fillStyle = '#e6d8c7';
  ctx.fillRect(80,220,800,260);
  ctx.fillStyle='#c9b59f';
  ctx.fillRect(140,260,680,180);
}

function drawCue(angle){
  ctx.save();
  ctx.translate(480,160);
  ctx.rotate(angle);
  ctx.fillStyle = '#6b4f3b';
  ctx.fillRect(-220,-14,440,28);
  ctx.restore();
}

let cueAng = -0.25; // radians
let cueDir = 1;
let running = false;

function update(dt){
  // simple oscillating cue for timing
  cueAng += cueDir * dt * 0.002;
  if(cueAng > 0.25){ cueDir = -1 }
  if(cueAng < -0.25){ cueDir = 1 }
}

function render(){
  drawBackground();
  drawCue(cueAng);
  // TODO: draw type, guides, ink roller
}

let last = performance.now();
function loop(t){
  const dt = t - last; last = t;
  if(running){ update(dt); render(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

startBtn.addEventListener('click', ()=>{
  if(state === 'idle'){
    state = 'tutorial';
    running = true;
    startBtn.textContent = 'Tap to press';
    logTest('tutorial_started');
  }
});

// add simple touch controls: tap to press
canvas.addEventListener('touchstart', e=>{ e.preventDefault(); if(state==='tutorial'){ doPress(); } }, {passive:false});
canvas.addEventListener('click', ()=>{ if(state==='tutorial'){ doPress(); } });

function doPress(){
  const t = Math.abs(cueAng) < 0.08;
  if(t){ score += 100; scoreEl.textContent = 'Score: '+score; logTest('press_good'); }
  else { score += 10; scoreEl.textContent = 'Score: '+score; logTest('press_bad'); }
}

// Simple in-page test logger (will be saved by smoke tests harness)
const testLog = [];
function logTest(entry){
  const line = new Date().toISOString() + ' ' + entry;
  testLog.push(line);
  console.log(line);
}

// Expose for automated harness
window.__INK_PRESS = {
  startTutorial: () => { startBtn.click(); },
  press: () => { doPress(); },
  readLog: () => testLog.slice(),
};

// auto-start minimized for dev
// startBtn.click();
