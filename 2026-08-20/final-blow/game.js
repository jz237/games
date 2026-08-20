const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;
const FLOOR = 600;
const GRAVITY = 1850;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

const roster = [
  {
    id: "deathblow",
    name: "DEATHBLOW",
    title: "SEISMIC BRAWLER",
    mark: "DB",
    color: "#e52d2d",
    accent: "#ffb21f",
    weapon: "gauntlets",
    special: "FAULTLINE PUNCH",
    finishers: ["FAULTLINE EXECUTION", "AFTERSHOCK BURIAL"],
  },
  {
    id: "jez",
    name: "JEZ",
    title: "NEON SIGNSMITH",
    mark: "JZ",
    color: "#14cbe8",
    accent: "#ff43c5",
    weapon: "signblade",
    special: "VINYL SNARE",
    finishers: ["NEON GUILLOTINE", "VINYL WRAP"],
  },
  {
    id: "alan",
    name: "ALAN SMITHEE",
    title: "UNCREDITED WILDCARD",
    mark: "AS",
    color: "#d8d8d8",
    accent: "#e52d2d",
    weapon: "reelchain",
    special: "JUMP CUT",
    finishers: ["THE FINAL CUT", "UNCREDITED"],
  },
  {
    id: "post",
    name: "POST",
    title: "DEAD-LETTER ENFORCER",
    mark: "P",
    color: "#e59b25",
    accent: "#fff1b0",
    weapon: "posthammer",
    special: "EXPRESS DELIVERY",
    finishers: ["DEAD LETTER", "RETURN TO SENDER"],
  },
  {
    id: "benny",
    name: "BENNY FRANKLIN",
    title: "STORM INVENTOR",
    mark: "BF",
    color: "#416fe8",
    accent: "#f7e53e",
    weapon: "caneblade",
    special: "KITE & KEY",
    finishers: ["LIGHTNING ROD", "THUNDER SIGNATURE"],
  },
  {
    id: "donald",
    name: "DONALD TRUMP",
    title: "GILDED SHOWMAN",
    mark: "DT",
    color: "#315fb4",
    accent: "#f1bd26",
    weapon: "golfclub",
    special: "GOLDEN SHOCKWAVE",
    finishers: ["GOLDEN SEND-OFF", "YOU'RE FIRED!"],
  },
  {
    id: "cyraxx",
    name: "CYRAXX",
    title: "FEEDBACK TRICKSTER",
    mark: "CX",
    color: "#54cf42",
    accent: "#ad5aff",
    weapon: "micstaff",
    special: "BUFFERING",
    finishers: ["FEEDBACK BLACKOUT", "INTERNET MELTDOWN"],
  },
  {
    id: "ali",
    name: "ALI G",
    title: "WEST STAINES MC",
    mark: "AG",
    color: "#f4d21f",
    accent: "#ff48aa",
    weapon: "micchucks",
    special: "BASS DROP",
    finishers: ["MIC DROP", "WEST STAINES MASSIVE"],
  },
];

const stages = {
  kensington: {
    name: "KENSINGTON & ALLEGHENY",
    ticker: "KENSINGTON & ALLEGHENY // PHILADELPHIA",
    src: "assets/kensington-allegheny.webp",
  },
  vet: {
    name: "THE VET PARKING LOT",
    ticker: "VETERANS STADIUM // SOUTH PHILADELPHIA // 1999",
    src: "assets/veterans-stadium.webp",
  },
};

const stageImages = {};
for (const [id, stage] of Object.entries(stages)) {
  const image = new Image();
  image.src = stage.src;
  stageImages[id] = image;
}

const fighterImages = {};
for (const fighter of roster) {
  const image = new Image();
  image.src = `assets/fighters/${fighter.id}.webp`;
  fighterImages[fighter.id] = image;
}

// Original soundtrack and combat cues generated with the ElevenLabs API.
const audioAssets = {
  select: "assets/audio/ui-select.mp3",
  jump: "assets/audio/jump.mp3",
  light: "assets/audio/light-swing.mp3",
  heavy: "assets/audio/heavy-swing.mp3",
  special: "assets/audio/special-swing.mp3",
  hit: "assets/audio/body-hit.mp3",
  block: "assets/audio/block.mp3",
  finish: "assets/audio/finish-ready.mp3",
  final: "assets/audio/final-blow.mp3",
  ko: "assets/audio/knockout.mp3",
};

const sfxVolumes = {
  select: 0.5,
  jump: 0.42,
  light: 0.5,
  heavy: 0.58,
  special: 0.65,
  hit: 0.72,
  block: 0.62,
  finish: 0.78,
  final: 0.92,
  ko: 0.8,
};

const sfxPools = Object.fromEntries(Object.entries(audioAssets).map(([kind, src]) => [
  kind,
  Array.from({ length: kind === "hit" ? 5 : 3 }, () => {
    const sample = new Audio(src);
    sample.preload = "auto";
    return sample;
  }),
]));
const sfxCursors = Object.fromEntries(Object.keys(audioAssets).map((kind) => [kind, 0]));

const fightMusic = new Audio("assets/audio/philly-after-dark.mp3");
fightMusic.preload = "auto";
fightMusic.loop = true;
fightMusic.volume = 0.24;
let musicDuckTimer = 0;

const keys = new Set();
const pressed = new Set();
const touch = new Set();
const previousPads = new Map();
const commandHistory = [[], []];

