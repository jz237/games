export const ARCADE_BOSS_ID = "commissioner";

export const ARCADE_RIVALS = Object.freeze({
  deathblow: "alan",
  jez: "post",
  alan: "deathblow",
  post: "jez",
  benny: "donald",
  donald: "benny",
  cyraxx: "ali",
  ali: "cyraxx",
});

export const ARCADE_ENDINGS = Object.freeze({
  deathblow: Object.freeze({
    title: "THE GROUND REMEMBERS",
    quote: "THE LAST BELL RANG UNDER HIS FEET.",
    story: "DeathBlow broke the Commissioner's ledger, then poured its hidden purse into a neighborhood fight gym. Every crack in the old parking lot became a line no crooked promoter could cross again.",
    color: "#e52d2d",
  }),
  jez: Object.freeze({
    title: "CITY OF NEON",
    quote: "A GOOD SIGN DOES MORE THAN POINT. IT LEADS.",
    story: "Jez cut the power to the underground circuit and relit the block one storefront at a time. By dawn, a new blue-and-pink sign hung above the Vet lot: EVERYBODY GETS HOME.",
    color: "#14cbe8",
  }),
  alan: Object.freeze({
    title: "THE HEAVY HAND OPENS",
    quote: "STRENGTH IS WHAT YOU LEAVE STANDING.",
    story: "Allan took the Commissioner's keys and opened every locked training room in South Philly. The hardest punch in town became the first hand offered to every new fighter.",
    color: "#d8d8d8",
  }),
  post: Object.freeze({
    title: "FULL COVERAGE",
    quote: "THE WALLS FINALLY TOLD THE WHOLE STORY.",
    story: "Post covered the Commissioner's black book in color, names, and proof. By sunrise the city's largest mural belonged to the fighters whose victories had been erased.",
    color: "#e59b25",
  }),
  benny: Object.freeze({
    title: "THE GRID COMES ALIVE",
    quote: "NO CIRCUIT STAYS CLOSED FOREVER.",
    story: "Benny rerouted the arena's stolen power into the El, the corner lights, and a hundred dark rowhomes. The circuit was broken. The neighborhood was not.",
    color: "#416fe8",
  }),
  donald: Object.freeze({
    title: "THE BACK NINE",
    quote: "THE TROPHY WAS LOUD. THE WALK HOME WAS QUIET.",
    story: "Donald claimed the brass cup, fired the Commissioner's entire ringside crew, and converted the private clubhouse into the loudest public driving range in Philadelphia.",
    color: "#f1bd26",
  }),
  cyraxx: Object.freeze({
    title: "NO MORE BUFFERING",
    quote: "THE SIGNAL WAS NEVER LOST. ONLY BURIED.",
    story: "Cyraxx fed the Commissioner's archive into every screen and speaker from Kensington to South Philly. The truth arrived distorted, deafening, and impossible to mute.",
    color: "#54cf42",
  }),
  ali: Object.freeze({
    title: "WEST STAINES MASSIVE",
    quote: "KEEP THE BEAT. GIVE THE BLOCK THE MIC.",
    story: "Ali G turned the final arena into a block party that lasted until the stadium lights went dark. Nobody remembered the Commissioner's rules. Everybody remembered the chorus.",
    color: "#f4d21f",
  }),
});

function hashText(text) {
  let hash = 2166136261;
  for (const character of String(text)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffle(items, seed) {
  const result = [...items];
  let value = hashText(seed) || 0x9e3779b9;
  for (let index = result.length - 1; index > 0; index -= 1) {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    const swap = (value >>> 0) % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function createArcadeRun(playerId, fighterIds, seed = 0) {
  const roster = [...new Set(fighterIds)].filter((id) => id !== ARCADE_BOSS_ID);
  if (!roster.includes(playerId)) throw new Error(`Unknown arcade fighter: ${playerId}`);
  const rivalId = ARCADE_RIVALS[playerId];
  const challengers = shuffle(
    roster.filter((id) => id !== playerId && id !== rivalId),
    `${playerId}:${seed}`,
  );
  if (rivalId && roster.includes(rivalId)) challengers.push(rivalId);
  const matches = challengers.map((opponentId, index) => Object.freeze({
    index,
    opponentId,
    kind: opponentId === rivalId ? "rival" : "challenger",
    label: opponentId === rivalId ? "RIVAL" : `BOUT ${index + 1}`,
    stage: index % 2 === 0 ? "kensington" : "vet",
  }));
  matches.push(Object.freeze({
    index: matches.length,
    opponentId: ARCADE_BOSS_ID,
    kind: "boss",
    label: "FINAL BOUT",
    stage: "vet",
  }));
  return {
    playerId,
    rivalId,
    seed,
    current: 0,
    wins: 0,
    losses: 0,
    completed: false,
    matches,
    defeated: [],
  };
}

export function currentArcadeMatch(run) {
  return run?.matches?.[run.current] || null;
}

export function recordArcadeResult(run, playerWon) {
  const match = currentArcadeMatch(run);
  if (!match || run.completed) return { match, advanced: false, completed: Boolean(run?.completed) };
  if (!playerWon) {
    run.losses += 1;
    return { match, advanced: false, completed: false };
  }
  run.defeated.push(match.opponentId);
  run.wins += 1;
  run.current += 1;
  run.completed = run.current >= run.matches.length;
  return { match, advanced: true, completed: run.completed };
}

export function arcadeRunSnapshot(run) {
  if (!run) return null;
  return {
    playerId: run.playerId,
    rivalId: run.rivalId,
    seed: run.seed,
    current: run.current,
    wins: run.wins,
    losses: run.losses,
    completed: run.completed,
    defeated: [...run.defeated],
    currentMatch: currentArcadeMatch(run),
    matches: run.matches.map((match) => ({ ...match })),
  };
}

export function getArcadeEnding(playerId) {
  return ARCADE_ENDINGS[playerId] || null;
}
