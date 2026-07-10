(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const scoreNode = document.querySelector("#score");
  const highNode = document.querySelector("#high-score");
  const roundNode = document.querySelector("#round");
  const livesNode = document.querySelector("#lives");
  const muteButton = document.querySelector("#mute");
  const musicButton = document.querySelector("#music");
  const pauseButton = document.querySelector("#pause-button");
  const settingsButton = document.querySelector("#settings-button");
  const fullscreenButton = document.querySelector("#fullscreen-button");
  const titleMenu = document.querySelector("#title-menu");
  const titleStart = document.querySelector("#title-start");
  const titleOptions = document.querySelector("#title-options");
  const gameShell = document.querySelector("#game-shell");
  const stageWrap = document.querySelector("#stage-wrap");
  const topbar = document.querySelector(".topbar");
  const controls = document.querySelector(".controls");
  const crt = document.querySelector("#crt");
  const settingsPanel = document.querySelector("#settings-panel");
  const settingsForm = document.querySelector("#settings-form");
  const settingsCancel = document.querySelector("#settings-cancel");
  const settingsStart = document.querySelector("#settings-start");
  const difficultyInput = document.querySelector("#difficulty");
  const resolutionInput = document.querySelector("#resolution");
  const masterInput = document.querySelector("#master-volume");
  const musicVolumeInput = document.querySelector("#music-volume");
  const sfxVolumeInput = document.querySelector("#sfx-volume");
  const musicEnabledInput = document.querySelector("#music-enabled");
  const sfxEnabledInput = document.querySelector("#sfx-enabled");
  const scanlinesInput = document.querySelector("#scanlines-enabled");
  const shakeInput = document.querySelector("#shake-enabled");

  const W = canvas.width;
  const H = canvas.height;
  const VERSION = "v3.0.4";
  const PLAY_LEFT = 34;
  const PLAY_RIGHT = W - 34;
  const PLAY_TOP = 48;
  const PADDLE_Y = H - 48;
  const STATES = Object.freeze({
    TITLE: "title",
    PLAYING: "playing",
    PAUSED: "paused",
    LEVEL_CLEAR: "level-clear",
    GAME_OVER: "game-over"
  });

  const BRICK_COLORS = [
    "#dfecf2", "#ff4b68", "#ff982b", "#ffd83d",
    "#55df70", "#36d5d8", "#4b82ff", "#b467ff"
  ];
  const CAPSULES = ["E", "L", "C", "S", "B", "P"];
  const capsuleNames = {
    E: "EXPAND", L: "LASER", C: "CATCH",
    S: "SLOW", B: "MULTIBALL", P: "EXTRA VAUS"
  };
  const samplePaths = {
    brick: ["audio/brick-a-v304.mp3", "audio/brick-b-v304.mp3", "audio/brick-c-v304.mp3"],
    paddle: ["audio/paddle-v304.mp3"],
    wall: ["audio/wall-v304.mp3"],
    launch: ["audio/launch-v304.mp3"],
    laser: ["audio/laser-v304.mp3"],
    bonus: ["audio/bonus-v304.mp3"],
    death: ["audio/death-v304.mp3"],
    round: ["audio/round-v304.mp3"]
  };
  const MUSIC_PLAYLIST = Object.freeze([
    { src: "audio/pinball-dreams-ignition-v304.mp3", title: "Pinball Dreams · Ignition", gain: 1 },
    { src: "audio/lotus-2-title-v304.mp3", title: "Lotus Turbo Challenge 2 · Title", gain: 1 },
    { src: "audio/xenon-2-megablast-v304.mp3", title: "Xenon 2 · Megablast", gain: 1 },
    { src: "audio/jim-power-title-v304.mp3", title: "Jim Power · Title Theme", gain: 1 }
  ]);
  const LEVEL_BLUEPRINTS = Object.freeze([
    {
      name: "RAINBOW WALL",
      rows: [
        "00000000000000", "11111111111111", "33333333333333",
        "66666666666666", "77777777777777", "44444444444444"
      ]
    },
    {
      name: "CIRCUIT BREAKER",
      rows: [
        "SS..SS..SS..SS", "GG11GG11GG11GG", ".333..333..333",
        "66..SS..SS..66", ".777..777..777", "44GG44..44GG44",
        "..55..SS..55.."
      ]
    },
    {
      name: "VAUS PYRAMID",
      rows: [
        "......00......", ".....0000.....", "....666666....",
        "...666SS666...", "..666SSSS666..", ".666SSGGSS666.",
        "66666666666666"
      ]
    },
    {
      name: "IRON FORTRESS",
      rows: [
        "GGGGGGGGGGGGGG", "G111111111111G", "G1..........1G",
        "G1.SSSSSSSS.1G", "G1.S......S.1G", "G1.S.7777.S.1G",
        "G1.SSSSSSSS.1G", "G111111111111G"
      ]
    },
    {
      name: "TWIN REACTORS",
      rows: [
        ".3333....3333.", "333333..333333", "33SS33..33SS33",
        "33GG33..33GG33", ".3333....3333.", "..66..SS..66..",
        ".6666....6666."
      ]
    },
    {
      name: "DIAMOND MINE",
      rows: [
        "......44......", ".....4444.....", "....445544....",
        "...455SS554...", "..45SSGGSS54..", "...455SS554...",
        "....445544....", ".....4444.....", "......44......"
      ]
    },
    {
      name: "ALIEN SIGNAL",
      rows: [
        "..77......77..", "...77....77...", "....777777....",
        "..777S77S777..", ".777777777777.", ".77..7777..77.",
        ".....G..G.....", "....77..77...."
      ]
    },
    {
      name: "NEON CAUSEWAY",
      rows: [
        "SSSSSSSSSSSSSS", "1.2.3.4.5.6.7.", ".2.3.4.5.6.7.1",
        "22GG33GG44GG55", "..66..77..11..", "5555..SS..5555",
        "..4444444444.."
      ]
    },
    {
      name: "SPLIT CHAMBER",
      rows: [
        "111111..111111", "1SSSS1..1SSSS1", "1S..S1..1S..S1",
        "1S.GS1..1SG.S1", "1S..S1..1S..S1", "1SSSS1..1SSSS1",
        "111111..111111"
      ]
    },
    {
      name: "STORM CROWN",
      rows: [
        "G..G..GG..G..G", "GG.G.GSSG.G.GG", ".GGG666666GGG.",
        "..666SSSS666..", ".66SS7777SS66.", "666777GG777666",
        "..3333333333..", "...44444444..."
      ]
    }
  ]);
  const sampleBank = new Map();
  const sampleCursor = new Map();
  const sampleLastPlayed = new Map();
  const difficultyProfiles = Object.freeze({
    relaxed: { lives: 4, paddleWidth: 138, paddleSpeed: 780, ballSpeed: .84, capsuleChance: .25, enemyDelay: 1.3, enemySpeed: .85 },
    classic: { lives: 3, paddleWidth: 116, paddleSpeed: 720, ballSpeed: 1, capsuleChance: .18, enemyDelay: 1, enemySpeed: 1 },
    expert: { lives: 3, paddleWidth: 102, paddleSpeed: 700, ballSpeed: 1.14, capsuleChance: .13, enemyDelay: .78, enemySpeed: 1.18 }
  });
  const defaultSettings = Object.freeze({
    version: 3,
    difficulty: "classic",
    resolution: "auto",
    masterVolume: .85,
    musicVolume: .95,
    sfxVolume: .82,
    musicEnabled: true,
    sfxEnabled: true,
    scanlines: true,
    screenShake: true
  });

  let state = STATES.TITLE;
  let score = 0;
  let highScore = readHighScore();
  let round = 0;
  let lives = 3;
  let bricks = [];
  let balls = [];
  let capsules = [];
  let lasers = [];
  let particles = [];
  let drones = [];
  let lastTime = performance.now();
  let message = "";
  let messageTimer = 0;
  let stateTimer = 0;
  let shake = 0;
  let settings = readSettings();
  let muted = !settings.sfxEnabled;
  let musicEnabled = settings.musicEnabled;
  let audioContext = null;
  let musicTrack = null;
  let musicTrackIndex = 0;
  let settingsWasPlaying = false;
  let renderScale = 1;
  let enemyTimer = 7;
  let remainingBreakable = 0;
  const keys = new Set();

  const paddle = {
    x: W / 2 - 58,
    targetX: W / 2,
    y: PADDLE_Y,
    w: 116,
    h: 17,
    speed: 720,
    laserTimer: 0,
    catchTimer: 0,
    laserCooldown: 0
  };

  const stars = Array.from({ length: 110 }, (_, i) => ({
    x: pseudo(i * 3.17) * W,
    y: pseudo(i * 8.91 + 2) * H,
    r: .4 + pseudo(i * 2.33 + 9) * 1.4,
    a: .18 + pseudo(i * 1.71 + 1) * .55,
    s: 3 + pseudo(i * 5.19) * 13
  }));

  function pseudo(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function readHighScore() {
    try {
      return Number(localStorage.getItem("shatter-storm-amiga-high") || localStorage.getItem("arkanoid-recoded-high") || 0);
    } catch (_) {
      return 0;
    }
  }

  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem("shatter-storm-amiga-settings") || "{}");
      const merged = { ...defaultSettings, ...saved };
      if (saved.version !== defaultSettings.version) {
        merged.version = defaultSettings.version;
        merged.musicVolume = defaultSettings.musicVolume;
        merged.musicEnabled = defaultSettings.musicEnabled;
      }
      if (!difficultyProfiles[merged.difficulty]) merged.difficulty = "classic";
      if (!["auto", "720", "1080", "1440"].includes(merged.resolution)) merged.resolution = "auto";
      ["masterVolume", "musicVolume", "sfxVolume"].forEach(key => {
        merged[key] = Math.max(0, Math.min(1, Number(merged[key])));
      });
      return merged;
    } catch (_) {
      return { ...defaultSettings };
    }
  }

  function saveSettings() {
    try { localStorage.setItem("shatter-storm-amiga-settings", JSON.stringify(settings)); } catch (_) {}
  }

  function difficultyProfile() {
    return difficultyProfiles[settings.difficulty] || difficultyProfiles.classic;
  }

  function applyRenderResolution() {
    const scaleByMode = { "720": 1, "1080": 1.5, "1440": 2 };
    const nextScale = settings.resolution === "auto"
      ? Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      : scaleByMode[settings.resolution] || 1;
    if (renderScale === nextScale && canvas.width === Math.round(W * nextScale)) return;
    renderScale = nextScale;
    canvas.width = Math.round(W * renderScale);
    canvas.height = Math.round(H * renderScale);
  }

  function saveHighScore() {
    if (score <= highScore) return;
    highScore = score;
    try {
      localStorage.setItem("shatter-storm-amiga-high", String(highScore));
    } catch (_) {
      // Local storage can be disabled; the current-session high score still works.
    }
  }

  function formatScore(value) {
    return Math.max(0, Math.floor(value)).toString().padStart(6, "0");
  }

  function updateHud() {
    scoreNode.textContent = formatScore(score);
    highNode.textContent = formatScore(Math.max(score, highScore));
    roundNode.textContent = String(round + 1).padStart(2, "0");
    livesNode.textContent = lives > 0 ? "●".repeat(Math.min(lives, 7)) : "—";
  }

  function audio() {
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      audioContext = new AudioCtor();
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function tone(frequency, duration = .06, type = "square", volume = .035, slide = 0) {
    if (muted || settings.masterVolume <= 0 || settings.sfxVolume <= 0) return;
    const ac = audio();
    if (!ac) return;
    const oscillator = ac.createOscillator();
    const gain = ac.createGain();
    const now = ac.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, frequency + slide), now + duration
    );
    gain.gain.setValueAtTime(volume * settings.masterVolume * settings.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(ac.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  }

  function chord(notes, spacing = .065, duration = .14) {
    notes.forEach((note, index) => {
      window.setTimeout(() => tone(note, duration, "triangle", .04, note * .08), index * spacing * 1000);
    });
  }

  function primeSamples() {
    if (sampleBank.size) return;
    Object.entries(samplePaths).forEach(([name, paths]) => {
      sampleBank.set(name, paths.map(path => {
        const sound = new Audio(path);
        sound.preload = "auto";
        sound.load();
        return sound;
      }));
    });
  }

  const fallbackTones = {
    brick: () => tone(230, .05, "square", .028, 60),
    paddle: () => tone(185, .04, "triangle", .035, 45),
    wall: () => tone(120, .025, "square", .014, 8),
    launch: () => tone(540, .08, "square", .04, 170),
    laser: () => tone(790, .055, "sawtooth", .025, 260),
    bonus: () => chord([330, 494, 659], .035, .1),
    death: () => tone(160, .3, "sawtooth", .04, -105),
    round: () => chord([220, 330, 440], .055, .12)
  };

  function playSample(name, volume = .72, minimumGapMs = 0) {
    if (muted) return false;
    primeSamples();
    const pool = sampleBank.get(name);
    if (!pool?.length) return false;
    const now = performance.now();
    if (now - (sampleLastPlayed.get(name) || -Infinity) < minimumGapMs) return true;
    sampleLastPlayed.set(name, now);
    const cursor = sampleCursor.get(name) || 0;
    sampleCursor.set(name, cursor + 1);
    const sound = pool[cursor % pool.length].cloneNode(true);
    sound.volume = Math.max(0, Math.min(1, volume * settings.masterVolume * settings.sfxVolume));
    if (name === "brick") {
      sound.preservesPitch = false;
      sound.playbackRate = .94 + Math.random() * .12;
    }
    sound.play().catch(() => { fallbackTones[name]?.(); });
    return true;
  }

  function musicVolumeFor(trackInfo = MUSIC_PLAYLIST[musicTrackIndex]) {
    return Math.max(0, Math.min(1,
      settings.masterVolume * settings.musicVolume * (trackInfo?.gain || 1)
    ));
  }

  function ensureMusicTrack() {
    const trackInfo = MUSIC_PLAYLIST[musicTrackIndex];
    if (!musicTrack) {
      musicTrack = new Audio();
      musicTrack.preload = "auto";
      musicTrack.addEventListener("ended", () => {
        musicTrackIndex = (musicTrackIndex + 1) % MUSIC_PLAYLIST.length;
        startMusic();
      });
    }
    if (musicTrack.dataset.src !== trackInfo.src) {
      musicTrack.dataset.src = trackInfo.src;
      musicTrack.src = trackInfo.src;
      musicTrack.volume = musicVolumeFor(trackInfo);
      musicButton.title = `Now playing: ${trackInfo.title}`;
      musicButton.setAttribute("aria-label", `Toggle music. Now playing ${trackInfo.title}`);
    }
    return musicTrack;
  }

  function startMusic() {
    if (!musicEnabled || (state !== STATES.PLAYING && state !== STATES.LEVEL_CLEAR)) return;
    const track = ensureMusicTrack();
    track.volume = musicVolumeFor();
    track.play().catch(() => {});
  }

  function stopMusic() {
    if (!musicTrack) return;
    musicTrack.pause();
  }

  function makeLevel(levelIndex) {
    const cols = 14;
    const gap = 5;
    const marginX = 57;
    const top = 92;
    const brickW = (W - marginX * 2 - gap * (cols - 1)) / cols;
    const brickH = 23;
    const blueprint = LEVEL_BLUEPRINTS[levelIndex % LEVEL_BLUEPRINTS.length];
    const cycle = Math.floor(levelIndex / LEVEL_BLUEPRINTS.length);
    const levelBricks = [];
    remainingBreakable = 0;

    for (let row = 0; row < blueprint.rows.length; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const symbol = blueprint.rows[row][col] || ".";
        if (symbol === ".") continue;
        const gold = symbol === "G";
        const silver = symbol === "S";
        let hp = silver ? 2 : 1;
        if (!gold && cycle > 0 && (row * 5 + col * 3 + levelIndex) % 11 < Math.min(cycle, 3)) hp += 1;
        const colorIndex = gold ? 3 : silver ? 0 : Number(symbol);
        levelBricks.push({
          x: marginX + col * (brickW + gap),
          y: top + row * (brickH + gap),
          w: brickW,
          h: brickH,
          colorIndex,
          hp: gold ? Infinity : hp,
          maxHp: gold ? Infinity : hp,
          gold,
          alive: true,
          flash: 0
        });
        if (!gold) remainingBreakable += 1;
      }
    }
    return levelBricks;
  }

  function levelName(levelIndex) {
    return LEVEL_BLUEPRINTS[levelIndex % LEVEL_BLUEPRINTS.length].name;
  }

  function startGame() {
    const profile = difficultyProfile();
    titleMenu.hidden = true;
    score = 0;
    round = 0;
    lives = profile.lives;
    particles = [];
    capsules = [];
    lasers = [];
    drones = [];
    paddle.w = profile.paddleWidth;
    paddle.speed = profile.paddleSpeed;
    paddle.laserTimer = 0;
    paddle.catchTimer = 0;
    startRound();
    startMusic();
  }

  function startRound() {
    state = STATES.PLAYING;
    stateTimer = 0;
    bricks = makeLevel(round);
    capsules = [];
    lasers = [];
    drones = [];
    enemyTimer = Math.max(4, 8 - round * .25) * difficultyProfile().enemyDelay;
    paddle.x = W / 2 - paddle.w / 2;
    paddle.targetX = W / 2;
    paddle.laserTimer = 0;
    paddle.catchTimer = 0;
    balls = [];
    serveBall();
    setMessage(`ROUND ${round + 1} · ${levelName(round)}`, 1.55);
    if (!playSample("round", .58, 500)) chord([220, 330, 440], .055, .12);
    updateHud();
  }

  function serveBall(offset = 0) {
    balls.push({
      x: paddle.x + paddle.w / 2 + offset,
      y: paddle.y - 11,
      vx: 215 * (Math.random() < .5 ? -1 : 1),
      vy: -390,
      r: 7,
      stuck: true,
      stickOffset: offset,
      trail: []
    });
  }

  function releaseBalls() {
    let released = false;
    balls.forEach(ball => {
      if (!ball.stuck) return;
      ball.stuck = false;
      const speed = (430 + Math.min(round * 15, 105)) * difficultyProfile().ballSpeed;
      const angle = (Math.random() * .46 - .23);
      ball.vx = Math.sin(angle) * speed;
      ball.vy = -Math.cos(angle) * speed;
      released = true;
    });
    if (released && !playSample("launch", .64, 100)) tone(540, .08, "square", .04, 170);
    return released;
  }

  function primaryAction() {
    if (!settingsPanel.hidden) return;
    audio();
    primeSamples();
    if (state === STATES.TITLE || state === STATES.GAME_OVER) {
      startGame();
      return;
    }
    if (state === STATES.PAUSED) {
      state = STATES.PLAYING;
      lastTime = performance.now();
      startMusic();
      return;
    }
    if (state !== STATES.PLAYING) return;
    if (!releaseBalls() && paddle.laserTimer > 0) fireLasers();
  }

  function fireLasers() {
    if (paddle.laserCooldown > 0) return;
    lasers.push(
      { x: paddle.x + 13, y: paddle.y - 5, vy: -720 },
      { x: paddle.x + paddle.w - 13, y: paddle.y - 5, vy: -720 }
    );
    paddle.laserCooldown = .22;
    if (!playSample("laser", .48, 130)) tone(790, .055, "sawtooth", .025, 260);
  }

  function setMessage(text, duration = 1.1) {
    message = text;
    messageTimer = duration;
  }

  function addScore(points) {
    score += points;
    saveHighScore();
    updateHud();
  }

  function circleRect(ball, rect) {
    const closestX = Math.max(rect.x, Math.min(ball.x, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(ball.y, rect.y + rect.h));
    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    return dx * dx + dy * dy <= ball.r * ball.r;
  }

  function hitBrick(brick, sourceX, sourceY) {
    if (!brick.alive) return;
    brick.flash = .12;
    if (brick.gold) {
      if (!playSample("wall", .52, 65)) tone(145, .05, "square", .022, -25);
      spark(sourceX, sourceY, "#ffd76a", 5);
      return;
    }
    brick.hp -= 1;
    if (brick.hp > 0) {
      addScore(20);
      if (!playSample("brick", .6, 42)) tone(210, .045, "square", .025, 35);
      spark(sourceX, sourceY, "#f2fbff", 6);
      return;
    }

    brick.alive = false;
    remainingBreakable -= 1;
    const points = 50 + brick.colorIndex * 10 + round * 5;
    addScore(points);
    if (!playSample("brick", .68, 42)) tone(250 + brick.colorIndex * 36, .055, "square", .032, 80);
    burst(brick.x + brick.w / 2, brick.y + brick.h / 2, BRICK_COLORS[brick.colorIndex], 14);
    if (Math.random() < difficultyProfile().capsuleChance) spawnCapsule(brick);

    if (remainingBreakable <= 0) completeRound();
  }

  function spawnCapsule(brick) {
    const weighted = round === 0 ? ["E", "S", "B", "P", "C", "E"] : CAPSULES;
    const type = weighted[Math.floor(Math.random() * weighted.length)];
    capsules.push({
      x: brick.x + brick.w / 2,
      y: brick.y + brick.h / 2,
      vy: 125,
      type,
      angle: 0
    });
  }

  function applyCapsule(type) {
    addScore(250);
    setMessage(capsuleNames[type], 1.05);
    if (!playSample("bonus", .66, 120)) chord([330, 494, 659], .035, .1);

    if (type === "E") {
      const center = paddle.x + paddle.w / 2;
      paddle.w = Math.min(196, paddle.w + 38);
      paddle.x = center - paddle.w / 2;
    }
    if (type === "L") paddle.laserTimer = 16;
    if (type === "C") paddle.catchTimer = 16;
    if (type === "S") {
      balls.forEach(ball => {
        if (ball.stuck) return;
        const speed = Math.hypot(ball.vx, ball.vy);
        const scale = Math.max(300, speed * .72) / speed;
        ball.vx *= scale;
        ball.vy *= scale;
      });
    }
    if (type === "B") multiball();
    if (type === "P") {
      lives = Math.min(7, lives + 1);
      updateHud();
    }
  }

  function multiball() {
    const source = balls.find(ball => !ball.stuck) || balls[0];
    if (!source) return;
    const speed = Math.max(390 * difficultyProfile().ballSpeed, Math.hypot(source.vx, source.vy));
    const base = Math.atan2(source.vy, source.vx);
    [-.42, .42].forEach(delta => {
      balls.push({
        x: source.x,
        y: source.y,
        vx: Math.cos(base + delta) * speed,
        vy: Math.sin(base + delta) * speed,
        r: source.r,
        stuck: false,
        stickOffset: 0,
        trail: []
      });
    });
  }

  function loseBall() {
    if (balls.length > 0 || state !== STATES.PLAYING) return;
    lives -= 1;
    updateHud();
    paddle.w = Math.max(100, paddle.w - 18);
    paddle.laserTimer = 0;
    paddle.catchTimer = 0;
    capsules = [];
    lasers = [];
    if (!playSample("death", .76, 250)) tone(160, .42, "sawtooth", .045, -105);

    if (lives <= 0) {
      state = STATES.GAME_OVER;
      stateTimer = 0;
      stopMusic();
      saveHighScore();
      window.setTimeout(() => chord([330, 262, 196, 147], .12, .24), 620);
      return;
    }
    window.setTimeout(() => {
      if (state === STATES.PLAYING && balls.length === 0) serveBall();
    }, 700);
    setMessage("READY", 1.1);
  }

  function completeRound() {
    if (state !== STATES.PLAYING) return;
    state = STATES.LEVEL_CLEAR;
    stateTimer = 2.3;
    addScore(1000 + lives * 250);
    capsules = [];
    lasers = [];
    drones = [];
    if (!playSample("round", .76, 250)) chord([262, 330, 392, 523, 659], .08, .2);
  }

  function update(dt) {
    stars.forEach(star => {
      star.y += star.s * dt;
      if (star.y > H) star.y -= H;
    });
    updateParticles(dt);
    messageTimer = Math.max(0, messageTimer - dt);
    shake = Math.max(0, shake - dt * 22);

    if (state === STATES.PAUSED || state === STATES.TITLE || state === STATES.GAME_OVER) return;
    if (state === STATES.LEVEL_CLEAR) {
      stateTimer -= dt;
      if (stateTimer <= 0) {
        round += 1;
        startRound();
      }
      return;
    }

    updatePaddle(dt);
    updateBalls(dt);
    updateCapsules(dt);
    updateLasers(dt);
    updateDrones(dt);
    bricks.forEach(brick => { brick.flash = Math.max(0, brick.flash - dt); });
    paddle.laserTimer = Math.max(0, paddle.laserTimer - dt);
    paddle.catchTimer = Math.max(0, paddle.catchTimer - dt);
    paddle.laserCooldown = Math.max(0, paddle.laserCooldown - dt);
  }

  function updatePaddle(dt) {
    let keyboardDirection = 0;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) keyboardDirection -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) keyboardDirection += 1;
    if (keyboardDirection !== 0) {
      paddle.x += keyboardDirection * paddle.speed * dt;
      paddle.targetX = paddle.x + paddle.w / 2;
    } else {
      const desired = paddle.targetX - paddle.w / 2;
      const distance = desired - paddle.x;
      paddle.x += Math.sign(distance) * Math.min(Math.abs(distance), paddle.speed * 1.35 * dt);
    }
    paddle.x = Math.max(PLAY_LEFT + 7, Math.min(PLAY_RIGHT - paddle.w - 7, paddle.x));
  }

  function updateBalls(dt) {
    const dead = [];

    balls.forEach((ball, ballIndex) => {
      if (ball.stuck) {
        ball.x = Math.max(paddle.x + ball.r, Math.min(paddle.x + paddle.w - ball.r, paddle.x + paddle.w / 2 + ball.stickOffset));
        ball.y = paddle.y - ball.r - 2;
        return;
      }

      ball.trail.unshift({ x: ball.x, y: ball.y });
      if (ball.trail.length > 7) ball.trail.pop();

      const speed = Math.hypot(ball.vx, ball.vy);
      const steps = Math.max(1, Math.ceil(speed * dt / 6));
      const step = dt / steps;

      for (let i = 0; i < steps; i += 1) {
        const previousX = ball.x;
        const previousY = ball.y;
        ball.x += ball.vx * step;
        ball.y += ball.vy * step;

        if (ball.x - ball.r < PLAY_LEFT) {
          ball.x = PLAY_LEFT + ball.r;
          ball.vx = Math.abs(ball.vx);
          if (!playSample("wall", .4, 70)) tone(118, .02, "square", .012, 5);
        } else if (ball.x + ball.r > PLAY_RIGHT) {
          ball.x = PLAY_RIGHT - ball.r;
          ball.vx = -Math.abs(ball.vx);
          if (!playSample("wall", .4, 70)) tone(118, .02, "square", .012, 5);
        }
        if (ball.y - ball.r < PLAY_TOP) {
          ball.y = PLAY_TOP + ball.r;
          ball.vy = Math.abs(ball.vy);
          if (!playSample("wall", .42, 70)) tone(128, .025, "square", .014, 8);
        }

        if (ball.vy > 0 && previousY + ball.r <= paddle.y + 3 && circleRect(ball, paddle)) {
          ball.y = paddle.y - ball.r - 1;
          const relative = Math.max(-1, Math.min(1, (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2)));
          const speedFactor = difficultyProfile().ballSpeed;
          const newSpeed = Math.min(690 * speedFactor, Math.max(420 * speedFactor, Math.hypot(ball.vx, ball.vy) * 1.008));
          const angle = relative * 1.08;
          ball.vx = Math.sin(angle) * newSpeed;
          ball.vy = -Math.abs(Math.cos(angle) * newSpeed);
          if (Math.abs(ball.vx) < 65) ball.vx = 65 * (relative < 0 ? -1 : 1);
          if (!playSample("paddle", .62, 55)) tone(185, .04, "triangle", .035, 45);
          spark(ball.x, ball.y, "#8deaff", 5);

          if (paddle.catchTimer > 0) {
            ball.stuck = true;
            ball.stickOffset = ball.x - (paddle.x + paddle.w / 2);
          }
          continue;
        }

        let struck = false;
        for (const brick of bricks) {
          if (!brick.alive || !circleRect(ball, brick)) continue;
          const wasHorizontal = previousX + ball.r <= brick.x || previousX - ball.r >= brick.x + brick.w;
          const wasVertical = previousY + ball.r <= brick.y || previousY - ball.r >= brick.y + brick.h;
          if (wasHorizontal && !wasVertical) ball.vx *= -1;
          else if (wasVertical && !wasHorizontal) ball.vy *= -1;
          else {
            const dx = Math.min(Math.abs(ball.x - brick.x), Math.abs(ball.x - (brick.x + brick.w)));
            const dy = Math.min(Math.abs(ball.y - brick.y), Math.abs(ball.y - (brick.y + brick.h)));
            if (dx < dy) ball.vx *= -1;
            else ball.vy *= -1;
          }
          ball.x = previousX;
          ball.y = previousY;
          hitBrick(brick, ball.x, ball.y);
          struck = true;
          break;
        }
        if (struck || state !== STATES.PLAYING) break;

        for (let d = drones.length - 1; d >= 0; d -= 1) {
          const drone = drones[d];
          const dx = ball.x - drone.x;
          const dy = ball.y - drone.y;
          if (dx * dx + dy * dy > (ball.r + drone.r) ** 2) continue;
          const magnitude = Math.max(1, Math.hypot(dx, dy));
          const nx = dx / magnitude;
          const ny = dy / magnitude;
          const dot = ball.vx * nx + ball.vy * ny;
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;
          destroyDrone(d, drone);
          break;
        }

        if (ball.y - ball.r > H) {
          dead.push(ballIndex);
          break;
        }
      }
    });

    [...new Set(dead)].sort((a, b) => b - a).forEach(index => balls.splice(index, 1));
    if (dead.length > 0) loseBall();
  }

  function updateCapsules(dt) {
    for (let i = capsules.length - 1; i >= 0; i -= 1) {
      const capsule = capsules[i];
      capsule.y += capsule.vy * dt;
      capsule.angle += dt * 3.5;
      const rect = { x: capsule.x - 21, y: capsule.y - 9, w: 42, h: 18 };
      if (rect.y + rect.h >= paddle.y && rect.y <= paddle.y + paddle.h &&
          rect.x + rect.w >= paddle.x && rect.x <= paddle.x + paddle.w) {
        applyCapsule(capsule.type);
        capsules.splice(i, 1);
      } else if (capsule.y > H + 25) {
        capsules.splice(i, 1);
      }
    }
  }

  function updateLasers(dt) {
    for (let i = lasers.length - 1; i >= 0; i -= 1) {
      const laser = lasers[i];
      laser.y += laser.vy * dt;
      let removed = laser.y < PLAY_TOP;

      if (!removed) {
        for (const brick of bricks) {
          if (!brick.alive || laser.x < brick.x || laser.x > brick.x + brick.w ||
              laser.y > brick.y + brick.h || laser.y + 18 < brick.y) continue;
          hitBrick(brick, laser.x, laser.y);
          removed = true;
          break;
        }
      }
      if (!removed) {
        for (let d = drones.length - 1; d >= 0; d -= 1) {
          const drone = drones[d];
          if (Math.abs(laser.x - drone.x) < drone.r && Math.abs(laser.y - drone.y) < drone.r + 10) {
            destroyDrone(d, drone);
            removed = true;
            break;
          }
        }
      }
      if (removed) lasers.splice(i, 1);
    }
  }

  function updateDrones(dt) {
    enemyTimer -= dt;
    if (enemyTimer <= 0 && drones.length < 3 && remainingBreakable > 5) {
      const fromLeft = Math.random() < .5;
      drones.push({
        x: fromLeft ? PLAY_LEFT + 22 : PLAY_RIGHT - 22,
        y: 78,
        vx: (fromLeft ? 62 : -62) * difficultyProfile().enemySpeed,
        vy: (54 + Math.random() * 28) * difficultyProfile().enemySpeed,
        r: 14,
        spin: 0
      });
      enemyTimer = (Math.max(4, 8.5 - round * .3) + Math.random() * 3) * difficultyProfile().enemyDelay;
    }

    drones.forEach(drone => {
      drone.x += drone.vx * dt;
      drone.y += drone.vy * dt;
      drone.spin += dt * 2.8;
      if (drone.x - drone.r < PLAY_LEFT || drone.x + drone.r > PLAY_RIGHT) drone.vx *= -1;
      if (drone.y < 74 || drone.y > PADDLE_Y - 95) drone.vy *= -1;
    });
  }

  function destroyDrone(index, drone) {
    addScore(200);
    burst(drone.x, drone.y, "#df7dff", 18);
    if (!playSample("death", .42, 100)) tone(110, .12, "sawtooth", .03, 210);
    drones.splice(index, 1);
  }

  function spark(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 55 + Math.random() * 120;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .3 + Math.random() * .25, max: .55, color, size: 1 + Math.random() * 2 });
    }
  }

  function burst(x, y, color, count) {
    if (settings.screenShake) shake = Math.max(shake, 2.4);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 65 + Math.random() * 210;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + Math.random() * .55, max: .9, color, size: 1.3 + Math.random() * 3.2 });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 70 * dt;
      particle.vx *= Math.pow(.25, dt);
      particle.life -= dt;
      if (particle.life <= 0) particles.splice(i, 1);
    }
  }

  function draw() {
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    drawBackground();
    drawArena();
    drawBricks();
    drawDrones();
    drawCapsules();
    drawLasers();
    drawPaddle();
    drawBalls();
    drawParticles();
    drawOverlay();
    ctx.restore();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#081129");
    gradient.addColorStop(.46, "#030817");
    gradient.addColorStop(1, "#01030a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    stars.forEach(star => {
      ctx.globalAlpha = star.a;
      ctx.fillStyle = star.r > 1.25 ? "#8edbff" : "#daeaff";
      ctx.fillRect(star.x, star.y, star.r, star.r);
    });
    ctx.restore();

    ctx.strokeStyle = "rgba(45, 98, 164, .10)";
    ctx.lineWidth = 1;
    for (let x = PLAY_LEFT; x <= PLAY_RIGHT; x += 48) {
      ctx.beginPath(); ctx.moveTo(x, PLAY_TOP); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = PLAY_TOP; y <= H; y += 48) {
      ctx.beginPath(); ctx.moveTo(PLAY_LEFT, y); ctx.lineTo(PLAY_RIGHT, y); ctx.stroke();
    }
  }

  function drawArena() {
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#3a9eff";
    const wall = ctx.createLinearGradient(PLAY_LEFT - 12, 0, PLAY_LEFT + 8, 0);
    wall.addColorStop(0, "#1b3b6b");
    wall.addColorStop(.45, "#d4f5ff");
    wall.addColorStop(.65, "#3a83b8");
    wall.addColorStop(1, "#0b2546");
    ctx.fillStyle = wall;
    ctx.fillRect(PLAY_LEFT - 11, PLAY_TOP - 10, 10, H - PLAY_TOP + 10);
    ctx.fillRect(PLAY_RIGHT + 1, PLAY_TOP - 10, 10, H - PLAY_TOP + 10);
    const top = ctx.createLinearGradient(0, PLAY_TOP - 11, 0, PLAY_TOP + 1);
    top.addColorStop(0, "#1b3b6b");
    top.addColorStop(.5, "#d4f5ff");
    top.addColorStop(1, "#225b8b");
    ctx.fillStyle = top;
    ctx.fillRect(PLAY_LEFT - 11, PLAY_TOP - 11, PLAY_RIGHT - PLAY_LEFT + 22, 10);
    ctx.restore();
  }

  function drawBricks() {
    bricks.forEach(brick => {
      if (!brick.alive) return;
      const base = brick.gold ? "#d7a51e" : BRICK_COLORS[brick.colorIndex];
      const gradient = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.h);
      gradient.addColorStop(0, brick.flash > 0 ? "#ffffff" : lighten(base, 28));
      gradient.addColorStop(.28, base);
      gradient.addColorStop(1, darken(base, 38));
      ctx.save();
      ctx.shadowBlur = 7;
      ctx.shadowColor = base;
      ctx.fillStyle = gradient;
      roundRect(ctx, brick.x, brick.y, brick.w, brick.h, 3);
      ctx.fill();
      ctx.strokeStyle = brick.gold ? "#fff0a1" : "rgba(235,250,255,.72)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.24)";
      ctx.fillRect(brick.x + 4, brick.y + 3, brick.w - 8, 2);
      if (brick.gold) {
        ctx.fillStyle = "rgba(75,42,0,.55)";
        for (let x = brick.x + 8; x < brick.x + brick.w - 3; x += 11) {
          ctx.fillRect(x, brick.y + brick.h / 2 - 1, 5, 2);
        }
      } else if (brick.maxHp > 1 && brick.hp === brick.maxHp) {
        ctx.strokeStyle = "rgba(255,255,255,.68)";
        ctx.beginPath();
        ctx.moveTo(brick.x + brick.w * .25, brick.y + 4);
        ctx.lineTo(brick.x + brick.w * .62, brick.y + brick.h - 4);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawPaddle() {
    const activeColor = paddle.laserTimer > 0 ? "#ff526d" : paddle.catchTimer > 0 ? "#71f7a5" : "#70dfff";
    const gradient = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(.28, activeColor);
    gradient.addColorStop(.62, "#2877a7");
    gradient.addColorStop(1, "#092641");
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = activeColor;
    ctx.fillStyle = gradient;
    roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 8);
    ctx.fill();
    ctx.strokeStyle = "#e8fbff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = activeColor;
    ctx.fillRect(paddle.x + 10, paddle.y + 5, 7, 8);
    ctx.fillRect(paddle.x + paddle.w - 17, paddle.y + 5, 7, 8);
    if (paddle.laserTimer > 0) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(paddle.x + 10, paddle.y - 5, 5, 7);
      ctx.fillRect(paddle.x + paddle.w - 15, paddle.y - 5, 5, 7);
    }
    ctx.restore();
  }

  function drawBalls() {
    balls.forEach(ball => {
      ball.trail.forEach((point, index) => {
        ctx.globalAlpha = .15 * (1 - index / ball.trail.length);
        ctx.fillStyle = "#7bdcff";
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(1, ball.r - index * .65), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      const gradient = ctx.createRadialGradient(ball.x - 2, ball.y - 3, 1, ball.x, ball.y, ball.r + 1);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(.4, "#d6f8ff");
      gradient.addColorStop(1, "#4294c6");
      ctx.save();
      ctx.shadowBlur = 13;
      ctx.shadowColor = "#87eaff";
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawCapsules() {
    capsules.forEach(capsule => {
      const pulse = .78 + Math.sin(capsule.angle) * .18;
      ctx.save();
      ctx.translate(capsule.x, capsule.y);
      ctx.scale(1, pulse);
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#f65cff";
      const gradient = ctx.createLinearGradient(-21, 0, 21, 0);
      gradient.addColorStop(0, "#522277");
      gradient.addColorStop(.48, "#f177ff");
      gradient.addColorStop(1, "#431e71");
      ctx.fillStyle = gradient;
      roundRect(ctx, -22, -9, 44, 18, 9);
      ctx.fill();
      ctx.strokeStyle = "#ffd9ff";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(capsule.type, 0, 1);
      ctx.restore();
    });
  }

  function drawLasers() {
    ctx.save();
    ctx.lineCap = "round";
    lasers.forEach(laser => {
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#ff315d";
      ctx.strokeStyle = "#ffecf0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(laser.x, laser.y);
      ctx.lineTo(laser.x, laser.y + 17);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawDrones() {
    drones.forEach(drone => {
      ctx.save();
      ctx.translate(drone.x, drone.y);
      ctx.rotate(drone.spin);
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#c870ff";
      ctx.fillStyle = "#33195c";
      ctx.strokeStyle = "#e49bff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const angle = Math.PI * 2 * i / 8;
        const radius = i % 2 ? drone.r * .66 : drone.r;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d6eeff";
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    });
  }

  function drawParticles() {
    ctx.save();
    particles.forEach(particle => {
      ctx.globalAlpha = Math.max(0, particle.life / particle.max);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    });
    ctx.restore();
  }

  function drawOverlay() {
    if (messageTimer > 0 && state === STATES.PLAYING) {
      const alpha = Math.min(1, messageTimer * 2.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "bold 30px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#49d8ff";
      ctx.fillText(message, W / 2, H * .56);
      ctx.restore();
    }

    if (state === STATES.TITLE) {
      shade();
      logo("SHATTER", "STORM · AMIGA EDITION");
      centered("A 68000-ERA BRICK-BREAKING STORM", 374, 17, "#7bb5d9");
      centered("REAL AMIGA MUSIC · GENUINE PAULA SFX · 10 HANDCRAFTED ROUNDS", 410, 15, "#ff8db0");
      centered(VERSION, 442, 13, "#6589a5");
      centered("SELECT START GAME OR OPTIONS", 490, 20, "#e9fbff", true);
      centered("Break every colored block. Gold blocks are indestructible.", 548, 15, "#83a2bb");
      centered("Catch falling capsules for expansion, lasers, multiball and more.", 574, 15, "#83a2bb");
    } else if (state === STATES.PAUSED) {
      shade(.64);
      centered("PAUSED", H / 2 - 15, 42, "#fff", true);
      centered("PRESS P OR SPACE TO CONTINUE", H / 2 + 36, 17, "#8bc9e9");
    } else if (state === STATES.LEVEL_CLEAR) {
      shade(.48);
      centered("ROUND CLEAR", H / 2 - 10, 42, "#fff7b2", true);
      centered(`BONUS ${formatScore(1000 + lives * 250)}`, H / 2 + 42, 19, "#9fe9ff");
    } else if (state === STATES.GAME_OVER) {
      shade(.7);
      centered("GAME OVER", H / 2 - 75, 48, "#ff657e", true);
      centered(`SCORE ${formatScore(score)}`, H / 2 - 17, 23, "#fff");
      centered(`HIGH  ${formatScore(highScore)}`, H / 2 + 20, 18, "#7cdcff");
      centered("CLICK / TAP OR PRESS SPACE TO TRY AGAIN", H / 2 + 92, 18, "#e7f9ff", true);
    }
  }

  function shade(alpha = .58) {
    ctx.fillStyle = `rgba(1, 4, 13, ${alpha})`;
    ctx.fillRect(PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, H - PLAY_TOP);
  }

  function logo(main, sub) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "900 86px sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#c5f5ff";
    ctx.shadowBlur = 25;
    ctx.shadowColor = "#1aa8ff";
    const gradient = ctx.createLinearGradient(0, 180, 0, 280);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(.42, "#54d8ff");
    gradient.addColorStop(1, "#2358a6");
    ctx.fillStyle = gradient;
    ctx.strokeText(main, W / 2, 270);
    ctx.fillText(main, W / 2, 270);
    ctx.font = "bold 28px monospace";
    ctx.fillStyle = "#ff5c81";
    ctx.strokeStyle = "#4e0d24";
    ctx.lineWidth = 6;
    ctx.strokeText(sub, W / 2, 323);
    ctx.fillText(sub, W / 2, 323);
    ctx.restore();
  }

  function centered(text, y, size, color, glow = false) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `bold ${size}px monospace`;
    ctx.fillStyle = color;
    if (glow) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
    }
    ctx.fillText(text, W / 2, y);
    ctx.restore();
  }

  function lighten(hex, amount) { return shiftColor(hex, amount); }
  function darken(hex, amount) { return shiftColor(hex, -amount); }

  function shiftColor(hex, amount) {
    const value = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (value >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (value & 255) + amount));
    return `rgb(${r},${g},${b})`;
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * W / rect.width,
      y: (event.clientY - rect.top) * H / rect.height
    };
  }

  function movePointer(event) {
    const point = pointerPosition(event);
    paddle.targetX = point.x;
  }

  let activePointerId = null;
  canvas.addEventListener("pointermove", event => {
    if (event.pointerType === "mouse" || event.pointerId === activePointerId) movePointer(event);
  });
  canvas.addEventListener("pointerdown", event => {
    event.preventDefault();
    activePointerId = event.pointerId;
    try { canvas.setPointerCapture?.(event.pointerId); } catch (_) {}
    movePointer(event);
    primaryAction();
  });
  const releasePointer = event => {
    if (event.pointerId !== activePointerId) return;
    try {
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } catch (_) {}
    activePointerId = null;
  };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);

  function togglePause() {
    if (!settingsPanel.hidden) return;
    if (state === STATES.TITLE || state === STATES.GAME_OVER || state === STATES.LEVEL_CLEAR) return;
    state = state === STATES.PAUSED ? STATES.PLAYING : STATES.PAUSED;
    if (state === STATES.PAUSED) stopMusic(); else startMusic();
    lastTime = performance.now();
  }

  window.addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "Space" || event.code === "Enter") primaryAction();
    if (event.code === "KeyP") togglePause();
    if (event.code === "KeyF") toggleFullscreen();
    if (event.code === "KeyM") toggleMute();
  });
  window.addEventListener("keyup", event => keys.delete(event.code));
  window.addEventListener("blur", () => {
    keys.clear();
    if (state === STATES.PLAYING) {
      state = STATES.PAUSED;
      stopMusic();
    }
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const request = gameShell.requestFullscreen?.();
      request?.catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }

  function fitFullscreenStage() {
    if (document.fullscreenElement !== gameShell) {
      stageWrap.style.removeProperty("width");
      stageWrap.style.removeProperty("height");
      fullscreenButton.textContent = "FULLSCREEN";
      return;
    }
    const shellStyle = getComputedStyle(gameShell);
    const horizontalPadding = parseFloat(shellStyle.paddingLeft) + parseFloat(shellStyle.paddingRight);
    const verticalPadding = parseFloat(shellStyle.paddingTop) + parseFloat(shellStyle.paddingBottom);
    const rowGap = parseFloat(shellStyle.rowGap) || 0;
    const availableWidth = Math.max(1, gameShell.clientWidth - horizontalPadding);
    const availableHeight = Math.max(1, gameShell.clientHeight - verticalPadding - topbar.offsetHeight - controls.offsetHeight - rowGap * 2);
    const scale = Math.min(availableWidth / W, availableHeight / H);
    stageWrap.style.width = `${Math.floor(W * scale)}px`;
    stageWrap.style.height = `${Math.floor(H * scale)}px`;
    fullscreenButton.textContent = "EXIT FULLSCREEN";
  }

  function updateVolumeLabels() {
    document.querySelector("#master-value").textContent = `${masterInput.value}%`;
    document.querySelector("#music-value").textContent = `${musicVolumeInput.value}%`;
    document.querySelector("#sfx-value").textContent = `${sfxVolumeInput.value}%`;
  }

  function syncSettingsForm() {
    difficultyInput.value = settings.difficulty;
    resolutionInput.value = settings.resolution;
    masterInput.value = Math.round(settings.masterVolume * 100);
    musicVolumeInput.value = Math.round(settings.musicVolume * 100);
    sfxVolumeInput.value = Math.round(settings.sfxVolume * 100);
    musicEnabledInput.checked = settings.musicEnabled;
    sfxEnabledInput.checked = settings.sfxEnabled;
    scanlinesInput.checked = settings.scanlines;
    shakeInput.checked = settings.screenShake;
    updateVolumeLabels();
  }

  function applySettingsFromForm() {
    settings = {
      version: defaultSettings.version,
      difficulty: difficultyInput.value,
      resolution: resolutionInput.value,
      masterVolume: Number(masterInput.value) / 100,
      musicVolume: Number(musicVolumeInput.value) / 100,
      sfxVolume: Number(sfxVolumeInput.value) / 100,
      musicEnabled: musicEnabledInput.checked,
      sfxEnabled: sfxEnabledInput.checked,
      scanlines: scanlinesInput.checked,
      screenShake: shakeInput.checked
    };
    muted = !settings.sfxEnabled;
    musicEnabled = settings.musicEnabled;
    applyRenderResolution();
    crt.classList.toggle("crt-off", !settings.scanlines);
    muteButton.textContent = muted ? "SOUND OFF" : "SOUND ON";
    musicButton.textContent = musicEnabled ? "MUSIC ON" : "MUSIC OFF";
    saveSettings();
    if (musicEnabled) startMusic(); else stopMusic();
  }

  function openSettings() {
    if (!settingsPanel.hidden) return;
    settingsWasPlaying = state === STATES.PLAYING;
    if (settingsWasPlaying) state = STATES.PAUSED;
    stopMusic();
    syncSettingsForm();
    titleMenu.hidden = true;
    settingsStart.textContent = settingsWasPlaying ? "SAVE & RESUME" : "SAVE SETTINGS";
    settingsPanel.hidden = false;
    settingsStart.focus({ preventScroll: true });
  }

  function closeSettings(resume) {
    settingsPanel.hidden = true;
    if (resume && settingsWasPlaying) state = STATES.PLAYING;
    titleMenu.hidden = state !== STATES.TITLE;
    lastTime = performance.now();
    if (state === STATES.PLAYING || state === STATES.LEVEL_CLEAR) startMusic();
  }

  function toggleMute() {
    muted = !muted;
    settings.sfxEnabled = !muted;
    muteButton.textContent = muted ? "SOUND OFF" : "SOUND ON";
    saveSettings();
  }

  function toggleMusic() {
    musicEnabled = !musicEnabled;
    settings.musicEnabled = musicEnabled;
    musicButton.textContent = musicEnabled ? "MUSIC ON" : "MUSIC OFF";
    saveSettings();
    if (musicEnabled) startMusic(); else stopMusic();
  }

  muteButton.addEventListener("click", toggleMute);
  musicButton.addEventListener("click", toggleMusic);
  pauseButton.addEventListener("click", togglePause);
  settingsButton.addEventListener("click", openSettings);
  fullscreenButton.addEventListener("click", toggleFullscreen);
  titleStart.addEventListener("click", () => {
    audio();
    primeSamples();
    startGame();
  });
  titleOptions.addEventListener("click", openSettings);
  settingsForm.addEventListener("submit", event => {
    event.preventDefault();
    applySettingsFromForm();
    closeSettings(true);
  });
  settingsCancel.addEventListener("click", () => {
    syncSettingsForm();
    closeSettings(true);
  });
  [masterInput, musicVolumeInput, sfxVolumeInput].forEach(input => input.addEventListener("input", updateVolumeLabels));
  document.addEventListener("fullscreenchange", () => requestAnimationFrame(fitFullscreenStage));
  window.addEventListener("resize", () => {
    if (settings.resolution === "auto") applyRenderResolution();
    requestAnimationFrame(fitFullscreenStage);
  });

  function frame(now) {
    const dt = Math.min(.033, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  syncSettingsForm();
  applyRenderResolution();
  crt.classList.toggle("crt-off", !settings.scanlines);
  muteButton.textContent = muted ? "SOUND OFF" : "SOUND ON";
  musicButton.textContent = musicEnabled ? "MUSIC ON" : "MUSIC OFF";
  titleMenu.hidden = false;
  titleStart.focus({ preventScroll: true });
  updateHud();
  requestAnimationFrame(frame);

  if (location.search.indexOf("qa=1") >= 0) {
    window.__ssQA = {
      version: VERSION,
      state: () => state,
      samplePaths,
      MUSIC_PLAYLIST,
      playSample,
      startGame,
      startMusic,
      stopMusic,
      musicTrack: () => musicTrack,
      musicTrackIndex: () => musicTrackIndex,
      setTrack: index => {
        musicTrackIndex = index % MUSIC_PLAYLIST.length;
        if (musicTrack) musicTrack.dataset.src = "";
        startMusic();
      }
    };
  }
})();