const keyMaps = [
  { left: "KeyA", right: "KeyD", jump: "KeyW", block: "KeyS", light: "KeyJ", heavy: "KeyK", special: "KeyL", final: "KeyU" },
  { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", block: "ArrowDown", light: "Numpad1", heavy: "Numpad2", special: "Numpad3", final: "Numpad0" },
];

const state = {
  screen: "title",
  mode: "arcade",
  picks: [0, 1],
  locks: [false, false],
  selectingPlayer: 0,
  stage: "kensington",
  fighters: [],
  particles: [],
  effects: [],
  rounds: [0, 0],
  round: 1,
  timer: 99,
  timerCarry: 0,
  phase: "idle",
  phaseTime: 0,
  finishWinner: -1,
  finisherType: 0,
  shake: 0,
  flash: 0,
  lastTime: performance.now(),
  audio: null,
  audioUnlocked: false,
  musicDuck: 1,
};

function makeFighter(index, side) {
  const def = roster[index];
  return {
    def,
    side,
    x: side === 0 ? 355 : 925,
    y: FLOOR,
    vx: 0,
    vy: 0,
    width: 92,
    height: 196,
    facing: side === 0 ? 1 : -1,
    health: 100,
    meter: 0,
    grounded: true,
    crouch: false,
    block: false,
    attacking: null,
    attackTime: 0,
    attackHit: false,
    stun: 0,
    hitFlash: 0,
    specialGlow: 0,
    down: false,
    aiClock: 0,
  };
}

function setupRoster() {
  const grid = $("#rosterGrid");
  grid.innerHTML = "";
  roster.forEach((fighter, index) => {
    const card = document.createElement("button");
    card.className = "fighter-card";
    card.dataset.index = index;
    card.dataset.mark = fighter.mark;
    card.style.setProperty("--fighter", fighter.color);
    card.innerHTML = `
      <span class="pick-badge p1">P1</span><span class="pick-badge p2">P2</span>
      <img class="fighter-portrait" src="assets/fighters/${fighter.id}.webp" alt="" aria-hidden="true" draggable="false">
      <span class="fighter-info"><strong>${fighter.name}</strong><small>${fighter.title}</small></span>`;
    card.addEventListener("click", () => chooseFighter(index));
    grid.append(card);
  });
  updateRosterUI();
}

function showScreen(name) {
  state.screen = name;
  $$(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === `${name}Screen`));
  const playing = name === "fight";
  $("#hud").classList.toggle("hidden", !playing);
  $("#hud").setAttribute("aria-hidden", String(!playing));
  $("#touchControls").classList.toggle("playing", playing);
  if (!playing) $("#announcer").classList.add("hidden");
  syncMusic();
}

function startSelect(mode) {
  unlockAudio();
  state.mode = mode;
  state.picks = [0, mode === "arcade" ? 4 : 1];
  state.locks = [false, mode === "arcade"];
  state.selectingPlayer = 0;
  $("#selectPrompt").textContent = "PLAYER 1 — CHOOSE";
  showScreen("select");
  updateRosterUI();
}

function chooseFighter(index) {
  unlockAudio();
  if (state.mode === "arcade") {
    state.picks[0] = index;
    state.locks = [true, true];
    let opponent = Math.floor(Math.random() * roster.length);
    if (opponent === index) opponent = (opponent + 1) % roster.length;
    state.picks[1] = opponent;
  } else if (!state.locks[0]) {
    state.picks[0] = index;
    state.locks[0] = true;
    state.selectingPlayer = 1;
    $("#selectPrompt").textContent = "PLAYER 2 — CHOOSE";
  } else {
    state.picks[1] = index;
    state.locks[1] = true;
    state.selectingPlayer = 1;
  }
  sound("select");
  updateRosterUI();
}

function updateRosterUI() {
  $$(".fighter-card").forEach((card) => {
    const index = Number(card.dataset.index);
    card.classList.toggle("p1-pick", state.locks[0] && state.picks[0] === index);
    card.classList.toggle("p2-pick", state.locks[1] && state.picks[1] === index);
    card.classList.toggle("focused", !state.locks[state.selectingPlayer] && state.picks[state.selectingPlayer] === index);
  });
  $("#selectionReadout").innerHTML = `<span>P1</span> ${roster[state.picks[0]].name} <i>VS</i> <span>P2</span> ${roster[state.picks[1]].name}`;
  $("#fighterContinue").disabled = !(state.locks[0] && state.locks[1]);
}

function showStageSelect() {
  if (!(state.locks[0] && state.locks[1])) return;
  showScreen("stage");
  updateStageUI();
}

function chooseStage(id) {
  state.stage = id;
  sound("select");
  updateStageUI();
}

function updateStageUI() {
  $$(".stage-card").forEach((card) => card.classList.toggle("selected", card.dataset.stage === state.stage));
  $("#stageReadout").textContent = stages[state.stage].name;
  $("#stageTicker").textContent = stages[state.stage].ticker;
}

function startMatch(resetSet = true) {
  unlockAudio();
  resetMusicDuck();
  if (resetSet) {
    state.rounds = [0, 0];
    state.round = 1;
  }
  state.fighters = [makeFighter(state.picks[0], 0), makeFighter(state.picks[1], 1)];
  state.particles.length = 0;
  state.effects.length = 0;
  state.timer = 99;
  state.timerCarry = 0;
  state.phase = "intro";
  state.phaseTime = 2.25;
  state.finishWinner = -1;
  state.finisherType = 0;
  commandHistory[0].length = 0;
  commandHistory[1].length = 0;
  updateHud();
  showScreen("fight");
  announce(`ROUND ${state.round}`, stages[state.stage].name, 1.2);
  setTimeout(() => {
    if (state.screen === "fight" && state.phase === "intro") announce("FIGHT!", "NO MERCY ON THESE STREETS", 0.8);
  }, 1150);
  canvas.focus();
}

