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
  const titleStorm = document.querySelector("#title-storm");
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

  // Logical playfield size — landscape 960×720 on desktop, portrait matched to
  // the device aspect on phones so the game fills the whole screen.
  let W = canvas.width;
  let H = canvas.height;
  const VERSION = "v4.1.0";
  const PLAY_LEFT = 34;
  let PLAY_RIGHT = W - 34;
  const PLAY_TOP = 48;
  let PADDLE_Y = H - 48;
  const STATES = Object.freeze({
    TITLE: "title",
    STORY: "story",
    PLAYING: "playing",
    PAUSED: "paused",
    LEVEL_CLEAR: "level-clear",
    WARPING: "warping",
    ENDING: "ending",
    CONTINUE: "continue",
    GAME_OVER: "game-over"
  });

  // Authentic arcade brick set: symbol -> colour + points (Taito 1986).
  const BRICK_DEFS = Object.freeze({
    W: { color: "#f2f6f8", points: 50 },
    O: { color: "#ff8624", points: 60 },
    C: { color: "#2ee6e6", points: 70 },
    N: { color: "#3ee23e", points: 80 },
    R: { color: "#f0362e", points: 90 },
    B: { color: "#3d7cf4", points: 100 },
    P: { color: "#e455e4", points: 110 },
    Y: { color: "#f2e23a", points: 120 },
    S: { color: "#a8b4bc", points: 0 },
    G: { color: "#d7a51e", points: 0 }
  });
  const STORM_DIGIT_SYMBOL = "WROYNCBP"; // digit index -> arcade symbol equivalent
  const STORM_COLORS = [
    "#dfecf2", "#ff4b68", "#ff982b", "#ffd83d",
    "#55df70", "#36d5d8", "#4b82ff", "#b467ff"
  ];

  // The 33 arcade screen layouts, parsed + verified against original stage
  // screenshots (13 columns, [leadRows, ...rowStrings]; stage 33 is DOH).
  const ARKANOID_STAGES = [
    [4,"SSSSSSSSSSSSS","RRRRRRRRRRRRR","YYYYYYYYYYYYY","BBBBBBBBBBBBB","PPPPPPPPPPPPP","NNNNNNNNNNNNN"],
    [2,"W............","WO...........","WOC..........","WOCN.........","WOCNR........","WOCNRB.......","WOCNRBP......","WOCNRBPY.....","WOCNRBPYW....","WOCNRBPYWO...","WOCNRBPYWOC..","WOCNRBPYWOCN.","SSSSSSSSSSSSR"],
    [3,"NNNNNNNNNNNNN",".............","WWWGGGGGGGGGG",".............","RRRRRRRRRRRRR",".............","GGGGGGGGGGWWW",".............","PPPPPPPPPPPPP",".............","BBBGGGGGGGGGG",".............","CCCCCCCCCCCCC",".............","GGGGGGGGGGCCC"],
    [4,".OCNSB.YWOCN.",".CNSBP.WOCNS.",".NSBPY.OCNSB.",".SBPYW.CNSBP.",".BPYWO.NSBPY.",".PYWOC.SBPYW.",".YWOCN.BPYWO.",".WOCNS.PYWOC.",".OCNSB.YWOCN.",".CNSBP.WOCNS.",".NSBPY.OCNSB.",".SBPYW.CNSBP.",".BPYWO.NSBPY.",".PYWOC.SBPYW."],
    [2,"...Y.....Y...","...Y.....Y...","....Y...Y....","....Y...Y....","...SSSSSSS...","...SSSSSSS...","..SSRSSSRSS..","..SSRSSSRSS..",".SSSSSSSSSSS.",".SSSSSSSSSSS.",".SSSSSSSSSSS.",".S.SSSSSSS.S.",".S.S.....S.S.",".S.S.....S.S.","....SS.SS....","....SS.SS...."],
    [4,"B.R.N.C.N.R.B","B.R.N.C.N.R.B","B.R.N.C.N.R.B","B.R.N.C.N.R.B","B.R.N.C.N.R.B","B.GOGOGOGOG.B","B.R.N.C.N.R.B","B.R.N.C.N.R.B","B.R.N.C.N.R.B","B.R.N.C.N.R.B","O.O.G.O.G.O.O","B.R.N.C.N.R.B"],
    [3,".B.B.B.B.B.B.",".....YYP.....","....YYPPB....","...YYPPBBR...",".B.YPPBBRR.B.","..YPPBBRRNN..","..PPBBRRNNC..","..PBBRRNNCC..",".BBBRRNNCCO..","..BRRNNCCOO..","..RRNNCCOOW..","...NNCCOOW...",".B.NCCOOWW...","....COOWW....",".....OWW.....",".............",".B.B.....B.B."],
    [4,"...G.G.G.G...",".G.........G.",".GG.G...G.GG.","......W......",".G...GOG...G.","...G..C..G...","......N......","...G..R..G...",".G...GBG...G.","......P......",".GG.G...G.GG.",".G.........G.","...G.G.G.G..."],
    [2,".GBG.....G.G.",".GNG.....GNG.",".GCG.....GCG.",".GGG.....GGG.",".............","....PWWWY....","....POOOY....","....PCCCY....","....PNNNY....","....PRRRY....","....PBBBY...."],
    [0,".G...........",".............",".G...........",".G...........",".G...........",".G.....B.....",".G....BCB....",".G...BCWCB...",".G..BCWCWCB..",".G.BCWCSCWCB.",".G..BCWCWCB..",".G...BCWCB...",".G....BCB....",".G.....B.....",".G...........",".G...........",".G...........",".GGGGGGGGGGGG"],
    [3,".B.B.B.B.B.B.",".SSSSSSSSSSS.",".S.........S.",".S.SSSSSSS.S.",".S.S.....S.S.",".S.S.SSS.S.S.",".S.S.S.S.S.S.",".S.S.SSS.S.S.",".S.S.....S.S.",".S.SSSSSSS.S.",".S.........S.",".SSSSSSSSSSS.",".............",".............",".............",".............",".B.B.B.B.B.B."],
    [4,"GGGGGGGGGGGGG","....G.....GP.",".GW.G.....G..",".G..G..G..G..",".G..GN.G..G..",".G..G..G..G..",".G.OG..G.BG..",".G..G..G..G..",".G..G..G..G..",".G..G.RG..G..",".G..G..G..G..",".GC....G.....",".G.....G....Y",".GGGGGGGGGGGG"],
    [4,".YYY.WWW.YYY.",".PPP.OOO.PPP.",".BBB.CCC.BBB.",".RRR.NNN.RRR.",".NNN.RRR.NNN.",".CCC.BBB.CCC.",".OOO.PPP.OOO.",".WWW.YYY.WWW."],
    [4,"BBBBBBBBBBBBB","G...........G","BBBBBBBBBBBBB",".............","OSSSSSSSSSSSO","G...........G","WWWWWWWWWWWWW",".............","CSSSSSSSSSSSC","G...........G","RRRRRRRRRRRRR",".............","RRRRRRRRRRRRR","G...........G"],
    [3,".B.B.B.B.B.B.",".............",".............","CWGCCCCCCCGWC","CWYGCCCCCGNWC","CWYYGCCCGNNWC","CWYYYGWGNNNWC","CWYYYYWNNNNWC","CWYYYYWNNNNWC","CWYYYYWNNNNWC","CSYYYYWNNNNSC","CCSYYYWNNNSCC","CCCSYYWNNSCCC","CCCCSYWNSCCCC","CCCCCSWSCCCCC"],
    [4,"......G......","....WW.WW....","..WW..G..WW..","WW..OO.OO..WW","..OO..G..OO..","OO..YY.YY..OO","..YY..G..YY..","YY..NN.NN..YY","..NN..G..NN..","NN..RR.RR..NN","..RR..G..RR..","RR..BB.BB..RR","..BB.....BB..","BB.........BB"],
    [4,"......S......","...BBBSNNN...","..BBBWWWNNN..","..BBWWWWWNN..",".BBBWWWWWNNN.",".BBBWWWWWNNN.",".BBBWWWWWNNN.",".S..S.S.S..S.","......S......","......S......","......S......","....G.G......","....GGG......",".....G......."],
    [4,"O.GYYYYYYYG.O","O.GGYYYYYGG.O","O.G.GYYYG.G.O","O.G.PGYGC.G.O","O.G.P.S.C.G.O","O.G.P.N.C.G.O","O.G.P.N.C.G.O","O.G.P.N.C.G.O","O.G.P.N.C.G.O","OGGGP.N.CGGGO"],
    [3,".B.B.B.B.B.B.","..GGGGGGGGG..","..NRBPGPBRN..","..NRBPGPBRN..","..NRBPGPBRN..","..NRBPYPBRN..","..NRBPGPBRN..","..NRBPGPBRN..","..NRBPGPBRN..","..GGGGGGGGG..",".............",".............",".B.B.B.B.B.B.",".............",".............",".............",".B.B.B.B.B.B."],
    [4,"GWGOGCGNGRGBG","GPGSGSGSGSGYG",".............","GPG.G.G.G.G.G","G.GPG.G.G.G.G","G.G.GPG.G.G.G","G.G.G.GPG.G.G","G.G.G.G.GPG.G","...........P.","..G.G.G.GPG..","..G.G.GPG.G..","..G.GPG.G.G..","...PG.G.G....",".P....G......"],
    [4,".GOOOOOOOOOG.",".G.........G.",".G.GGGGGGG.G.",".G.G.....G.G.",".G.G.....G.G.",".G.G.RRR.G.G.",".G.G.NNN.G.G.",".G.G.BBB.G.G.",".G.G.WWW.G.G.",".G.G.....G.G.",".G.GCCCCCG.G.",".G.........G.",".G.........G.",".GGGGGGGGGGG."],
    [4,"YYYYYYYYYYYYY","YYYYYYYYYYYYY",".............","RRG.GRRRG.GRR","RRG.GRRRG.GRR","RRG.GRRRG.GRR","RRG.GRRRG.GRR",".............","WWWWWWWWWWWWW","WWWWWWWWWWWWW"],
    [3,".B.B.B.B.B.B.","CCCCCCCCCCCCC",".............","..SSS.SSS.SSS","..SNS.SNS.SNS","..SSS.SSS.SSS",".............",".SSS.SSS.SSS.",".SRS.SRS.SRS.",".SSS.SSS.SSS.",".............","SSS.SSS.SSS..","SBS.SBS.SBS..","SSS.SSS.SSS..",".............",".............",".B.B.B.B.B.B."],
    [7,".....WWW.....",".....WWW.....",".....WWW.....","....WWWWW....","....WBWBW....","...WBBWBBW...","...BBBBBBB...","..BBBBBBBBB..","..BBBBBBBBB..",".BBBBBBBBBBB.","BBBBBBBBBBBBB"],
    [4,"RRRRRRRRRRRRR","NNNNNNNNNNNNN","BBBBBBBBBBBBB","GGGGGSSSGGGGG","GRRRG...GBBBG","GRRRG...GBBBG","G...........G","G...........G","G...GNNNG...G","G...GNNNG...G","GSSSGGGGGSSSG"],
    [4,"..GSSSG......",".G.....G.....","G..CCC..G....","G.NNNNN.G....","G.BBBBB.G....","G..PPP..G....",".G.....G.....","..GGGGG......"],
    [3,".B.B.B.B.B.B.",".............",".............",".............",".B.B.B.B.B.B.",".............",".............",".............","SSSSSSSSSSSSS","YYYYYYYYYYYYY","SSSSSSSSSSSSS",".............","SSSSSSSSSSSSS","RRRRRRRRRRRRR","SSSSSSSSSSSSS"],
    [3,"BBBBBBBBBBBBB","BGGGGPGPGGGGB","BG.........GB","BGP.......PGB","BGPP.....PPGB","BGPPP...PPPGB",".BGPPP.PPPGB.","..BGPPPPPGB..","...BGPPPGB...","....BGPGB....",".....BPB.....","......B......"],
    [4,"YYYYYG.GYYYYY","PPPPPG.GPPPPP","GGWGGG.GGGWGG","BBBBBG.GBBBBB","RRRRRG.GRRRRR","NNNNNG.GNNNNN","SSWSSG.GSSWSS","CCCCCG.GCCCCC","OOOOOG.GOOOOO","WWWWWG.GWWWWW"],
    [4,"YP...........","YPBR.........","YPBRNC.......","YPBRNCOW.....","YPBRNCOWYP...","SPBRNCOWYPBR.",".GSRNCOWYPBRN","...GSCOWYPBRN",".....GSWYPBRN",".......GSPBRN",".........GSRN","...........GS"],
    [3,".B.B.B.B.B.B.","N.R.B.P.Y.W.O","S.S.S.S.S.S.S",".B.R.N.C.O.W.",".S.S.S.S.S.S.","C.N.R.B.P.Y.W","S.S.S.S.S.S.S",".P.B.R.N.C.O.",".S.S.S.S.S.S.","O.C.N.R.B.P.Y","S.S.S.S.S.S.S",".Y.P.B.R.N.C.",".S.S.S.S.S.S.","W.O.C.N.R.B.P","S.S.S.S.S.S.S"],
    [4,"..G.G.G.G.G..","..G.G.G.G.G..","..G.G.G.GNN..","..G.G.G.G.G..","..G.G.GRRRR..","..G.G.G.G.G..","..G.GBBBBBB..","..G.G.G.G.G..","..GPPPPPPPP..","..G.G.G.G.G..","..YYYYYYYYY..","..SSSSSSSSS.."],
    [0]
  ];
  const DOH_STAGE = 32; // zero-based round index of the DOH confrontation

  const STORM_BLUEPRINTS = Object.freeze([
    { name: "RAINBOW WALL", rows: ["00000000000000", "11111111111111", "33333333333333", "66666666666666", "77777777777777", "44444444444444"] },
    { name: "CIRCUIT BREAKER", rows: ["SS..SS..SS..SS", "GG11GG11GG11GG", ".333..333..333", "66..SS..SS..66", ".777..777..777", "44GG44..44GG44", "..55..SS..55.."] },
    { name: "VAUS PYRAMID", rows: ["......00......", ".....0000.....", "....666666....", "...666SS666...", "..666SSSS666..", ".666SSGGSS666.", "66666666666666"] },
    { name: "IRON FORTRESS", rows: ["GGGGGGGGGGGGGG", "G111111111111G", "G1..........1G", "G1.SSSSSSSS.1G", "G1.S......S.1G", "G1.S.7777.S.1G", "G1.SSSSSSSS.1G", "G111111111111G"] },
    { name: "TWIN REACTORS", rows: [".3333....3333.", "333333..333333", "33SS33..33SS33", "33GG33..33GG33", ".3333....3333.", "..66..SS..66..", ".6666....6666."] },
    { name: "DIAMOND MINE", rows: ["......44......", ".....4444.....", "....445544....", "...455SS554...", "..45SSGGSS54..", "...455SS554...", "....445544....", ".....4444.....", "......44......"] },
    { name: "ALIEN SIGNAL", rows: ["..77......77..", "...77....77...", "....777777....", "..777S77S777..", ".777777777777.", ".77..7777..77.", ".....G..G.....", "....77..77...."] },
    { name: "NEON CAUSEWAY", rows: ["SSSSSSSSSSSSSS", "1.2.3.4.5.6.7.", ".2.3.4.5.6.7.1", "22GG33GG44GG55", "..66..77..11..", "5555..SS..5555", "..4444444444.."] },
    { name: "SPLIT CHAMBER", rows: ["111111..111111", "1SSSS1..1SSSS1", "1S..S1..1S..S1", "1S.GS1..1SG.S1", "1S..S1..1S..S1", "1SSSS1..1SSSS1", "111111..111111"] },
    { name: "STORM CROWN", rows: ["G..G..GG..G..G", "GG.G.GSSG.G.GG", ".GGG666666GGG.", "..666SSSS666..", ".66SS7777SS66.", "666777GG777666", "..3333333333..", "...44444444..."] }
  ]);

  // Capsules — full 1986 set with authentic colours.
  const CAPSULE_DEFS = Object.freeze({
    L: { name: "LASER", color: "#f0362e" },
    E: { name: "ENLARGE", color: "#3d7cf4" },
    C: { name: "CATCH", color: "#3ee23e" },
    S: { name: "SLOW", color: "#ff8624" },
    B: { name: "BREAK", color: "#c44df0" },
    D: { name: "DISRUPTION", color: "#2ee6e6" },
    P: { name: "EXTRA VAUS", color: "#c8ccd2" }
  });
  const CAPSULE_POOL = "EEEELLLLCCCCSSSSDDDDBP"; // weighted draw; B and P are rare

  const ENEMY_TYPES = Object.freeze([
    { key: "konerd", name: "KONERD", color: "#7de07d", accent: "#d9ffd9" },
    { key: "pyradok", name: "PYRADOK", color: "#e0c060", accent: "#fff2c0" },
    { key: "trisphere", name: "TRI-SPHERE", color: "#f06060", accent: "#ffd0d0" },
    { key: "opopo", name: "OPOPO", color: "#70b8f0", accent: "#d8eeff" }
  ]);

  const STORY_INTRO = [
    "THE ERA AND TIME OF",
    "THIS STORY IS UNKNOWN.",
    "",
    "AFTER THE MOTHERSHIP \"ARKANOID\"",
    "WAS DESTROYED, A SPACECRAFT",
    "\"VAUS\" SCRAMBLED AWAY FROM IT.",
    "",
    "BUT ONLY TO BE TRAPPED IN SPACE",
    "WARPED BY SOMEONE........"
  ];
  const STORY_ENDING = [
    "DIMENSION-CONTROLLING FORT \"DOH\"",
    "HAS NOW BEEN DEMOLISHED,",
    "AND TIME STARTED FLOWING REVERSELY.",
    "",
    "\"VAUS\" MANAGED TO ESCAPE",
    "FROM THE DISTORTED SPACE.",
    "",
    "BUT THE REAL VOYAGE OF \"ARKANOID\"",
    "IN THE GALAXY HAS ONLY STARTED......"
  ];

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
  const sampleBank = new Map();
  const sampleCursor = new Map();
  const sampleLastPlayed = new Map();
  const difficultyProfiles = Object.freeze({
    relaxed: { lives: 4, paddleWidth: 138, paddleSpeed: 780, ballSpeed: .84, enemyDelay: 1.3, enemySpeed: .85 },
    classic: { lives: 3, paddleWidth: 116, paddleSpeed: 720, ballSpeed: 1, enemyDelay: 1, enemySpeed: 1 },
    expert: { lives: 3, paddleWidth: 102, paddleSpeed: 700, ballSpeed: 1.14, enemyDelay: .78, enemySpeed: 1.18 }
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
  let campaign = "arkanoid";
  let score = 0;
  let highScore = readHighScore();
  let round = 0;
  let lives = 3;
  let bricks = [];
  let balls = [];
  let capsules = [];
  let lasers = [];
  let particles = [];
  let enemies = [];
  let dohShots = [];
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
  let activePower = null;          // 'L' | 'C' | 'E' | null — cleared by the next capsule
  let lastCapsuleType = null;      // duplicate rolls substitute Disruption (arcade rule)
  let pTakenThisLife = false;      // one grey capsule per Vaus (arcade rule)
  let bricksSinceCapsule = 0;
  let nextCapsuleAt = 4;
  let slowStacks = 0;
  let speedRampTimer = 0;
  let breakGate = null;            // { progress, used } while open on the right wall
  let warpTimer = 0;
  let storyTimer = 0;
  let endingTimer = 0;
  let continueTimer = 0;
  let vausExplode = 0;
  let doh = null;
  let nextExtendIndex = 0;
  let nextExtendScore = 20000;
  const doors = [
    { fx: .28, open: 0, pending: null },
    { fx: .72, open: 0, pending: null }
  ];
  const keys = new Set();

  const paddle = {
    x: W / 2 - 58,
    targetX: W / 2,
    y: PADDLE_Y,
    w: 116,
    h: 17,
    speed: 720,
    laserCooldown: 0
  };

  function makeStars() {
    return Array.from({ length: 110 }, (_, i) => ({
      x: pseudo(i * 3.17) * W,
      y: pseudo(i * 8.91 + 2) * H,
      r: .4 + pseudo(i * 2.33 + 9) * 1.4,
      a: .18 + pseudo(i * 1.71 + 1) * .55,
      s: 3 + pseudo(i * 5.19) * 13
    }));
  }
  let stars = makeStars();

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

  let pendingLayout = false;

  function desiredLogicalSize() {
    const boxW = stageWrap.clientWidth || W;
    const boxH = stageWrap.clientHeight || H;
    if (boxH > boxW * 1.05) {
      // Portrait phone: match the stage box aspect so the field fills it exactly.
      return { w: 720, h: Math.round(Math.max(900, Math.min(1400, 720 * boxH / boxW))) };
    }
    return { w: 960, h: 720 };
  }

  function layoutSafeNow() {
    return state === STATES.TITLE || state === STATES.STORY ||
      state === STATES.GAME_OVER || state === STATES.CONTINUE || state === STATES.ENDING;
  }

  function applyLogicalSize(force = false) {
    const next = desiredLogicalSize();
    if (next.w === W && next.h === H) { pendingLayout = false; return; }
    if (!force && !layoutSafeNow()) { pendingLayout = true; return; }
    W = next.w;
    H = next.h;
    PLAY_RIGHT = W - 34;
    PADDLE_Y = H - 48;
    paddle.y = PADDLE_Y;
    paddle.x = Math.max(PLAY_LEFT + 7, Math.min(PLAY_RIGHT - paddle.w - 7, paddle.x));
    paddle.targetX = paddle.x + paddle.w / 2;
    stars = makeStars();
    renderScale = 0; // force the backing store to adopt the new logical size
    applyRenderResolution();
    pendingLayout = false;
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

  function musicAllowed() {
    return state === STATES.PLAYING || state === STATES.LEVEL_CLEAR ||
      state === STATES.WARPING || state === STATES.ENDING;
  }

  function startMusic() {
    if (!musicEnabled || !musicAllowed()) return;
    const track = ensureMusicTrack();
    track.volume = musicVolumeFor();
    track.play().catch(() => {});
  }

  function stopMusic() {
    if (!musicTrack) return;
    musicTrack.pause();
  }

  // ---------------------------------------------------------------- levels

  function silverHits(levelIndex) {
    return campaign === "arkanoid" ? 2 + Math.floor(levelIndex / 8) : 2;
  }

  function makeArkanoidLevel(levelIndex) {
    const stage = ARKANOID_STAGES[levelIndex % ARKANOID_STAGES.length];
    const lead = stage[0];
    const rows = stage.slice(1);
    const cols = 13;
    const gap = 3;
    const marginX = 6;
    const top = 78;
    const rowPitch = 22;
    const brickW = (PLAY_RIGHT - PLAY_LEFT - marginX * 2 - gap * (cols - 1)) / cols;
    const brickH = rowPitch - gap + 1;
    const levelBricks = [];
    remainingBreakable = 0;

    for (let row = 0; row < rows.length; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const symbol = rows[row][col] || ".";
        if (symbol === ".") continue;
        const def = BRICK_DEFS[symbol];
        if (!def) continue;
        const gold = symbol === "G";
        const silver = symbol === "S";
        const hp = gold ? Infinity : silver ? silverHits(levelIndex) : 1;
        levelBricks.push({
          x: PLAY_LEFT + marginX + col * (brickW + gap),
          y: top + (lead + row) * rowPitch,
          w: brickW,
          h: brickH,
          color: def.color,
          points: silver ? 50 * (levelIndex + 1) : def.points,
          hp,
          maxHp: hp,
          gold,
          silver,
          alive: true,
          flash: 0
        });
        if (!gold) remainingBreakable += 1;
      }
    }
    return levelBricks;
  }

  function makeStormLevel(levelIndex) {
    const cols = 14;
    const gap = 5;
    const marginX = 57;
    const top = 92;
    const brickW = (W - marginX * 2 - gap * (cols - 1)) / cols;
    const brickH = 23;
    const blueprint = STORM_BLUEPRINTS[levelIndex % STORM_BLUEPRINTS.length];
    const cycle = Math.floor(levelIndex / STORM_BLUEPRINTS.length);
    const levelBricks = [];
    remainingBreakable = 0;

    for (let row = 0; row < blueprint.rows.length; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const symbol = blueprint.rows[row][col] || ".";
        if (symbol === ".") continue;
        const gold = symbol === "G";
        const silver = symbol === "S";
        let hp = silver ? 2 : 1;
        if (!gold && !silver && cycle > 0 && (row * 5 + col * 3 + levelIndex) % 11 < Math.min(cycle, 3)) hp += 1;
        const digit = gold || silver ? 0 : Number(symbol);
        const arcadeSym = STORM_DIGIT_SYMBOL[digit] || "W";
        levelBricks.push({
          x: marginX + col * (brickW + gap),
          y: top + row * (brickH + gap),
          w: brickW,
          h: brickH,
          color: gold ? BRICK_DEFS.G.color : silver ? BRICK_DEFS.S.color : STORM_COLORS[digit],
          points: silver ? 50 * (levelIndex + 1) : BRICK_DEFS[arcadeSym].points,
          hp: gold ? Infinity : hp,
          maxHp: gold ? Infinity : hp,
          gold,
          silver,
          alive: true,
          flash: 0
        });
        if (!gold) remainingBreakable += 1;
      }
    }
    return levelBricks;
  }

  function makeLevel(levelIndex) {
    return campaign === "arkanoid" ? makeArkanoidLevel(levelIndex) : makeStormLevel(levelIndex);
  }

  function levelName(levelIndex) {
    if (campaign === "arkanoid") {
      return levelIndex === DOH_STAGE ? "DOH" : `STAGE ${levelIndex + 1}`;
    }
    return STORM_BLUEPRINTS[levelIndex % STORM_BLUEPRINTS.length].name;
  }

  function totalRounds() {
    return campaign === "arkanoid" ? ARKANOID_STAGES.length : Infinity;
  }

  function isDohRound() {
    return campaign === "arkanoid" && round === DOH_STAGE;
  }

  // ---------------------------------------------------------------- flow

  function startGame(which) {
    const profile = difficultyProfile();
    campaign = which || "arkanoid";
    titleMenu.hidden = true;
    score = 0;
    round = 0;
    lives = profile.lives;
    nextExtendIndex = 0;
    nextExtendScore = 20000;
    particles = [];
    capsules = [];
    lasers = [];
    enemies = [];
    dohShots = [];
    paddle.w = profile.paddleWidth;
    paddle.speed = profile.paddleSpeed;
    clearPower();
    if (campaign === "arkanoid") {
      state = STATES.STORY;
      storyTimer = 0;
      stopMusic();
      return;
    }
    startRound();
    startMusic();
  }

  function startRound() {
    state = STATES.PLAYING;
    stateTimer = 0;
    if (pendingLayout) applyLogicalSize(true);
    bricks = makeLevel(round);
    capsules = [];
    lasers = [];
    enemies = [];
    dohShots = [];
    doors.forEach(door => { door.open = 0; door.pending = null; });
    breakGate = null;
    slowStacks = 0;
    speedRampTimer = 0;
    bricksSinceCapsule = 0;
    nextCapsuleAt = capsuleThreshold();
    lastCapsuleType = null;
    pTakenThisLife = false;
    vausExplode = 0;
    enemyTimer = Math.max(4, 8 - round * .25) * difficultyProfile().enemyDelay;
    paddle.x = W / 2 - paddle.w / 2;
    paddle.targetX = W / 2;
    clearPower();
    doh = isDohRound()
      ? { hp: 16, maxHp: 16, x: W / 2, y: 128, w: 216, h: 252, hurt: 0, mouth: 0, fireTimer: 2.6, quake: 0 }
      : null;
    balls = [];
    serveBall();
    setMessage(`${campaign === "arkanoid" ? `ROUND ${round + 1}` : `ROUND ${round + 1} · ${levelName(round)}`}${isDohRound() ? " · DOH" : ""}`, 1.55);
    window.setTimeout(() => { if (state === STATES.PLAYING) setMessage("READY", .9); }, 1600);
    if (!playSample("round", .58, 500)) chord([220, 330, 440], .055, .12);
    startMusic();
    updateHud();
  }

  function capsuleThreshold() {
    return round === 0 ? 2 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 7);
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
      stuckTimer: 0,
      trail: []
    });
  }

  function baseBallSpeed() {
    return (430 + Math.min(round * 7, 130)) * difficultyProfile().ballSpeed;
  }

  function releaseBalls() {
    let released = false;
    balls.forEach(ball => {
      if (!ball.stuck) return;
      ball.stuck = false;
      const speed = baseBallSpeed();
      const angle = (Math.random() * .46 - .23);
      ball.vx = Math.sin(angle) * speed + (ball.stickOffset || 0) * 1.5;
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
    if (state === STATES.TITLE) {
      startGame("arkanoid");
      return;
    }
    if (state === STATES.STORY) {
      state = STATES.PLAYING;
      startRound();
      return;
    }
    if (state === STATES.ENDING) {
      if (endingTimer > 1.2) returnToTitle();
      return;
    }
    if (state === STATES.CONTINUE) {
      score = 0;
      lives = difficultyProfile().lives;
      nextExtendIndex = 0;
      nextExtendScore = 20000;
      startRound();
      return;
    }
    if (state === STATES.GAME_OVER) {
      returnToTitle();
      return;
    }
    if (state === STATES.PAUSED) {
      state = STATES.PLAYING;
      lastTime = performance.now();
      startMusic();
      return;
    }
    if (state !== STATES.PLAYING) return;
    if (!releaseBalls() && activePower === "L") fireLasers();
  }

  function returnToTitle() {
    state = STATES.TITLE;
    stopMusic();
    titleMenu.hidden = false;
    applyLogicalSize();
    updateHud();
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
    while (score >= nextExtendScore) {
      lives = Math.min(9, lives + 1);
      setMessage("EXTRA VAUS", 1.2);
      if (!playSample("bonus", .8, 120)) chord([392, 523, 659, 784], .05, .16);
      nextExtendIndex += 1;
      nextExtendScore = nextExtendIndex === 1 ? 60000 : nextExtendScore + 60000;
    }
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
      if (!playSample("brick", .6, 42)) tone(210, .045, "square", .025, 35);
      spark(sourceX, sourceY, "#f2fbff", 6);
      return;
    }

    brick.alive = false;
    remainingBreakable -= 1;
    addScore(brick.points);
    if (!playSample("brick", .68, 42)) tone(250 + (brick.points % 200), .055, "square", .032, 80);
    burst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 14);
    if (!brick.silver) maybeSpawnCapsule(brick);

    if (remainingBreakable <= 0) completeRound();
  }

  // Capsules drop after a random count of non-silver bricks; never during
  // multiball, never while one is already falling, never on the DOH stage.
  function maybeSpawnCapsule(brick) {
    if (isDohRound() || breakGate) return;
    bricksSinceCapsule += 1;
    if (bricksSinceCapsule < nextCapsuleAt) return;
    if (capsules.length > 0 || balls.length > 1) return;
    bricksSinceCapsule = 0;
    nextCapsuleAt = capsuleThreshold();
    let type = CAPSULE_POOL[Math.floor(Math.random() * CAPSULE_POOL.length)];
    if (type === lastCapsuleType) type = "D";
    if (type === "P" && (pTakenThisLife || lives >= 8)) type = "D";
    capsules.push({
      x: brick.x + brick.w / 2,
      y: brick.y + brick.h / 2,
      vy: 125,
      type,
      angle: 0
    });
  }

  function clearPower() {
    if (activePower === "E") {
      const center = paddle.x + paddle.w / 2;
      paddle.w = difficultyProfile().paddleWidth;
      paddle.x = center - paddle.w / 2;
    }
    activePower = null;
    balls.forEach(ball => {
      if (ball.stuck && state === STATES.PLAYING) ball.stuckTimer = Math.min(ball.stuckTimer, .4);
    });
    paddle.laserCooldown = 0;
  }

  function applyCapsule(type) {
    addScore(250);
    lastCapsuleType = type;
    setMessage(CAPSULE_DEFS[type].name, 1.05);
    if (!playSample("bonus", .66, 120)) chord([330, 494, 659], .035, .1);

    const keepEnlarge = type === "E" && activePower === "E";
    if (!keepEnlarge) clearPower();

    if (type === "E") {
      if (!keepEnlarge) {
        const center = paddle.x + paddle.w / 2;
        paddle.w = Math.min(196, difficultyProfile().paddleWidth + 42);
        paddle.x = center - paddle.w / 2;
      }
      activePower = "E";
    }
    if (type === "L") activePower = "L";
    if (type === "C") activePower = "C";
    if (type === "S") {
      slowStacks = Math.min(4, slowStacks + 1);
      speedRampTimer = 0;
      balls.forEach(ball => {
        if (ball.stuck) return;
        const speed = Math.hypot(ball.vx, ball.vy);
        const scale = Math.max(240, speed * .72) / speed;
        ball.vx *= scale;
        ball.vy *= scale;
      });
    }
    if (type === "D") disruption();
    if (type === "B") openBreakGate();
    if (type === "P") {
      pTakenThisLife = true;
      lives = Math.min(9, lives + 1);
      updateHud();
    }
  }

  function disruption() {
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
        stuckTimer: 0,
        trail: []
      });
    });
  }

  function openBreakGate() {
    if (breakGate) return;
    breakGate = { progress: 0, used: false };
    if (!playSample("bonus", .7, 100)) chord([262, 392, 523], .05, .14);
    setMessage("BREAK — ESCAPE RIGHT", 1.6);
  }

  function startWarp() {
    if (state !== STATES.PLAYING) return;
    breakGate.used = true;
    state = STATES.WARPING;
    warpTimer = 1.05;
    capsules = [];
    lasers = [];
    dohShots = [];
    if (!playSample("round", .7, 200)) chord([330, 415, 523, 659], .07, .18);
  }

  function finishWarp() {
    addScore(10000);
    setMessage("BREAK BONUS 10000", 1.4);
    advanceRound();
  }

  function advanceRound() {
    round += 1;
    if (round >= totalRounds()) {
      beginEnding();
      return;
    }
    startRound();
  }

  function loseBall() {
    if (balls.length > 0 || state !== STATES.PLAYING) return;
    lives -= 1;
    updateHud();
    clearPower();
    slowStacks = 0;
    pTakenThisLife = false;
    capsules = [];
    lasers = [];
    vausExplode = .85;
    burst(paddle.x + paddle.w / 2, paddle.y + 6, "#8fd8ff", 26);
    burst(paddle.x + paddle.w / 2, paddle.y + 2, "#ff9a5c", 18);
    if (!playSample("death", .76, 250)) tone(160, .42, "sawtooth", .045, -105);

    if (lives <= 0) {
      saveHighScore();
      stopMusic();
      if (campaign === "arkanoid" && !isDohRound()) {
        state = STATES.CONTINUE;
        continueTimer = 9.99;
        window.setTimeout(() => chord([330, 262, 196], .1, .2), 500);
      } else {
        state = STATES.GAME_OVER;
        stateTimer = 0;
        window.setTimeout(() => chord([330, 262, 196, 147], .12, .24), 620);
      }
      return;
    }
    window.setTimeout(() => {
      if (state === STATES.PLAYING && balls.length === 0) serveBall();
    }, 900);
    setMessage("READY", 1.1);
  }

  function completeRound() {
    if (state !== STATES.PLAYING) return;
    state = STATES.LEVEL_CLEAR;
    stateTimer = 2.3;
    addScore(1000 + lives * 250);
    capsules = [];
    lasers = [];
    enemies = [];
    dohShots = [];
    if (!playSample("round", .76, 250)) chord([262, 330, 392, 523, 659], .08, .2);
  }

  function beginEnding() {
    state = STATES.ENDING;
    endingTimer = 0;
    balls = [];
    capsules = [];
    lasers = [];
    enemies = [];
    dohShots = [];
    saveHighScore();
    window.setTimeout(() => chord([523, 659, 784, 1047], .09, .3), 400);
  }

  function defeatDoh() {
    addScore(1000);
    doh.hp = 0;
    burst(doh.x, doh.y + doh.h / 2, "#ff5c47", 60);
    burst(doh.x, doh.y + doh.h / 2, "#ffd76a", 40);
    shake = Math.max(shake, 9);
    if (!playSample("death", .9, 100)) tone(70, .8, "sawtooth", .06, -40);
    window.setTimeout(() => beginEnding(), 1400);
    state = STATES.LEVEL_CLEAR; // freeze play during collapse
    stateTimer = 1.45;
  }

  // ---------------------------------------------------------------- update

  function update(dt) {
    stars.forEach(star => {
      star.y += star.s * dt;
      if (star.y > H) star.y -= H;
    });
    updateParticles(dt);
    messageTimer = Math.max(0, messageTimer - dt);
    shake = Math.max(0, shake - dt * 22);
    vausExplode = Math.max(0, vausExplode - dt);

    if (state === STATES.STORY) {
      storyTimer += dt;
      if (storyTimer > 11) { state = STATES.PLAYING; startRound(); }
      return;
    }
    if (state === STATES.ENDING) {
      endingTimer += dt;
      if (Math.random() < dt * 2.4) {
        burst(PLAY_LEFT + Math.random() * (PLAY_RIGHT - PLAY_LEFT), PLAY_TOP + 60 + Math.random() * 320,
          ["#ffd76a", "#8fd8ff", "#ff8fb0", "#9dffa0"][Math.floor(Math.random() * 4)], 20);
      }
      if (endingTimer > 20) returnToTitle();
      return;
    }
    if (state === STATES.CONTINUE) {
      continueTimer -= dt;
      if (continueTimer <= 0) {
        state = STATES.GAME_OVER;
        stateTimer = 0;
      }
      return;
    }
    if (state === STATES.WARPING) {
      warpTimer -= dt;
      paddle.x += 330 * dt;
      spark(paddle.x + paddle.w, paddle.y + 8, "#c44df0", 3);
      if (warpTimer <= 0) finishWarp();
      return;
    }
    if (state === STATES.PAUSED || state === STATES.TITLE || state === STATES.GAME_OVER) return;
    if (state === STATES.LEVEL_CLEAR) {
      stateTimer -= dt;
      if (stateTimer <= 0) {
        if (doh && doh.hp <= 0) return; // ending scheduled
        advanceRound();
      }
      return;
    }

    speedRampTimer += dt;
    if (speedRampTimer >= 9) {
      speedRampTimer = 0;
      balls.forEach(ball => {
        if (ball.stuck) return;
        const speed = Math.hypot(ball.vx, ball.vy);
        const cap = baseBallSpeed() * 1.45;
        if (speed < cap) { ball.vx *= 1.045; ball.vy *= 1.045; }
      });
    }

    updatePaddle(dt);
    updateBalls(dt);
    updateCapsules(dt);
    updateLasers(dt);
    updateEnemies(dt);
    updateDoh(dt);
    updateBreakGate(dt);
    bricks.forEach(brick => { brick.flash = Math.max(0, brick.flash - dt); });
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
    const rightLimit = breakGate && breakGate.progress >= 1
      ? PLAY_RIGHT - paddle.w + 26
      : PLAY_RIGHT - paddle.w - 7;
    paddle.x = Math.max(PLAY_LEFT + 7, Math.min(rightLimit, paddle.x));
    if (breakGate && breakGate.progress >= 1 && paddle.x >= PLAY_RIGHT - paddle.w + 22) startWarp();
  }

  // Authentic three-zone Vaus bounce: centre = steep, bands = 45°, edge = shallow.
  function paddleBounceAngle(relative) {
    const magnitude = Math.abs(relative);
    const sign = relative < 0 ? -1 : 1;
    if (magnitude <= .3) return relative * 1.35;
    if (magnitude <= .75) return sign * .785;
    return sign * 1.12;
  }

  function updateBalls(dt) {
    const dead = [];

    balls.forEach((ball, ballIndex) => {
      if (ball.stuck) {
        ball.x = Math.max(paddle.x + ball.r, Math.min(paddle.x + paddle.w - ball.r, paddle.x + paddle.w / 2 + ball.stickOffset));
        ball.y = paddle.y - ball.r - 2;
        ball.stuckTimer += dt;
        if (ball.stuckTimer > 3 && state === STATES.PLAYING) releaseBalls();
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

        if (ball.vy > 0 && previousY + ball.r <= paddle.y + 3 && vausExplode <= 0 && circleRect(ball, paddle)) {
          ball.y = paddle.y - ball.r - 1;
          const relative = Math.max(-1, Math.min(1, (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2)));
          const speedFactor = difficultyProfile().ballSpeed;
          const newSpeed = Math.min(720 * speedFactor, Math.max(420 * speedFactor, Math.hypot(ball.vx, ball.vy) * 1.006));
          const angle = paddleBounceAngle(relative);
          ball.vx = Math.sin(angle) * newSpeed;
          ball.vy = -Math.abs(Math.cos(angle) * newSpeed);
          if (Math.abs(ball.vx) < 65) ball.vx = 65 * (relative < 0 ? -1 : 1);
          if (!playSample("paddle", .62, 55)) tone(185, .04, "triangle", .035, 45);
          spark(ball.x, ball.y, "#8deaff", 5);

          if (activePower === "C") {
            ball.stuck = true;
            ball.stuckTimer = 0;
            ball.stickOffset = ball.x - (paddle.x + paddle.w / 2);
          }
          continue;
        }

        if (doh && doh.hp > 0) {
          const dohRect = { x: doh.x - doh.w / 2, y: doh.y, w: doh.w, h: doh.h };
          if (circleRect(ball, dohRect)) {
            const wasHorizontal = previousX + ball.r <= dohRect.x || previousX - ball.r >= dohRect.x + dohRect.w;
            const wasVertical = previousY + ball.r <= dohRect.y || previousY - ball.r >= dohRect.y + dohRect.h;
            if (wasHorizontal && !wasVertical) ball.vx *= -1;
            else ball.vy *= -1;
            ball.x = previousX;
            ball.y = previousY;
            if (doh.hurt <= 0) {
              doh.hp -= 1;
              doh.hurt = .55;
              doh.quake = .4;
              addScore(1000);
              shake = Math.max(shake, 5);
              burst(ball.x, ball.y, "#ff8464", 16);
              if (!playSample("death", .5, 120)) tone(95, .2, "sawtooth", .045, 60);
              if (doh.hp <= 0) { defeatDoh(); return; }
            } else {
              spark(ball.x, ball.y, "#ffb0a0", 4);
              if (!playSample("wall", .5, 70)) tone(130, .04, "square", .02, -15);
            }
            continue;
          }
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

        for (let d = enemies.length - 1; d >= 0; d -= 1) {
          const enemy = enemies[d];
          const dx = ball.x - enemy.x;
          const dy = ball.y - enemy.y;
          if (dx * dx + dy * dy > (ball.r + enemy.r) ** 2) continue;
          const magnitude = Math.max(1, Math.hypot(dx, dy));
          const nx = dx / magnitude;
          const ny = dy / magnitude;
          const dot = ball.vx * nx + ball.vy * ny;
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;
          destroyEnemy(d, enemy);
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
      if (vausExplode <= 0 &&
          rect.y + rect.h >= paddle.y && rect.y <= paddle.y + paddle.h &&
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
        for (let d = enemies.length - 1; d >= 0; d -= 1) {
          const enemy = enemies[d];
          if (Math.abs(laser.x - enemy.x) < enemy.r && Math.abs(laser.y - enemy.y) < enemy.r + 10) {
            destroyEnemy(d, enemy);
            removed = true;
            break;
          }
        }
      }
      if (removed) lasers.splice(i, 1);
    }
  }

  // Enemies emerge from the two hatches in the top wall, drift downward and
  // deflect the ball. The Vaus destroys them harmlessly on contact.
  function updateEnemies(dt) {
    if (!isDohRound()) {
      enemyTimer -= dt;
      const busyDoor = doors.some(door => door.pending);
      if (enemyTimer <= 0 && !busyDoor && enemies.length < 3 && remainingBreakable > 5) {
        const door = doors[Math.random() < .5 ? 0 : 1];
        door.pending = ENEMY_TYPES[round % ENEMY_TYPES.length];
        enemyTimer = (Math.max(4, 8.5 - round * .18) + Math.random() * 3) * difficultyProfile().enemyDelay;
      }
    }

    doors.forEach(door => {
      if (door.pending) {
        door.open = Math.min(1, door.open + dt * 2.4);
        if (door.open >= 1) {
          const doorX = PLAY_LEFT + (PLAY_RIGHT - PLAY_LEFT) * door.fx;
          enemies.push({
            type: door.pending,
            x: doorX,
            y: PLAY_TOP + 18,
            vx: (Math.random() < .5 ? -1 : 1) * (36 + Math.random() * 30) * difficultyProfile().enemySpeed,
            vy: (46 + Math.random() * 26) * difficultyProfile().enemySpeed,
            r: 15,
            spin: Math.random() * Math.PI * 2,
            wobble: Math.random() * Math.PI * 2
          });
          door.pending = null;
        }
      } else {
        door.open = Math.max(0, door.open - dt * 1.6);
      }
    });

    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      enemy.wobble += dt * 2.2;
      enemy.spin += dt * 2.8;
      enemy.x += (enemy.vx + Math.sin(enemy.wobble) * 26) * dt;
      enemy.y += enemy.vy * dt;
      if (enemy.x - enemy.r < PLAY_LEFT + 2) { enemy.x = PLAY_LEFT + 2 + enemy.r; enemy.vx = Math.abs(enemy.vx); }
      if (enemy.x + enemy.r > PLAY_RIGHT - 2) { enemy.x = PLAY_RIGHT - 2 - enemy.r; enemy.vx = -Math.abs(enemy.vx); }
      if (enemy.y - enemy.r < PLAY_TOP + 4) { enemy.y = PLAY_TOP + 4 + enemy.r; enemy.vy = Math.abs(enemy.vy); }

      for (const brick of bricks) {
        if (!brick.alive || !circleRect(enemy, brick)) continue;
        const overlapX = Math.min(Math.abs(enemy.x - brick.x), Math.abs(enemy.x - (brick.x + brick.w)));
        const overlapY = Math.min(Math.abs(enemy.y - brick.y), Math.abs(enemy.y - (brick.y + brick.h)));
        if (overlapX < overlapY) {
          enemy.vx = enemy.x < brick.x + brick.w / 2 ? -Math.abs(enemy.vx) : Math.abs(enemy.vx);
          enemy.x += enemy.vx > 0 ? 2 : -2;
        } else {
          enemy.vy = enemy.y < brick.y + brick.h / 2 ? -Math.abs(enemy.vy) : Math.abs(enemy.vy);
          enemy.y += enemy.vy > 0 ? 2 : -2;
        }
        break;
      }

      if (vausExplode <= 0 && enemy.y + enemy.r >= paddle.y && enemy.y - enemy.r <= paddle.y + paddle.h &&
          enemy.x + enemy.r >= paddle.x && enemy.x - enemy.r <= paddle.x + paddle.w) {
        destroyEnemy(i, enemy);
        continue;
      }
      if (enemy.y - enemy.r > H) enemies.splice(i, 1);
    }
  }

  function destroyEnemy(index, enemy) {
    addScore(100);
    burst(enemy.x, enemy.y, enemy.type.color, 18);
    if (!playSample("death", .42, 100)) tone(110, .12, "sawtooth", .03, 210);
    enemies.splice(index, 1);
  }

  function updateDoh(dt) {
    if (!doh || doh.hp <= 0) { updateDohShots(dt); return; }
    doh.hurt = Math.max(0, doh.hurt - dt);
    doh.quake = Math.max(0, doh.quake - dt);
    doh.mouth = Math.max(0, doh.mouth - dt);
    doh.fireTimer -= dt;
    if (doh.fireTimer <= 0) {
      doh.fireTimer = 1.3 + (doh.hp / doh.maxHp) * 1.6 + Math.random() * .5;
      doh.mouth = .55;
      const originX = doh.x + (Math.random() * 26 - 13);
      const originY = doh.y + doh.h * .62;
      const aim = Math.atan2(paddle.y - originY, (paddle.x + paddle.w / 2) - originX) + (Math.random() * .22 - .11);
      const speed = 235 + (1 - doh.hp / doh.maxHp) * 90;
      dohShots.push({ x: originX, y: originY, vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, r: 8, spin: 0 });
      if (!playSample("laser", .5, 100)) tone(220, .16, "sawtooth", .04, -140);
    }
    updateDohShots(dt);
  }

  function updateDohShots(dt) {
    for (let i = dohShots.length - 1; i >= 0; i -= 1) {
      const shot = dohShots[i];
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.spin += dt * 9;
      if (shot.x < PLAY_LEFT + shot.r) { shot.x = PLAY_LEFT + shot.r; shot.vx = Math.abs(shot.vx); }
      if (shot.x > PLAY_RIGHT - shot.r) { shot.x = PLAY_RIGHT - shot.r; shot.vx = -Math.abs(shot.vx); }
      if (shot.y > H + 20) { dohShots.splice(i, 1); continue; }
      if (vausExplode <= 0 && state === STATES.PLAYING &&
          shot.y + shot.r >= paddle.y && shot.y - shot.r <= paddle.y + paddle.h &&
          shot.x + shot.r >= paddle.x && shot.x - shot.r <= paddle.x + paddle.w) {
        dohShots.splice(i, 1);
        balls = [];
        loseBall();
        return;
      }
    }
  }

  function updateBreakGate(dt) {
    if (!breakGate) return;
    if (!breakGate.used) breakGate.progress = Math.min(1, breakGate.progress + dt * 1.8);
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

  // ---------------------------------------------------------------- draw

  function draw() {
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    drawBackground();
    drawArena();
    drawDoh();
    drawBricks();
    drawEnemies();
    drawDohShots();
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

    // Right wall — leaves a gap when the Break gate is open.
    if (breakGate) {
      const gateTop = PADDLE_Y - 34;
      const gateH = 62 * breakGate.progress;
      ctx.fillRect(PLAY_RIGHT + 1, PLAY_TOP - 10, 10, gateTop - (PLAY_TOP - 10));
      ctx.fillRect(PLAY_RIGHT + 1, gateTop + gateH, 10, H - (gateTop + gateH));
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = "#c44df0";
      ctx.fillStyle = `rgba(196, 77, 240, ${.35 + Math.sin(performance.now() / 130) * .2})`;
      ctx.fillRect(PLAY_RIGHT - 3, gateTop, 14, gateH);
      ctx.restore();
    } else {
      ctx.fillRect(PLAY_RIGHT + 1, PLAY_TOP - 10, 10, H - PLAY_TOP + 10);
    }

    const top = ctx.createLinearGradient(0, PLAY_TOP - 11, 0, PLAY_TOP + 1);
    top.addColorStop(0, "#1b3b6b");
    top.addColorStop(.5, "#d4f5ff");
    top.addColorStop(1, "#225b8b");
    ctx.fillStyle = top;
    ctx.fillRect(PLAY_LEFT - 11, PLAY_TOP - 11, PLAY_RIGHT - PLAY_LEFT + 22, 10);
    ctx.restore();

    // Enemy hatches in the top wall.
    doors.forEach(door => {
      const doorX = PLAY_LEFT + (PLAY_RIGHT - PLAY_LEFT) * door.fx;
      const halfW = 30;
      ctx.save();
      ctx.fillStyle = "#050b18";
      ctx.fillRect(doorX - halfW, PLAY_TOP - 11, halfW * 2, 10);
      const slide = halfW * door.open;
      const hatch = ctx.createLinearGradient(0, PLAY_TOP - 11, 0, PLAY_TOP - 1);
      hatch.addColorStop(0, "#2c5a92");
      hatch.addColorStop(.5, "#9fd7f2");
      hatch.addColorStop(1, "#1d4470");
      ctx.fillStyle = hatch;
      ctx.fillRect(doorX - halfW, PLAY_TOP - 11, halfW - slide, 10);
      ctx.fillRect(doorX + slide, PLAY_TOP - 11, halfW - slide, 10);
      if (door.open > .05) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#7de0ff";
        ctx.fillStyle = `rgba(125, 224, 255, ${door.open * .5})`;
        ctx.fillRect(doorX - slide, PLAY_TOP - 9, slide * 2, 6);
      }
      ctx.restore();
    });
  }

  function drawBricks() {
    bricks.forEach(brick => {
      if (!brick.alive) return;
      const base = brick.color;
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
      } else if (brick.silver) {
        ctx.strokeStyle = "rgba(255,255,255,.6)";
        ctx.beginPath();
        ctx.moveTo(brick.x + brick.w * .25, brick.y + 3);
        ctx.lineTo(brick.x + brick.w * .62, brick.y + brick.h - 3);
        ctx.stroke();
        if (brick.maxHp > 2) {
          ctx.fillStyle = "rgba(20,30,40,.65)";
          for (let i = 0; i < brick.hp - 1 && i < 4; i += 1) {
            ctx.fillRect(brick.x + 5 + i * 7, brick.y + brick.h - 6, 4, 3);
          }
        }
      }
      ctx.restore();
    });
  }

  function drawPaddle() {
    if (vausExplode > 0 || state === STATES.TITLE || state === STATES.STORY || state === STATES.ENDING) return;
    const activeColor = activePower === "L" ? "#ff526d" : activePower === "C" ? "#71f7a5" : "#70dfff";
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
    // Red bounce bands near the ends of the Vaus (authentic 3-zone cue).
    ctx.fillStyle = "#ff5c5c";
    ctx.fillRect(paddle.x + paddle.w * .14, paddle.y + 4, paddle.w * .1, paddle.h - 8);
    ctx.fillRect(paddle.x + paddle.w * .76, paddle.y + 4, paddle.w * .1, paddle.h - 8);
    ctx.fillStyle = activeColor;
    ctx.fillRect(paddle.x + 6, paddle.y + 5, 5, 8);
    ctx.fillRect(paddle.x + paddle.w - 11, paddle.y + 5, 5, 8);
    if (activePower === "L") {
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
      const def = CAPSULE_DEFS[capsule.type];
      const pulse = .78 + Math.sin(capsule.angle) * .18;
      ctx.save();
      ctx.translate(capsule.x, capsule.y);
      ctx.scale(1, pulse);
      ctx.shadowBlur = 12;
      ctx.shadowColor = def.color;
      const gradient = ctx.createLinearGradient(-21, 0, 21, 0);
      gradient.addColorStop(0, darken(def.color, 70));
      gradient.addColorStop(.48, def.color);
      gradient.addColorStop(1, darken(def.color, 80));
      ctx.fillStyle = gradient;
      roundRect(ctx, -22, -9, 44, 18, 9);
      ctx.fill();
      ctx.strokeStyle = lighten(def.color, 70);
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

  function drawEnemies() {
    enemies.forEach(enemy => {
      const t = enemy.type;
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.shadowBlur = 12;
      ctx.shadowColor = t.color;
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 2;

      if (t.key === "konerd") {
        // Cone — stacked rings narrowing upward.
        ctx.rotate(Math.sin(enemy.wobble) * .18);
        for (let i = 0; i < 4; i += 1) {
          const w = enemy.r * (1.5 - i * .3);
          const y = enemy.r * .7 - i * enemy.r * .45;
          ctx.fillStyle = i % 2 ? darken(t.color, 40) : t.color;
          ctx.beginPath();
          ctx.ellipse(0, y, w, enemy.r * .34, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = t.accent;
        ctx.beginPath();
        ctx.arc(0, -enemy.r * .78, enemy.r * .22, 0, Math.PI * 2);
        ctx.fill();
      } else if (t.key === "pyradok") {
        // Pyramid — rotating faceted diamond.
        ctx.rotate(enemy.spin * .6);
        ctx.fillStyle = t.color;
        ctx.beginPath();
        ctx.moveTo(0, -enemy.r);
        ctx.lineTo(enemy.r, 0);
        ctx.lineTo(0, enemy.r);
        ctx.lineTo(-enemy.r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = darken(t.color, 50);
        ctx.beginPath();
        ctx.moveTo(0, -enemy.r);
        ctx.lineTo(enemy.r, 0);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
      } else if (t.key === "trisphere") {
        // Three orbiting spheres.
        for (let i = 0; i < 3; i += 1) {
          const angle = enemy.spin + i * Math.PI * 2 / 3;
          const x = Math.cos(angle) * enemy.r * .55;
          const y = Math.sin(angle) * enemy.r * .55;
          const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, enemy.r * .52);
          g.addColorStop(0, t.accent);
          g.addColorStop(1, darken(t.color, 30));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, enemy.r * .52, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Opopo — wobbling bubble stack.
        for (let i = 0; i < 3; i += 1) {
          const y = enemy.r * .6 - i * enemy.r * .55;
          const w = enemy.r * (1 - i * .18) * (1 + Math.sin(enemy.wobble * 2 + i) * .12);
          ctx.fillStyle = i % 2 ? t.color : darken(t.color, 35);
          ctx.beginPath();
          ctx.ellipse(0, y, w, enemy.r * .42, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = t.accent;
        ctx.beginPath();
        ctx.arc(-enemy.r * .25, -enemy.r * .5, 2.6, 0, Math.PI * 2);
        ctx.arc(enemy.r * .25, -enemy.r * .5, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawDoh() {
    if (!doh) return;
    const qx = doh.quake > 0 ? (Math.random() - .5) * 6 : 0;
    const x = doh.x + qx;
    const y = doh.y;
    const w = doh.w;
    const h = doh.h;
    ctx.save();
    const hurtGlow = doh.hurt > 0 ? .55 : 0;
    ctx.shadowBlur = 26;
    ctx.shadowColor = doh.hurt > 0 ? "#ffd0c0" : "#a02818";

    // Head silhouette — chunky Moai slab.
    const g = ctx.createLinearGradient(x - w / 2, y, x + w / 2, y + h);
    g.addColorStop(0, "#8c2418");
    g.addColorStop(.45, "#c0402a");
    g.addColorStop(1, "#5c140c");
    ctx.fillStyle = g;
    roundRect(ctx, x - w / 2, y, w, h, 26);
    ctx.fill();
    ctx.strokeStyle = "#ffb090";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Topknot ridge + tapered crown (Moai silhouette)
    ctx.fillStyle = "#6c180e";
    ctx.fillRect(x - w * .3, y - 8, w * .6, 16);
    // Heavy brow ledge
    ctx.fillStyle = "#7a1c10";
    roundRect(ctx, x - w / 2 + 12, y + 30, w - 24, 30, 8);
    ctx.fill();
    ctx.fillStyle = "#5c120a";
    ctx.fillRect(x - w / 2 + 12, y + 54, w - 24, 6);
    // Deep eye sockets + glowing eyes under the brow
    ctx.fillStyle = "#3a0a04";
    ctx.fillRect(x - w * .34, y + 60, w * .26, 30);
    ctx.fillRect(x + w * .08, y + 60, w * .26, 30);
    const eyeGlow = .5 + Math.sin(performance.now() / 300) * .3 + hurtGlow;
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#ffe28a";
    ctx.fillStyle = `rgba(255, 226, 138, ${Math.min(1, eyeGlow)})`;
    ctx.fillRect(x - w * .29, y + 68, w * .16, 14);
    ctx.fillRect(x + w * .13, y + 68, w * .16, 14);
    ctx.restore();
    // Long Moai nose with flared base
    ctx.fillStyle = "#a83322";
    ctx.fillRect(x - 13, y + 58, 26, h * .34);
    ctx.fillRect(x - 26, y + 58 + h * .34 - 16, 52, 18);
    ctx.fillStyle = "#84271a";
    ctx.fillRect(x + 3, y + 58, 10, h * .34);
    // Cheek grooves
    ctx.fillStyle = "#5c120a";
    ctx.fillRect(x - w * .34, y + h * .5, 8, h * .26);
    ctx.fillRect(x + w * .34 - 8, y + h * .5, 8, h * .26);
    // Mouth — opens while firing.
    const mouthOpen = 8 + doh.mouth * 34;
    ctx.fillStyle = "#2a0602";
    roundRect(ctx, x - w * .22, y + h * .62 - mouthOpen / 2, w * .44, mouthOpen, 8);
    ctx.fill();
    if (doh.mouth > .1) {
      ctx.fillStyle = `rgba(255, 120, 60, ${doh.mouth})`;
      roundRect(ctx, x - w * .16, y + h * .62 - mouthOpen / 3, w * .32, mouthOpen * .66, 6);
      ctx.fill();
    }
    // Side pillars / ears
    ctx.fillStyle = "#6c180e";
    ctx.fillRect(x - w / 2 - 12, y + 44, 14, h * .52);
    ctx.fillRect(x + w / 2 - 2, y + 44, 14, h * .52);

    if (doh.hurt > 0) {
      ctx.globalAlpha = doh.hurt * .8;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, x - w / 2, y, w, h, 26);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // HP pips
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.font = "bold 15px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`DOH ${"▮".repeat(Math.max(0, doh.hp))}`, W / 2, y - 12);
    ctx.restore();
  }

  function drawDohShots() {
    dohShots.forEach(shot => {
      ctx.save();
      ctx.translate(shot.x, shot.y);
      ctx.rotate(shot.spin);
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#ff7a40";
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, shot.r + 2);
      g.addColorStop(0, "#ffe9c0");
      g.addColorStop(.5, "#ff9040");
      g.addColorStop(1, "#c03010");
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const angle = Math.PI * 2 * i / 8;
        const radius = i % 2 ? shot.r * .6 : shot.r + 2;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
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

  function drawStoryPanel(lines, heading, timer) {
    shade(.78);
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 26px monospace";
    ctx.fillStyle = "#ffd76a";
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#ff9a3c";
    ctx.fillText(heading, W / 2, 150);
    ctx.shadowBlur = 0;
    ctx.font = "bold 19px monospace";
    const visibleChars = Math.floor(timer * 34);
    let used = 0;
    lines.forEach((line, index) => {
      const show = Math.max(0, Math.min(line.length, visibleChars - used));
      used += line.length;
      ctx.fillStyle = "#d8ecf8";
      ctx.fillText(line.slice(0, show), W / 2, 216 + index * 34);
    });
    ctx.fillStyle = "#7bb5d9";
    ctx.font = "bold 15px monospace";
    if (Math.floor(timer * 2) % 2 === 0) ctx.fillText("CLICK / SPACE TO CONTINUE", W / 2, H - 96);
    ctx.restore();
  }

  function drawOverlay() {
    if (messageTimer > 0 && (state === STATES.PLAYING || state === STATES.WARPING)) {
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
      centered("THE 33 ARCADE SCREENS OF ARKANOID · FAITHFULLY REBUILT", 374, 17, "#7bb5d9");
      centered("7 CAPSULES · 4 ENEMIES · BREAK GATES · DOH AWAITS ON ROUND 33", 410, 15, "#ff8db0");
      centered(VERSION + " · REAL AMIGA MUSIC · GENUINE PAULA SFX", 442, 13, "#6589a5");
      centered("SELECT A CAMPAIGN OR PRESS SPACE FOR ARKANOID 33", 490, 20, "#e9fbff", true);
      centered("Konerd · Pyradok · Tri-Sphere · Opopo emerge from the top hatches.", 548, 15, "#83a2bb");
      centered("Catch capsules: Laser, Enlarge, Catch, Slow, Disruption, Break, Extra Vaus.", 574, 15, "#83a2bb");
    } else if (state === STATES.STORY) {
      drawStoryPanel(STORY_INTRO, "TAITO PRESENTS — ARKANOID", storyTimer);
    } else if (state === STATES.ENDING) {
      drawStoryPanel(STORY_ENDING, "CONGRATULATIONS — DOH IS DEFEATED", endingTimer);
      centered(`FINAL SCORE ${formatScore(score)}`, H - 140, 21, "#9fe9ff", true);
    } else if (state === STATES.CONTINUE) {
      shade(.7);
      centered("GAME OVER", H / 2 - 110, 42, "#ff657e", true);
      centered("CONTINUE?", H / 2 - 30, 34, "#fff", true);
      centered(String(Math.max(0, Math.ceil(continueTimer))), H / 2 + 46, 64, "#ffd76a", true);
      centered("CLICK / TAP / SPACE TO CONTINUE — SCORE RESETS (ARCADE RULE)", H / 2 + 118, 16, "#8bc9e9");
    } else if (state === STATES.PAUSED) {
      shade(.64);
      centered("PAUSED", H / 2 - 15, 42, "#fff", true);
      centered("PRESS P OR SPACE TO CONTINUE", H / 2 + 36, 17, "#8bc9e9");
    } else if (state === STATES.LEVEL_CLEAR) {
      shade(.48);
      if (doh && doh.hp <= 0) {
        centered("DOH DESTROYED", H / 2 - 10, 42, "#ffd76a", true);
      } else {
        centered("ROUND CLEAR", H / 2 - 10, 42, "#fff7b2", true);
        centered(`BONUS ${formatScore(1000 + lives * 250)}`, H / 2 + 42, 19, "#9fe9ff");
      }
    } else if (state === STATES.GAME_OVER) {
      shade(.7);
      centered("GAME OVER", H / 2 - 75, 48, "#ff657e", true);
      centered(`SCORE ${formatScore(score)}`, H / 2 - 17, 23, "#fff");
      centered(`HIGH  ${formatScore(highScore)}`, H / 2 + 20, 18, "#7cdcff");
      centered("CLICK / TAP OR PRESS SPACE FOR TITLE", H / 2 + 92, 18, "#e7f9ff", true);
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
    if (state !== STATES.PLAYING && state !== STATES.PAUSED) return;
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
    if (musicAllowed()) startMusic();
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
    startGame("arkanoid");
  });
  titleStorm?.addEventListener("click", () => {
    audio();
    primeSamples();
    startGame("storm");
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
    applyLogicalSize();
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
  applyLogicalSize();
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
      },
      // Arkanoid heritage hooks
      W: () => W,
      H: () => H,
      campaign: () => campaign,
      round: () => round,
      stages: ARKANOID_STAGES,
      bricks: () => bricks,
      balls: () => balls,
      enemies: () => enemies,
      capsules: () => capsules,
      doh: () => doh,
      dohShots: () => dohShots,
      breakGate: () => breakGate,
      activePower: () => activePower,
      lives: () => lives,
      score: () => score,
      applyCapsule,
      setRound: index => {
        round = Math.max(0, Math.min(ARKANOID_STAGES.length - 1, index));
        startRound();
      },
      skipStory: () => {
        if (state === STATES.STORY) { state = STATES.PLAYING; startRound(); }
      },
      releaseBalls
    };
  }
})();
