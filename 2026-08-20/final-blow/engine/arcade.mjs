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
  const arcadeStages = ["somerset", "wildwood", "buffet", "janney", "cruise", "vet"];
  const stageOffset = Math.abs(Number(seed) || 0) % arcadeStages.length;
  const matches = challengers.map((opponentId, index) => Object.freeze({
    index,
    opponentId,
    kind: opponentId === rivalId ? "rival" : "challenger",
    label: opponentId === rivalId ? "RIVAL" : `BOUT ${index + 1}`,
    stage: arcadeStages[(stageOffset + index) % arcadeStages.length],
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

// ---------------------------------------------------------------------------
// Release 1.8 GRIND — arcade endings pass. Each fighter's single text card
// expands into a 3-panel resolution sequence. Panels reuse art the game
// already ships (the 4x4 specials atlas and the roster portrait) under CSS
// treatments — `art` picks the asset, `frame` addresses the atlas cell, and
// `treat` names the CSS grade the renderer applies. No new image assets.
// ---------------------------------------------------------------------------

const panel = (title, text, art, frame, treat) => Object.freeze({ title, text, art, frame, treat });

export const ARCADE_ENDING_PANELS = Object.freeze({
  deathblow: Object.freeze([
    panel("THE LAST BELL", "The Commissioner's ledger hit the parking lot before he did. DeathBlow stood over the cracked asphalt and let the silence do the counting.", "specials", 10, "night"),
    panel("THE GYM", "The hidden purse bought heavy bags, headgear, and a door that never locks. Every kid from Somerset learned the stance before the swing. Nobody pays dues to fight fair.", "portrait", 0, "work"),
    panel("THE GROUND REMEMBERS", "They still point at the cracks in the lot and tell the story wrong. DeathBlow doesn't correct them. The ground keeps the only record that matters.", "specials", 14, "dawn"),
  ]),
  jez: Object.freeze([
    panel("LIGHTS OUT", "Jez cut the power to the circuit with a sign-cutter and a smile. The last thing the Commissioner saw at the Vet was his own scoreboard going dark.", "specials", 10, "night"),
    panel("THE SHOP", "By week's end the shop had a waiting list: storefronts, barbershops, one very apologetic pretzel cart. Every sign went up free for anybody the circuit ever bled.", "portrait", 0, "work"),
    panel("CITY OF NEON", "Above the Vet lot a new blue-and-pink sign hums all night. It reads EVERYBODY GETS HOME. In this city, a good sign doesn't point — it leads.", "specials", 14, "dawn"),
  ]),
  alan: Object.freeze([
    panel("THE HEAVY HAND", "Allan didn't celebrate the knockout. He picked the Commissioner's keys off the concrete and weighed them like a decision he'd already made.", "specials", 10, "night"),
    panel("OPEN DOORS", "Every locked training room in South Philly opened the same morning. The hardest punch in the city spent it holding pads for rookies. Nobody laughed twice.", "portrait", 0, "work"),
    panel("WHAT'S LEFT STANDING", "They ask him what strength is. Allan points at the crowded gym floor, the noise, the bad footwork getting better. Strength is what you leave standing.", "specials", 14, "dawn"),
  ]),
  post: Object.freeze([
    panel("WET PAINT", "The black book made a terrible read and a beautiful primer. Post rolled the first coat across the arena wall before the crowd finished leaving.", "specials", 10, "night"),
    panel("FULL COVERAGE", "Names, dates, stolen wins — the whole ledger went up in color, forty feet tall and impossible to subpoena. The city's largest mural doesn't fade. It testifies.", "portrait", 0, "work"),
    panel("THE WALLS TALK", "Tour buses slow down on the boulevard now. Kids read the wall out loud to their parents. Post signs it the same way every time: THE WALLS FINALLY TOLD THE WHOLE STORY.", "specials", 14, "dawn"),
  ]),
  benny: Object.freeze([
    panel("BREAKER THROWN", "Benny found the arena's stolen feed in a junction box the Commissioner thought nobody could read. One rewire and the whole crooked grid went honest.", "specials", 10, "night"),
    panel("THE GRID ALIVE", "The El ran bright past midnight. Corner lights came back on blocks that had learned to live dark. A hundred rowhomes hummed like the city remembered their names.", "portrait", 0, "work"),
    panel("NO CLOSED CIRCUITS", "They offered him the utility's reward money. Benny asked for a ladder and a longer coil of wire. No circuit stays closed forever — not while he's holding the pliers.", "specials", 14, "dawn"),
  ]),
  donald: Object.freeze([
    panel("THE TROPHY", "The brass cup was loud, gaudy, and exactly his taste. Donald fired the Commissioner's entire ringside crew from the podium, alphabetically, savoring each one.", "specials", 10, "night"),
    panel("THE BACK NINE", "The private clubhouse became the loudest public driving range in Philadelphia. Tee time is free if you can prove the old circuit ever charged you anything.", "portrait", 0, "work"),
    panel("THE WALK HOME", "He tells everyone the range was a business decision. But the regulars notice he stays after close, picking up stray balls under the lights. The walk home was quiet.", "specials", 14, "dawn"),
  ]),
  cyraxx: Object.freeze([
    panel("SIGNAL FOUND", "The Commissioner's archive was buried under six passwords and a lie. Cyraxx streamed the whole thing raw — distorted, deafening, impossible to mute.", "specials", 10, "night"),
    panel("NO MORE BUFFERING", "Every screen from Kensington to South Philly carried the truth at full volume. The feedback squeal became the city's favorite ringtone out of pure spite.", "portrait", 0, "work"),
    panel("STILL LIVE", "The channel never went dark again. Cyraxx signs off every broadcast the same way, mic against the speaker: the signal was never lost. Only buried.", "specials", 14, "dawn"),
  ]),
  ali: Object.freeze([
    panel("LAST TRACK", "The final bell dropped like a bassline. Ali G grabbed the arena PA before security grabbed him, and the Vet became a venue whether it liked it or not.", "specials", 10, "night"),
    panel("BLOCK PARTY", "The party ran until the stadium lights gave out and three blocks past that. Nobody remembered the Commissioner's rules. Everybody remembered the chorus.", "portrait", 0, "work"),
    panel("KEEP THE BEAT", "He left the mic taped to the fence with a note: FOR WHOEVER'S NEXT. West Staines massive, Philly local. Give the block the mic and it never goes quiet.", "specials", 14, "dawn"),
  ]),
});

export function endingPanelsFor(playerId) {
  return ARCADE_ENDING_PANELS[playerId] || null;
}

// SF2-style credits roll data: the roster cast crawls first (the renderer
// joins these role lines with the live roster list), then the crew. All of it
// is plain data so tests can hold the contributor credits to account.
export const ARCADE_CREDITS = Object.freeze({
  heading: "FINAL BLOW",
  subheading: "PHILLY AFTER DARK",
  castTitle: "THE ROSTER",
  bossCredit: Object.freeze({ role: "AND THE COMMISSIONER AS", name: "KEEPER OF THE BLACK BOOK" }),
  crewTitle: "THE CREW",
  crew: Object.freeze([
    Object.freeze({ role: "CREATED BY", name: "JEZ" }),
    Object.freeze({ role: "GAME DIRECTION", name: "CLAW · THE OPENCLAW DESK" }),
    Object.freeze({ role: "ENGINEERING", name: "GAMEMAKER · THE AGENT FLEET" }),
    Object.freeze({ role: "FIGHTER & STAGE ART", name: "GPT-IMAGE" }),
    Object.freeze({ role: "MUSIC & SOUND", name: "ELEVENLABS" }),
    Object.freeze({ role: "QA BOT CREW", name: "HEADLESS CHROME · LOCAL 1280" }),
    Object.freeze({ role: "FILMED ON LOCATION IN", name: "PHILADELPHIA · WILDWOOD · INTERNATIONAL WATERS" }),
    Object.freeze({ role: "SPECIAL THANKS", name: "EVERY CORNER STORE THAT STAYED OPEN LATE" }),
  ]),
  finale: "EVERYBODY GETS HOME.",
});