function resetRound() {
  resetMusicDuck();
  state.round += 1;
  state.fighters = [makeFighter(state.picks[0], 0), makeFighter(state.picks[1], 1)];
  state.particles.length = 0;
  state.effects.length = 0;
  state.timer = 99;
  state.timerCarry = 0;
  state.phase = "intro";
  state.phaseTime = 2.1;
  state.finishWinner = -1;
  commandHistory[0].length = 0;
  commandHistory[1].length = 0;
  updateHud();
  announce(`ROUND ${state.round}`, "SETTLE IT", 1.15);
  setTimeout(() => {
    if (state.screen === "fight" && state.phase === "intro") announce("FIGHT!", "", 0.75);
  }, 1050);
}

function announce(main, sub = "", duration = 1) {
  const box = $("#announcer");
  box.querySelector("strong").textContent = main;
  box.querySelector("span").textContent = sub;
  box.classList.remove("hidden");
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => box.classList.add("hidden"), duration * 1000);
}

function finishRound(winner, type = -1) {
  if (state.phase === "roundover" || state.phase === "result") return;
  state.phase = "roundover";
  state.phaseTime = type >= 0 ? 3.4 : 2.4;
  state.rounds[winner] += 1;
  state.finisherType = type;
  const winDef = state.fighters[winner].def;
  if (type >= 0) {
    duckMusic(0.12, 2900);
    announce("FINAL BLOW", winDef.finishers[type], 2.35);
    performFinisher(winner, type);
  } else {
    duckMusic(0.28, 1700);
    announce(`${winDef.name} WINS`, "KNOCKOUT", 1.65);
    sound("ko");
  }
  updateHud();
}

function performFinisher(winner, type) {
  const attacker = state.fighters[winner];
  const victim = state.fighters[1 - winner];
  attacker.specialGlow = 2.4;
  victim.down = true;
  state.shake = 1.2;
  state.flash = $("#flashToggle").checked ? 0.32 : 0;
  const particleCount = $("#goreToggle").checked ? 78 : 44;
  for (let i = 0; i < particleCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 130 + Math.random() * 620;
    state.particles.push({
      x: victim.x,
      y: victim.y - 105,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 130,
      life: 0.55 + Math.random() * 1.15,
      max: 1.7,
      size: 2 + Math.random() * 8,
      color: $("#goreToggle").checked ? (Math.random() > 0.22 ? "#d90b19" : attacker.def.accent) : attacker.def.accent,
    });
  }
  state.effects.push({ kind: type === 0 ? "slash" : "burst", x: victim.x, y: victim.y - 105, life: 0.9, color: attacker.def.accent });
  sound("final");
}

function showResult(winner) {
  state.phase = "result";
  const def = state.fighters[winner].def;
  $("#resultTitle").textContent = `${def.name} WINS`;
  $("#resultFinisher").textContent = state.finisherType >= 0 ? def.finishers[state.finisherType] : "KNOCKOUT";
  showScreen("result");
}

function updateHud() {
  if (!state.fighters.length) return;
  state.fighters.forEach((fighter, side) => {
    const prefix = side === 0 ? "p1" : "p2";
    $(`#${prefix}Name`).textContent = fighter.def.name;
    const health = clamp(fighter.health, 0, 100) / 100;
    const healthBar = $(`#${prefix}Health`);
    healthBar.style.transform = `scaleX(${health})`;
    healthBar.classList.toggle("danger", health <= 0.25);
    $(`#${prefix}Damage`).style.transform = `scaleX(${health})`;
    $(`#${prefix}Meter`).style.transform = `scaleX(${clamp(fighter.meter, 0, 100) / 100})`;
    $(`#${prefix}Rounds`).innerHTML = [0, 1].map((round) => `<i class="${state.rounds[side] > round ? "won" : ""}"></i>`).join("");
  });
  $("#timer").textContent = String(Math.ceil(state.timer)).padStart(2, "0");
  $("#roundLabel").textContent = `ROUND ${state.round}`;
}

function getPad(index) {
  return [...(navigator.getGamepads?.() || [])].filter(Boolean)[index] || null;
}

function buttonValue(pad, index) {
  return pad?.buttons[index]?.pressed || (pad?.buttons[index]?.value || 0) > 0.55;
}

function readInput(side) {
  const map = keyMaps[side];
  const pad = getPad(side);
  const previous = previousPads.get(pad?.index) || [];
  const axisX = pad ? pad.axes[0] || 0 : 0;
  const axisY = pad ? pad.axes[1] || 0 : 0;
  const held = (action) => keys.has(map[action]) || (side === 0 && touch.has(action));
  const edge = (action) => pressed.has(map[action]) || (side === 0 && touch.has(`${action}:pressed`));
  const padEdge = (index) => Boolean(pad && buttonValue(pad, index) && !previous[index]);
  const left = held("left") || axisX < -0.42 || buttonValue(pad, 14);
  const right = held("right") || axisX > 0.42 || buttonValue(pad, 15);
  const down = held("block") || axisY > 0.52 || buttonValue(pad, 13);
  const jump = edge("jump") || padEdge(0) || Boolean(pad && (axisY < -0.65 || buttonValue(pad, 12)) && !previous[20]);
  const light = edge("light") || padEdge(2);
  const heavy = edge("heavy") || padEdge(3);
  const special = edge("special") || padEdge(4) || padEdge(5);
  const triggers = buttonValue(pad, 6) && buttonValue(pad, 7);
  const previousTriggers = Boolean(previous[6] && previous[7]);
  const final = edge("final") || (triggers && !previousTriggers) || (side === 0 && touch.has("final:pressed"));
  if (pad) {
    const next = pad.buttons.map((button) => button.pressed || button.value > 0.55);
    next[20] = axisY < -0.65 || buttonValue(pad, 12);
    previousPads.set(pad.index, next);
  }
  return { left, right, down, jump, light, heavy, special, final };
}

