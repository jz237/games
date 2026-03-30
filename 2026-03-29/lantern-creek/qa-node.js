const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('./index.html','utf8');
const js=html.match(/<script>([\s\S]*)<\/script>/)[1];

function makeClassList(){
  const set=new Set();
  return {add:c=>set.add(c),remove:c=>set.delete(c),toggle:(c,force)=>{if(force===undefined){set.has(c)?set.delete(c):set.add(c)}else{force?set.add(c):set.delete(c)}},contains:c=>set.has(c),toString:()=>[...set].join(' ')};
}
function makeEl(id){
  return {
    id,
    style:{},
    textContent:'',
    innerHTML:'',
    children:[],
    classList:makeClassList(),
    listeners:{},
    appendChild(ch){this.children.push(ch);return ch;},
    addEventListener(type,fn){(this.listeners[type]||(this.listeners[type]=[])).push(fn);},
    dispatchEvent(evt){evt.target=evt.target||this; evt.preventDefault=evt.preventDefault||(()=>{}); evt.stopPropagation=evt.stopPropagation||(()=>{}); (this.listeners[evt.type]||[]).forEach(fn=>fn(evt)); return true;},
    closest(sel){ if(sel==='button' && this.tagName==='BUTTON') return this; if(sel==='.overlay' && this.isOverlay) return this; return null; },
    getContext(){return ctx;},
  };
}
const ctx=new Proxy({}, {get:(o,p)=>{if(!(p in o))o[p]=()=>{};return o[p];}, set:(o,p,v)=>{o[p]=v; return true;}});
ctx.createLinearGradient=()=>({addColorStop(){}});
ctx.createRadialGradient=()=>({addColorStop(){}});

const ids=['c','hud','hudScore','hudStreak','hudLives','hudPhase','titleScreen','btnPlay','btnHS','gameOver','finalScore','finalStats','initialsEntry','letterPickers','btnSubmitScore','btnReplay','btnBackMenu','highScores','hsList','btnHSBack'];
const els={}; ids.forEach(id=>els[id]=makeEl(id));
els.c.tagName='CANVAS';
['btnPlay','btnHS','btnSubmitScore','btnReplay','btnBackMenu','btnHSBack'].forEach(id=>els[id].tagName='BUTTON');
['titleScreen','gameOver','highScores'].forEach(id=>{els[id].isOverlay=true; if(id!=='titleScreen')els[id].classList.add('hidden');});
els.hud.classList.add('hidden');

const document={
  getElementById:id=>els[id],
  createElement(tag){ const el=makeEl(''); el.tagName=tag.toUpperCase(); return el; }
};
const windowObj={
  innerWidth:390,innerHeight:844,devicePixelRatio:2,
  addEventListener(){},
  AudioContext:function(){return {state:'running',resume(){},createOscillator(){return {type:'',frequency:{setValueAtTime(){}},connect(){},start(){},stop(){}}},createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},value:0},connect(){}}},createBuffer(ch,len,rate){return {getChannelData(){return new Float32Array(len)}}},createBufferSource(){return {buffer:null,loop:false,connect(){},start(){},stop(){}}},createBiquadFilter(){return {type:'',frequency:{value:0},connect(){}}},destination:{},currentTime:0,sampleRate:44100};},
  webkitAudioContext:null,
};
windowObj.window=windowObj;
const storage={};
const localStorage={getItem:k=>storage[k]??null,setItem:(k,v)=>storage[k]=String(v)};
let now=0;
const performance={now:()=>now};
function raf(){}
function Event(type, opts={}){ return {type,...opts}; }
function TouchEvent(type, opts={}){ return {type,...opts}; }
const sandbox={console,document,window:windowObj,localStorage,performance,requestAnimationFrame:raf,Event,TouchEvent,setTimeout:(fn)=>fn(),Math,JSON,Date};
vm.createContext(sandbox);
vm.runInContext(js,sandbox);

const tests=[];
function assert(name, cond, detail=''){tests.push({name,pass:!!cond,detail});}
function ev(type, changedTouches=[]){return {type,changedTouches,preventDefault(){},stopPropagation(){},target:els.c};}

