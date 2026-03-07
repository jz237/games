// Ink & Press — minimal prototype scaffold
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const scoreEl = document.getElementById('score');
let score = 0;
let state = 'idle';

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
    startBtn.textContent = 'Press SPACE to press';
    logTest('tutorial_started');
  }
});

window.addEventListener('keydown', (e)=>{
  if(e.code === 'Space' && state === 'tutorial'){
    // evaluate timing
    const t = Math.abs(cueAng) < 0.08;
    if(t){ score += 100; scoreEl.textContent = 'Score: '+score; logTest('press_good'); }
    else { score += 10; scoreEl.textContent = 'Score: '+score; logTest('press_bad'); }
  }
});

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
  pressSpace: () => { window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'})); },
  readLog: () => testLog.slice(),
};

// auto-start minimized for dev
// startBtn.click();