function aiInput(fighter, opponent, dt) {
  fighter.aiClock -= dt;
  const distance = opponent.x - fighter.x;
  const input = { left: false, right: false, down: false, jump: false, light: false, heavy: false, special: false, final: false };
  if (state.phase === "finish" && state.finishWinner === 1) {
    input.final = fighter.aiClock <= 0;
    if (input.final) fighter.aiClock = 2;
    return input;
  }
  if (fighter.aiClock <= 0) {
    fighter.aiClock = 0.14 + Math.random() * 0.32;
    const abs = Math.abs(distance);
    if (opponent.attacking && abs < 145 && Math.random() < 0.62) input.down = true;
    else if (abs > 250) {
      input.right = distance > 0;
      input.left = distance < 0;
      if (Math.random() < 0.22) input.special = true;
    } else if (abs > 115) {
      input.right = distance > 0;
      input.left = distance < 0;
      if (Math.random() < 0.2) input.jump = true;
      if (Math.random() < 0.32) input.special = true;
    } else {
      const roll = Math.random();
      if (roll < 0.44) input.light = true;
      else if (roll < 0.78) input.heavy = true;
      else input.down = true;
    }
  } else if (Math.abs(distance) > 170) {
    input.right = distance > 0;
    input.left = distance < 0;
  }
  return input;
}

function rememberCommand(side, token) {
  const history = commandHistory[side];
  const now = performance.now();
  if (!history.length || history.at(-1).token !== token || now - history.at(-1).time > 150) history.push({ token, time: now });
  while (history.length > 9 || (history[0] && now - history[0].time > 1800)) history.shift();
}

function commandMatches(side, sequence) {
  const tokens = commandHistory[side].map((item) => item.token);
  let cursor = tokens.length - 1;
  for (let i = sequence.length - 1; i >= 0; i -= 1) {
    while (cursor >= 0 && tokens[cursor] !== sequence[i]) cursor -= 1;
    if (cursor < 0) return false;
    cursor -= 1;
  }
  return true;
}

function recordInput(side, input, fighter) {
  if (input.down) rememberCommand(side, "down");
  if (input.left) rememberCommand(side, fighter.facing === -1 ? "forward" : "back");
  if (input.right) rememberCommand(side, fighter.facing === 1 ? "forward" : "back");
  if (input.heavy) rememberCommand(side, "heavy");
  if (input.special) rememberCommand(side, "special");
}

function tryFinish(side, input) {
  if (state.phase !== "finish" || state.finishWinner !== side) return false;
  let type = -1;
  if (commandMatches(side, ["back", "down", "forward", "special"])) type = 1;
  else if (commandMatches(side, ["down", "forward", "heavy"])) type = 0;
  else if (input.final) type = commandHistory[side].some((item) => item.token === "special") ? 1 : 0;
  if (type >= 0) {
    finishRound(side, type);
    return true;
  }
  return false;
}

function beginAttack(fighter, kind) {
  if (fighter.attacking || fighter.stun > 0 || fighter.down) return;
  const attackData = {
    light: { duration: 0.28, active: [0.08, 0.18], range: 92, damage: 6, push: 150, meter: 10 },
    heavy: { duration: 0.48, active: [0.16, 0.31], range: 124, damage: 12, push: 260, meter: 16 },
    special: { duration: 0.7, active: [0.24, 0.49], range: 174, damage: 17, push: 360, meter: 22 },
  }[kind];
  fighter.attacking = { kind, ...attackData };
  fighter.attackTime = 0;
  fighter.attackHit = false;
  if (kind === "special") fighter.specialGlow = 0.7;
  sound(kind);
}

function updateFighter(fighter, opponent, input, dt) {
  fighter.stun = Math.max(0, fighter.stun - dt);
  fighter.hitFlash = Math.max(0, fighter.hitFlash - dt);
  fighter.specialGlow = Math.max(0, fighter.specialGlow - dt);
  fighter.facing = opponent.x >= fighter.x ? 1 : -1;
  fighter.block = false;
  fighter.crouch = false;

  recordInput(fighter.side, input, fighter);
  if (tryFinish(fighter.side, input)) return;
  if (state.phase !== "fight") return;

  if (fighter.stun <= 0 && !fighter.attacking) {
    const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    fighter.block = input.down && fighter.grounded;
    fighter.crouch = fighter.block;
    fighter.vx = fighter.block ? 0 : move * 285;
    if (input.jump && fighter.grounded && !fighter.block) {
      fighter.vy = -730;
      fighter.grounded = false;
      sound("jump");
    }
    if (input.light) beginAttack(fighter, "light");
    else if (input.heavy) beginAttack(fighter, "heavy");
    else if (input.special) beginAttack(fighter, "special");
  } else if (fighter.stun > 0) {
    fighter.vx *= 0.9;
  }

  if (fighter.attacking) {
    fighter.attackTime += dt;
    fighter.vx *= 0.82;
    const attack = fighter.attacking;
    if (!fighter.attackHit && fighter.attackTime >= attack.active[0] && fighter.attackTime <= attack.active[1]) {
      const vertical = Math.abs((fighter.y - fighter.height * 0.5) - (opponent.y - opponent.height * 0.5));
      const forwardDistance = (opponent.x - fighter.x) * fighter.facing;
      if (forwardDistance > 8 && forwardDistance < attack.range && vertical < 125) hit(fighter, opponent, attack);
    }
    if (fighter.attackTime >= attack.duration) {
      fighter.attacking = null;
      fighter.attackTime = 0;
    }
  }

  fighter.vy += GRAVITY * dt;
  fighter.x += fighter.vx * dt;
  fighter.y += fighter.vy * dt;
  if (fighter.y >= FLOOR) {
    fighter.y = FLOOR;
    fighter.vy = 0;
    fighter.grounded = true;
  }
  fighter.x = clamp(fighter.x, 85, W - 85);
}

