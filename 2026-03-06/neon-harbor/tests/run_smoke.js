// Simple smoke test runner for Neon Harbor
async function runSmoke(){
  // Wait for load
  await new Promise(r=>setTimeout(r,2000));
  // Simulate a few key presses
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp'}));
  await new Promise(r=>setTimeout(r,500));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowUp'}));
  // Call smoke hook
  if (window.__smokeTest) return window.__smokeTest();
  return {ok:false,error:'no-smoke-hook'};
}
runSmoke().then(r=>console.log('SMOKE',r)).catch(e=>console.error('SMOKEERR',e));