import { createInitialState, runSimulationTicks } from '../game.mjs';

const lines = [];
function check(name, cond, detail='') {
  const status = cond ? 'PASS' : 'FAIL';
  lines.push(`[${status}] ${name}${detail ? ` :: ${detail}` : ''}`);
  if (!cond) process.exitCode = 1;
}

const s = createInitialState();
check('Initial HP', s.hp === 100, `hp=${s.hp}`);
check('Initial sector', s.sector === 0, `sector=${s.sector}`);

const sim = runSimulationTicks(800);
check('Simulation progression', sim.valid, `lvl=${sim.lvl}, shards=${sim.shards}`);
check('Level increased', sim.lvl >= 2, `lvl=${sim.lvl}`);
check('Shards collected', sim.shards >= 8, `shards=${sim.shards}`);

console.log(lines.join('\n'));