function hit(attacker, victim, attack) {
  attacker.attackHit = true;
  const blocked = victim.block && victim.facing === -attacker.facing;
  const damage = blocked ? Math.max(1, attack.damage * 0.22) : attack.damage;
  victim.health = clamp(victim.health - damage, 0, 100);
  victim.stun = blocked ? 0.09 : 0.18 + attack.damage * 0.009;
  victim.vx = attacker.facing * attack.push * (blocked ? 0.32 : 1);
  if (!blocked && attack.kind !== "light") victim.vy = -55 - attack.damage * 5;
  victim.hitFlash = 0.12;
  attacker.meter = clamp(attacker.meter + attack.meter, 0, 100);
  victim.meter = clamp(victim.meter + attack.meter * 0.45, 0, 100);
  state.shake = Math.max(state.shake, attack.kind === "special" ? 0.34 : 0.13);
  spawnHit(victim.x - attacker.facing * 22, victim.y - 105, attacker.def.accent, attack.kind === "special" ? 24 : 13);
  sound(blocked ? "block" : "hit");
  updateHud();

  if (victim.health <= 0 && state.phase === "fight") {
    state.phase = "finish";
    state.phaseTime = 6;
    state.finishWinner = attacker.side;
    victim.down = false;
    victim.stun = 99;
    attacker.attacking = null;
    attacker.meter = 100;
    duckMusic(0.34, 1900);
    announce("FINISH THEM", "↓ → HEAVY  /  ← ↓ → SPECIAL", 2.2);
    sound("finish");
  }
}

function spawnHit(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 310;
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.18 + Math.random() * 0.34, max: 0.55, size: 2 + Math.random() * 6, color });
  }
  state.effects.push({ kind: "hit", x, y, life: 0.22, color });
}

function separateFighters() {
  const [a, b] = state.fighters;
  if (!a || !b) return;
  const overlap = 86 - Math.abs(a.x - b.x);
  if (overlap > 0) {
    const direction = a.x < b.x ? -1 : 1;
    a.x += direction * overlap * 0.5;
    b.x -= direction * overlap * 0.5;
  }
}