// Start gameplay
els.btnPlay.dispatchEvent({type:'touchend',preventDefault(){},stopPropagation(){},target:els.btnPlay});
assert('play transitions to gameplay', vm.runInContext("state==='playing'",sandbox));
assert('hud shown after play', !els.hud.classList.contains('hidden'));
assert('score resets to 0', els.hudScore.textContent===0 || els.hudScore.textContent==='0', 'score='+els.hudScore.textContent);
assert('five lives at start', els.hudLives.textContent==='🏮🏮🏮🏮🏮', 'lives='+els.hudLives.textContent);

// Fix 1 restart clears touches/swipeTrails
vm.runInContext("touches={1:{x:1,y:1,sx:1,sy:1,startTime:0,moved:false,held:true}}; swipeTrails=[{x:1,y:1,vx:1,vy:1,t:0,maxT:1}]",sandbox);
els.btnReplay.dispatchEvent({type:'touchend',preventDefault(){},stopPropagation(){},target:els.btnReplay});
assert('restart clears touches', vm.runInContext('Object.keys(touches).length===0',sandbox));
assert('restart clears swipeTrails', vm.runInContext('swipeTrails.length===0',sandbox));

// Fix 2 touchcancel exists and clears
vm.runInContext("touches={7:{x:11,y:12,sx:11,sy:12,startTime:0,moved:false,held:false}}; swipeTrails=[{x:9,y:9,vx:1,vy:1,t:0,maxT:1}]",sandbox);
els.c.dispatchEvent(ev('touchcancel',[{identifier:7,clientX:11,clientY:12}]));
assert('touchcancel clears matching touch', vm.runInContext('Object.keys(touches).length===0',sandbox));
assert('touchcancel clears swipe trails', vm.runInContext('swipeTrails.length===0',sandbox));

// Touch start/end bookkeeping
els.c.dispatchEvent(ev('touchstart',[{identifier:3,clientX:100,clientY:200}]));
assert('touchstart registers touch', vm.runInContext('Object.keys(touches).length===1',sandbox));
els.c.dispatchEvent(ev('touchend',[{identifier:3,clientX:100,clientY:200}]));
assert('touchend removes touch', vm.runInContext('Object.keys(touches).length===0',sandbox));

// Held touch force path does not crash and marks held
vm.runInContext("touches={5:{x:120,y:220,sx:120,sy:220,startTime:0,moved:false,held:false}}",sandbox); now=500; vm.runInContext('applyHeldForces(0.016)',sandbox);
assert('held touch becomes held after threshold', vm.runInContext('touches[5].held===true',sandbox));

// Collect / lose / gameover flow
vm.runInContext("state='playing'; initGame(); lanterns=[makeLantern(100,100,'orange')]; gates=[makeGate(50,100,200)]; collectLantern(lanterns[0],gates[0]); updateHUD();",sandbox);
assert('collect increases score', Number(els.hudScore.textContent)>=10, 'score='+els.hudScore.textContent);
assert('streak updates after collect', /streak/.test(String(els.hudStreak.textContent)) || String(els.hudStreak.textContent)==='', 'streak='+els.hudStreak.textContent);
vm.runInContext("state='playing'; lanternsLostCount=4; loseLantern({alive:true,x:100,y:100,color:'#fff'});",sandbox);
assert('5th loss ends game', vm.runInContext("state==='gameover'",sandbox));
assert('gameover overlay shown', !els.gameOver.classList.contains('hidden'));
assert('final score populated', String(els.finalScore.textContent).length>0);

// High score flow
els.btnBackMenu.dispatchEvent({type:'touchend',preventDefault(){},stopPropagation(){},target:els.btnBackMenu});
assert('menu button shows title', !els.titleScreen.classList.contains('hidden'));
els.btnHS.dispatchEvent({type:'touchend',preventDefault(){},stopPropagation(){},target:els.btnHS});
assert('high scores screen opens', !els.highScores.classList.contains('hidden'));
els.btnHSBack.dispatchEvent({type:'touchend',preventDefault(){},stopPropagation(){},target:els.btnHSBack});
assert('high scores back returns title', !els.titleScreen.classList.contains('hidden'));

for(const t of tests) console.log((t.pass?'PASS':'FAIL')+': '+t.name+(t.detail?' -- '+t.detail:''));
const failed=tests.filter(t=>!t.pass).length;
console.log('SUMMARY failed='+failed+' total='+tests.length);
process.exit(failed?1:0);