function updateGame(dt) {
  if (state.screen !== "fight" || !state.fighters.length) return;
  state.phaseTime = Math.max(0, state.phaseTime - dt);
  state.shake = Math.max(0, state.shake - dt * 2.8);
  state.flash = Math.max(0, state.flash - dt);

  let input0 = readInput(0);
  let input1 = state.mode === "arcade" ? aiInput(state.fighters[1], state.fighters[0], dt) : readInput(1);
  if (state.phase === "intro") {
    input0 = {};
    input1 = {};
    if (state.phaseTime <= 0) state.phase = "fight";
  }

  updateFighter(state.fighters[0], state.fighters[1], input0, dt);
  updateFighter(state.fighters[1], state.fighters[0], input1, dt);
  separateFighters();

  if (state.phase === "fight") {
    state.timerCarry += dt;
    if (state.timerCarry >= 1) {
      state.timer = Math.max(0, state.timer - Math.floor(state.timerCarry));
      state.timerCarry %= 1;
      updateHud();
    }
    if (state.timer <= 0) {
      const winner = state.fighters[0].health >= state.fighters[1].health ? 0 : 1;
      finishRound(winner, -1);
    }
  } else if (state.phase === "finish" && state.phaseTime <= 0) {
    finishRound(state.finishWinner, -1);
  } else if (state.phase === "roundover" && state.phaseTime <= 0) {
    const winner = state.rounds[0] > state.rounds[1] ? 0 : 1;
    if (state.rounds[winner] >= 2) showResult(winner);
    else resetRound();
  }

  for (const particle of state.particles) {
    particle.life -= dt;
    particle.vy += 720 * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.985;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
  for (const effect of state.effects) effect.life -= dt;
  state.effects = state.effects.filter((effect) => effect.life > 0);
}

function drawCover(image, offsetX = 0) {
  if (!image.complete || !image.naturalWidth) {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#0a1d35");
    gradient.addColorStop(1, "#100507");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const scale = Math.max(W / image.naturalWidth, H / image.naturalHeight);
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  ctx.drawImage(image, (W - dw) * 0.5 + offsetX, (H - dh) * 0.5, dw, dh);
}

function drawStage(time) {
  const center = state.fighters.length ? (state.fighters[0].x + state.fighters[1].x) * 0.5 : W * 0.5;
  const parallax = (center - W * 0.5) * -0.035;
  drawCover(stageImages[state.stage], parallax);
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(0,8,18,.12)");
  shade.addColorStop(0.58, "rgba(0,0,0,.03)");
  shade.addColorStop(1, "rgba(2,3,5,.74)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  if (state.stage === "kensington") drawShufflers(time);
  else drawVetAtmosphere(time);

  ctx.fillStyle = "rgba(6,8,11,.26)";
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.strokeStyle = state.stage === "vet" ? "rgba(255,177,50,.18)" : "rgba(70,190,240,.16)";
  ctx.lineWidth = 2;
  for (let x = -100; x < W + 200; x += 150) {
    ctx.beginPath();
    ctx.moveTo(x, FLOOR);
    ctx.lineTo(W * 0.5 + (x - W * 0.5) * 1.65, H);
    ctx.stroke();
  }
}

function drawShufflers(time) {
  const people = [
    { x: 155, y: 493, scale: 0.48, speed: 0.7 },
    { x: 540, y: 475, scale: 0.38, speed: 0.47 },
    { x: 1100, y: 492, scale: 0.52, speed: 0.58 },
  ];
  for (const person of people) {
    const drift = Math.sin(time * 0.00016 * person.speed + person.x) * 19;
    const sway = Math.sin(time * 0.0012 * person.speed + person.x) * 0.06;
    ctx.save();
    ctx.translate(person.x + drift, person.y);
    ctx.scale(person.scale, person.scale);
    ctx.rotate(sway);
    ctx.fillStyle = "rgba(5,7,10,.73)";
    ctx.beginPath();
    ctx.ellipse(0, -80, 24, 28, 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = "round";
    ctx.lineWidth = 28;
    ctx.strokeStyle = "rgba(5,7,10,.76)";
    ctx.beginPath();
    ctx.moveTo(-8, -60);
    ctx.lineTo(25, -10);
    ctx.lineTo(16, 55);
    ctx.stroke();
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(13, -34);
    ctx.lineTo(43, 22);
    ctx.moveTo(4, -34);
    ctx.lineTo(27, 28);
    ctx.moveTo(16, 48);
    ctx.lineTo(-2, 100);
    ctx.moveTo(22, 48);
    ctx.lineTo(43, 100);
    ctx.stroke();
    ctx.restore();
  }
  const trainX = ((time * 0.08) % (W + 650)) - 500;
  ctx.fillStyle = "rgba(18,31,40,.7)";
  ctx.fillRect(trainX, 154, 430, 58);
  for (let x = trainX + 24; x < trainX + 410; x += 53) {
    ctx.fillStyle = "rgba(255,211,105,.75)";
    ctx.fillRect(x, 166, 34, 22);
  }
}

function drawVetAtmosphere(time) {
  for (let i = 0; i < 5; i += 1) {
    const x = 110 + i * 275 + Math.sin(time * 0.0002 + i) * 10;
    const y = 492 + (i % 2) * 23;
    const smoke = 19 + Math.sin(time * 0.001 + i) * 7;
    const gradient = ctx.createRadialGradient(x, y - 40, 2, x, y - 40, smoke * 2.5);
    gradient.addColorStop(0, "rgba(210,220,225,.13)");
    gradient.addColorStop(1, "rgba(210,220,225,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y - 40, smoke * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFighter(fighter, time) {
  const jump = FLOOR - fighter.y;
  const attackProgress = fighter.attacking ? fighter.attackTime / fighter.attacking.duration : 0;
  const attackSwing = fighter.attacking ? Math.sin(clamp(attackProgress, 0, 1) * Math.PI) : 0;
  const bob = fighter.grounded && !fighter.stun ? Math.sin(time * 0.007 + fighter.side * 2) * 3 : 0;
  const sprite = fighterImages[fighter.def.id];
  const sizeAdjust = {
    deathblow: 1.07,
    jez: .98,
    alan: 1.02,
    post: 1.06,
    benny: 1.01,
    donald: 1,
    cyraxx: 1.01,
    ali: .98,
  }[fighter.def.id] || 1;
  const renderHeight = 308 * sizeAdjust;
  const renderWidth = sprite?.naturalHeight ? renderHeight * sprite.naturalWidth / sprite.naturalHeight : 190;
  const attackKind = fighter.attacking?.kind;
  const lunge = attackSwing * (attackKind === "special" ? 55 : attackKind === "heavy" ? 38 : 24);
  const crouchScale = fighter.crouch ? .84 : 1;
  const crouchDrop = fighter.crouch ? 25 : 0;

  ctx.save();
  ctx.translate(fighter.x, fighter.y + bob);

  ctx.fillStyle = "rgba(0,0,0,.56)";
  ctx.beginPath();
  ctx.ellipse(0, jump + 5, renderWidth * .32, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  if (fighter.down) {
    ctx.rotate(-fighter.facing * 1.35);
    ctx.translate(-fighter.facing * 45, 17);
  }

  ctx.scale(fighter.facing, 1);
  ctx.translate(lunge, crouchDrop - attackSwing * (attackKind === "special" ? 12 : 4));
  ctx.rotate(-attackSwing * (attackKind === "heavy" ? .075 : .035));
  ctx.scale(1 + attackSwing * .035, crouchScale);

  if (fighter.specialGlow > 0) {
    const glow = ctx.createRadialGradient(0, -125, 18, 0, -125, 165);
    glow.addColorStop(0, `${fighter.def.accent}88`);
    glow.addColorStop(1, `${fighter.def.accent}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(-190, -315, 380, 335);
    ctx.strokeStyle = `${fighter.def.accent}99`;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i += 1) {
      const radius = 55 + i * 28 + Math.sin(time * .012 + i) * 7;
      ctx.beginPath();
      ctx.arc(0, -128, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (sprite?.complete && sprite.naturalWidth) {
    ctx.save();
    ctx.shadowColor = fighter.specialGlow > 0 ? fighter.def.accent : "rgba(0,0,0,.88)";
    ctx.shadowBlur = fighter.specialGlow > 0 ? 24 : 9;
    ctx.shadowOffsetY = 6;
    if (fighter.hitFlash > 0) ctx.filter = "brightness(2.4) saturate(.25)";
    else if (fighter.block) ctx.filter = "brightness(.82) saturate(.8)";
    ctx.drawImage(sprite, -renderWidth * .5, -renderHeight, renderWidth, renderHeight);
    ctx.restore();
  } else {
    ctx.fillStyle = fighter.def.color;
    ctx.fillRect(-48, -205, 96, 205);
    ctx.fillStyle = fighter.def.accent;
    ctx.beginPath();
    ctx.arc(0, -220, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  if (fighter.block) {
    ctx.strokeStyle = `${fighter.def.accent}cc`;
    ctx.shadowColor = fighter.def.accent;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(32, -135, 83, -1.18, 1.18);
    ctx.stroke();
  }

  ctx.restore();

  if (fighter.stun > 0.4 && !fighter.down) {
    ctx.fillStyle = fighter.def.accent;
    ctx.font = "900 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText("✦", fighter.x, fighter.y - fighter.height - 38 + Math.sin(time * 0.02) * 8);
  }
}

function drawLimb(x1, y1, x2, y2, width, skin, cloth) {
  ctx.lineCap = "round";
  ctx.strokeStyle = cloth;
  ctx.lineWidth = width + 6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(lerp(x1, x2, 0.62), lerp(y1, y2, 0.62));
  ctx.stroke();
  ctx.strokeStyle = skin;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(lerp(x1, x2, 0.58), lerp(y1, y2, 0.58));
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawWeapon(fighter, handX, handY, swing) {
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(-0.35 + swing * 1.25);
  ctx.strokeStyle = fighter.def.accent;
  ctx.fillStyle = fighter.def.accent;
  ctx.lineCap = "round";
  ctx.lineWidth = 8;
  switch (fighter.def.weapon) {
    case "gauntlets":
      ctx.fillRect(-12, -18, 42, 36);
      ctx.fillStyle = "#303741";
      for (let i = 0; i < 3; i += 1) ctx.fillRect(20 + i * 7, -15 + i * 3, 11, 8);
      break;
    case "signblade":
      ctx.shadowBlur = 20;
      ctx.shadowColor = fighter.def.accent;
      ctx.fillRect(-4, -12, 18, 20);
      ctx.fillRect(8, -94, 10, 100);
      ctx.fillRect(-4, -102, 34, 13);
      break;
    case "reelchain":
      ctx.beginPath();
      ctx.arc(10, -5, 21, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(25, -20);
      ctx.lineTo(73, -71);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case "posthammer":
      ctx.fillRect(6, -75, 9, 86);
      ctx.fillRect(-20, -89, 61, 25);
      break;
    case "caneblade":
      ctx.beginPath();
      ctx.moveTo(5, 8);
      ctx.lineTo(12, -94);
      ctx.quadraticCurveTo(36, -113, 47, -89);
      ctx.stroke();
      break;
    case "golfclub":
      ctx.strokeStyle = "#eee6c8";
      ctx.beginPath();
      ctx.moveTo(5, 8);
      ctx.lineTo(17, -91);
      ctx.stroke();
      ctx.fillStyle = fighter.def.accent;
      ctx.fillRect(10, -100, 43, 18);
      break;
    case "micstaff":
      ctx.fillRect(7, -99, 8, 113);
      ctx.beginPath();
      ctx.arc(11, -107, 15, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "micchucks":
      ctx.beginPath();
      ctx.moveTo(7, -10);
      ctx.lineTo(20, -55);
      ctx.moveTo(30, -66);
      ctx.lineTo(55, -99);
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(20, -55);
      ctx.lineTo(30, -66);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    ctx.globalAlpha = clamp(particle.life / particle.max, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const effect of state.effects) {
    const alpha = clamp(effect.life / 0.9, 0, 1);
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = effect.color;
    ctx.shadowBlur = 25;
    ctx.shadowColor = effect.color;
    if (effect.kind === "slash") {
      ctx.lineWidth = 18 * alpha;
      ctx.beginPath();
      ctx.moveTo(-170, 110);
      ctx.lineTo(160, -150);
      ctx.stroke();
    } else {
      const radius = (1 - alpha) * 165 + 25;
      ctx.lineWidth = 11 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function draw(time) {
  ctx.save();
  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 18 : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 12 : 0;
  ctx.translate(shakeX, shakeY);
  drawStage(time);
  if (state.screen === "fight") {
    const ordered = [...state.fighters].sort((a, b) => a.y - b.y);
    ordered.forEach((fighter) => drawFighter(fighter, time));
    drawParticles();
  }
  ctx.restore();
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,245,220,${clamp(state.flash * 3, 0, 0.9)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function loop(now) {
  const dt = Math.min(0.033, (now - state.lastTime) / 1000 || 0);
  state.lastTime = now;
  updateGame(dt);
  draw(now);
  pressed.clear();
  for (const token of [...touch]) if (token.endsWith(":pressed")) touch.delete(token);
  requestAnimationFrame(loop);
}

function musicBaseVolume() {
  return {
    title: 0.23,
    select: 0.27,
    stage: 0.28,
    fight: 0.34,
    result: 0.25,
  }[state.screen] || 0.25;
}

function syncMusic() {
  if (!state.audioUnlocked) return;
  const enabled = Boolean($("#musicToggle")?.checked);
  fightMusic.volume = clamp(musicBaseVolume() * state.musicDuck, 0, 1);
  if (!enabled || document.hidden) {
    fightMusic.pause();
    return;
  }
  if (fightMusic.paused) fightMusic.play().catch(() => {});
}

function resetMusicDuck() {
  window.clearTimeout(musicDuckTimer);
  state.musicDuck = 1;
  syncMusic();
}

function duckMusic(amount, duration) {
  window.clearTimeout(musicDuckTimer);
  state.musicDuck = amount;
  syncMusic();
  musicDuckTimer = window.setTimeout(() => {
    state.musicDuck = 1;
    syncMusic();
  }, duration);
}

function stopSfx() {
  Object.values(sfxPools).flat().forEach((sample) => {
    sample.pause();
    sample.currentTime = 0;
  });
}

function unlockAudio() {
  state.audioUnlocked = true;
  if ($("#soundToggle").checked) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !state.audio) state.audio = new AudioContextClass();
    if (state.audio?.state === "suspended") state.audio.resume();
  }
  syncMusic();
}

function sound(kind) {
  if (!$("#soundToggle").checked) return;
  unlockAudio();
  const pool = sfxPools[kind];
  if (!pool?.length) {
    proceduralSound(kind);
    return;
  }
  const cursor = sfxCursors[kind] % pool.length;
  sfxCursors[kind] = cursor + 1;
  const sample = pool[cursor];
  sample.pause();
  sample.currentTime = 0;
  sample.volume = sfxVolumes[kind] ?? 0.62;
  const playback = sample.play();
  if (playback?.catch) playback.catch(() => proceduralSound(kind));
}

function proceduralSound(kind) {
  if (!state.audio) return;
  const now = state.audio.currentTime;
  const oscillator = state.audio.createOscillator();
  const gain = state.audio.createGain();
  const settings = {
    select: [280, 430, 0.055, "square", 0.055],
    jump: [180, 340, 0.1, "sine", 0.045],
    light: [120, 70, 0.08, "square", 0.045],
    heavy: [95, 42, 0.16, "sawtooth", 0.065],
    special: [220, 55, 0.3, "sawtooth", 0.075],
    hit: [80, 35, 0.12, "square", 0.08],
    block: [520, 210, 0.08, "square", 0.04],
    finish: [160, 52, 0.8, "sawtooth", 0.09],
    final: [70, 24, 1.2, "sawtooth", 0.12],
    ko: [130, 45, 0.55, "square", 0.08],
  }[kind] || [160, 80, 0.1, "sine", 0.04];
  oscillator.type = settings[3];
  oscillator.frequency.setValueAtTime(settings[0], now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, settings[1]), now + settings[2]);
  gain.gain.setValueAtTime(settings[4], now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[2]);
  oscillator.connect(gain).connect(state.audio.destination);
  oscillator.start(now);
  oscillator.stop(now + settings[2]);
}

function back(target) {
  if (target === "title") showScreen("title");
  else if (target === "select") showScreen("select");
}

function titleKeyboard(event) {
  if (state.screen === "title" && (event.code === "Enter" || event.code === "Space")) startSelect("arcade");
  if (event.code === "Escape") {
    if (state.screen === "fight") showScreen("title");
    else if (state.screen !== "title") showScreen("title");
  }
  if (state.screen === "select" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
    event.preventDefault();
    const side = state.locks[0] ? 1 : 0;
    if (state.mode === "arcade" && state.locks[0]) return;
    const delta = event.code === "ArrowLeft" ? -1 : event.code === "ArrowRight" ? 1 : event.code === "ArrowUp" ? -4 : 4;
    state.picks[side] = (state.picks[side] + delta + roster.length) % roster.length;
    state.selectingPlayer = side;
    updateRosterUI();
  }
  if (state.screen === "select" && event.code === "Enter") chooseFighter(state.picks[state.selectingPlayer]);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
  if (!keys.has(event.code)) pressed.add(event.code);
  keys.add(event.code);
  titleKeyboard(event);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => { keys.clear(); pressed.clear(); });

window.addEventListener("gamepadconnected", (event) => {
  $("#padStatus").classList.add("connected");
  $("#padStatus").lastChild.textContent = ` ${event.gamepad.id.split("(")[0].trim().slice(0, 28)} READY`;
  sound("select");
});
window.addEventListener("gamepaddisconnected", () => {
  if (![...(navigator.getGamepads?.() || [])].filter(Boolean).length) {
    $("#padStatus").classList.remove("connected");
    $("#padStatus").lastChild.textContent = " KEYBOARD READY";
  }
});

let menuPadWasPressed = false;
function menuPadLoop() {
  const pad = getPad(0);
  const confirm = buttonValue(pad, 0) || buttonValue(pad, 9);
  if (confirm && !menuPadWasPressed) {
    if (state.screen === "title") startSelect("arcade");
    else if (state.screen === "select") {
      if (state.locks[0] && state.locks[1]) showStageSelect();
      else chooseFighter(state.picks[state.selectingPlayer]);
    } else if (state.screen === "stage") startMatch(true);
    else if (state.screen === "result") startMatch(true);
  }
  menuPadWasPressed = confirm;
  requestAnimationFrame(menuPadLoop);
}

$$('[data-mode]').forEach((button) => button.addEventListener("click", () => startSelect(button.dataset.mode)));
$("#controlsButton").addEventListener("click", () => { unlockAudio(); $("#controlsDialog").showModal(); });
$("#musicToggle").addEventListener("change", () => {
  unlockAudio();
  syncMusic();
});
$("#soundToggle").addEventListener("change", () => {
  if ($("#soundToggle").checked) unlockAudio();
  else stopSfx();
});
document.addEventListener("visibilitychange", syncMusic);
$("#fighterContinue").addEventListener("click", showStageSelect);
$$(".stage-card").forEach((card) => card.addEventListener("click", () => chooseStage(card.dataset.stage)));
$("#fightButton").addEventListener("click", () => startMatch(true));
$("#rematchButton").addEventListener("click", () => startMatch(true));
$("#reselectButton").addEventListener("click", () => startSelect(state.mode));
$$("[data-back]").forEach((button) => button.addEventListener("click", () => back(button.dataset.back)));
$("#homeLink").addEventListener("click", (event) => { event.preventDefault(); showScreen("title"); });

$$("[data-touch]").forEach((button) => {
  const action = button.dataset.touch;
  const start = (event) => {
    event.preventDefault();
    touch.add(action);
    touch.add(`${action}:pressed`);
    button.classList.add("active");
    unlockAudio();
  };
  const end = (event) => {
    event.preventDefault();
    touch.delete(action);
    button.classList.remove("active");
  };
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("pointerleave", end);
});

setupRoster();
showScreen("title");
updateStageUI();
requestAnimationFrame(loop);
requestAnimationFrame(menuPadLoop);
