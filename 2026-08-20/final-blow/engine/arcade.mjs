export const ARCADE_BOSS_ID = "commissioner";

// Wave 17: ten fighters, five pairs. The Devil takes Cyraxx (the internet
// cryptid versus the real one), which frees Ali G for the Commissioner —
// authority versus the loudest mouth it ever banned. Ali's rival never
// appears mid-ladder (the boss is excluded from the challenger pool), so his
// grudge match IS the FINAL BOUT.
export const ARCADE_RIVALS = Object.freeze({
  deathblow: "alan",
  jez: "post",
  alan: "deathblow",
  post: "jez",
  benny: "donald",
  donald: "benny",
  cyraxx: "devil",
  devil: "cyraxx",
  ali: "commissioner",
  commissioner: "ali",
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
  // Wave 17: the native son takes the long flight home.
  devil: Object.freeze({
    title: "THE PINES ANSWER",
    quote: "SOME LEGENDS COLLECT DEBTS IN PERSON.",
    story: "The Pinelands Devil tore its page from the black book and nailed it to a pitch pine at the Wildwood line. Every fighter the circuit ever swallowed got walked home through the barrens — and nothing followed them out.",
    color: "#7fae5a",
  }),
  // Wave 16: the secret ninth ending — the Commissioner reclaims his own book.
  commissioner: Object.freeze({
    title: "THE BOOK STAYS OPEN",
    quote: "EVERY CITY GETS THE KEEPER IT DESERVES.",
    story: "The Commissioner crossed out every name in the book, then met the thing wearing his coat at the Vet and closed that account too. At dawn the ledger lay open on the fifty-yard line — blank, waiting for new names.",
    color: "#d6b56b",
  }),
});

// ---------------------------------------------------------------------------
// R2.0 FAMILY wave 16 — pre-fight dialogue exchanges. Pure data beside the
// endings: rollback checksums never see any of it, and the intro presenter in
// game.js picks a variant with visualRandom (no-repeat) at match start.
// Every exchange is exactly two spoken cards; the first entry opens, the
// second claps back. Rival pairs are keyed on the sorted pair id so both
// directions of the rivalry share one authored conversation.
// ---------------------------------------------------------------------------

const exchange = (firstId, firstLine, secondId, secondLine) => Object.freeze([
  Object.freeze({ id: firstId, line: firstLine }),
  Object.freeze({ id: secondId, line: secondLine }),
]);

export const ARCADE_RIVAL_DIALOGUE = Object.freeze({
  "alan:deathblow": Object.freeze([
    exchange("deathblow", "THIS BLOCK ONLY CARRIES ONE HEAVYWEIGHT.", "alan", "YEAH. ME. ALWAYS BEEN ME."),
    exchange("alan", "YOUSE SHOOK THE GROUND. I SHOOK THE PEOPLE.", "deathblow", "THE GROUND VOTES LAST."),
    exchange("deathblow", "I POURED THE FOUNDATION YOU STAND ON.", "alan", "AND I'LL DROP YA RIGHT ON IT."),
  ]),
  "jez:post": Object.freeze([
    exchange("post", "YOUR SIGNS COME DOWN WITH ONE COAT, JEZ.", "jez", "MY SIGNS RUN ON POWER. YOURS RUN."),
    exchange("jez", "YOU TAGGED MY SHOP WINDOW, POST.", "post", "CONSIDER IT A FREE UPGRADE."),
    exchange("post", "THE CITY READS MY WALLS, NOT YOUR NEON.", "jez", "ONLY 'CAUSE MY LIGHT'S SHINING ON THEM."),
  ]),
  "benny:donald": Object.freeze([
    exchange("donald", "I BUY GUYS LIKE YOU BY THE DOZEN, BENNY.", "benny", "THEN YOU GOT ROBBED ON THE PRICE."),
    exchange("benny", "YOUR TOWER'S WIRED WRONG, DONALD. ALL OF IT.", "donald", "IT'S GOLD-PLATED. GOLD DOESN'T FAIL."),
    exchange("donald", "NOBODY KNOWS VOLTAGE BETTER THAN ME.", "benny", "HOLD THIS WIRE AND SAY THAT AGAIN."),
  ]),
  // Wave 17: the trickster hunts the cryptid — Cyraxx has been trying to get
  // the Jersey Devil on stream for years, and now it walked out of the pines.
  "cyraxx:devil": Object.freeze([
    exchange("cyraxx", "I'VE BEEN HUNTING YOU FOR SIX SEASONS, DEVIL!", "devil", "AND THE PINES WERE HUNTING YOU BACK."),
    exchange("devil", "TURN THE CAMERA OFF, GREMLIN.", "cyraxx", "HEHEHE... THE CHAT SAYS MAKE HIM SCREECH."),
    exchange("cyraxx", "YOU'RE JUST A GUY IN A SUIT! PROBABLY!", "devil", "COUNT MY TOES AND SAY THAT AGAIN."),
  ]),
  // Wave 17: Ali G versus the man who banned him from every venue in the
  // book. The pairing pays off at the FINAL BOUT — no mid-ladder rival beat.
  "ali:commissioner": Object.freeze([
    exchange("commissioner", "YOU ARE BANNED FROM THIS BUILDING, MR. G.", "ali", "CAN'T BAN ME BRUV, I'M THE MAIN EVENT."),
    exchange("ali", "ME MASSIVE VOTED YOU OUT, COMMISSIONER.", "commissioner", "THE BOOK DOES NOT HOLD ELECTIONS."),
    exchange("commissioner", "THIS COURT RECOGNIZES NO 'BOOYAKASHA'.", "ali", "IT WELL DOES NOW. BOOYAKASHA."),
  ]),
});

// One authored exchange pool per challenger for the FINAL BOUT — the
// Commissioner opens, the challenger answers. The mirror entry covers the
// unlocked-Commissioner run meeting his own reflection.
export const ARCADE_BOSS_DIALOGUE = Object.freeze({
  deathblow: Object.freeze([
    exchange("commissioner", "YOU CRACKED MY PARKING LOT, DEMOLITION MAN.", "deathblow", "TONIGHT I CRACK THE BOOK."),
    exchange("commissioner", "YOUR PURSE WAS NEVER LEAVING THE VET.", "deathblow", "NEITHER ARE YOU."),
  ]),
  jez: Object.freeze([
    exchange("commissioner", "YOUR LITTLE SIGN SHOP OWES ME RENT, JEZ.", "jez", "READ THE NEW SIGN: PAID IN FULL."),
    exchange("commissioner", "I DECIDE WHO LIGHTS UP THIS CITY.", "jez", "FUNNY. I HOLD THE BREAKER."),
  ]),
  alan: Object.freeze([
    exchange("commissioner", "EVERY WIN YOU EVER HAD, I SOLD TWICE.", "alan", "THEN YOUSE OWE ME MONEY AND AN APOLOGY."),
    exchange("commissioner", "SOUTH PHILLY BELONGS TO THE BOOK.", "alan", "SOUTH PHILLY BELONGS TO SOUTH PHILLY."),
  ]),
  post: Object.freeze([
    exchange("commissioner", "YOUR MURALS COME DOWN TOMORROW, VANDAL.", "post", "CAN'T DEMOLISH WHAT THE CITY MEMORIZED."),
    exchange("commissioner", "I HAVE A PAGE HERE WITH YOUR NAME ON IT.", "post", "I GOT A WALL WITH YOURS. FORTY FEET TALL."),
  ]),
  benny: Object.freeze([
    exchange("commissioner", "THE ARENA POWER RUNS THROUGH MY METER, BENNY.", "benny", "CHECK AGAIN. I REROUTED IT AN HOUR AGO."),
    exchange("commissioner", "CAREFUL, TECHNICIAN. CONTRACTS BITE.", "benny", "SO DO LIVE WIRES."),
  ]),
  donald: Object.freeze([
    exchange("commissioner", "YOUR MEMBERSHIP IS REVOKED, MR. TRUMP.", "donald", "WRONG. I'M BUYING THE WHOLE LEAGUE."),
    exchange("commissioner", "THE TROPHY STAYS IN MY OFFICE.", "donald", "YOUR OFFICE IS MY NEW PRO SHOP."),
  ]),
  cyraxx: Object.freeze([
    exchange("commissioner", "YOUR BROADCAST DIES TONIGHT, GREMLIN.", "cyraxx", "HEHEHE... I'M ALREADY LIVE, OLD MAN."),
    exchange("commissioner", "NOBODY STREAMS MY LEDGER.", "cyraxx", "SIX PASSWORDS. TOOK ME SIX MINUTES."),
  ]),
  ali: Object.freeze([
    exchange("commissioner", "THIS IS A COURTROOM, NOT A CONCERT.", "ali", "WRONG. IT'S A BLOCK PARTY NOW, INNIT."),
    exchange("commissioner", "RESPECT THE AUTHORITY, MR. G.", "ali", "RESPEK IS EARNED, BRUV. SWING THAT CANE."),
  ]),
  // Wave 17: the Devil's FINAL BOUT — the Keeper has no page for folklore.
  devil: Object.freeze([
    exchange("commissioner", "THERE IS NO PAGE FOR YOU IN MY BOOK, CREATURE.", "devil", "THE PINES KEPT THEIR OWN LEDGER. YOU'RE IN IT."),
    exchange("commissioner", "JERSEY FIGHTERS PAY DOUBLE IN PHILADELPHIA.", "devil", "COLLECT IT YOURSELF. BRING A LANTERN."),
  ]),
  commissioner: Object.freeze([
    exchange("commissioner", "AN IMPOSTOR IN MY OWN COAT.", "commissioner", "THE BOOK RECOGNIZES ONLY ONE HAND."),
    exchange("commissioner", "COURT IS IN SESSION. BOTH GAVELS.", "commissioner", "ONLY ONE OF US ADJOURNS."),
  ]),
});

const pairKey = (firstId, secondId) => [firstId, secondId].sort().join(":");

/** All authored variants for a rival pairing, order-normalized data. */
export function rivalDialogueVariants(playerId, opponentId) {
  return ARCADE_RIVAL_DIALOGUE[pairKey(playerId, opponentId)] || null;
}

/** All authored variants for a challenger's FINAL BOUT exchange. */
export function bossDialogueVariants(challengerId) {
  return ARCADE_BOSS_DIALOGUE[challengerId] || null;
}

export function auditArcadeDialogue(fighterIds = Object.keys(ARCADE_BOSS_DIALOGUE)) {
  const errors = [];
  for (const [key, variants] of Object.entries(ARCADE_RIVAL_DIALOGUE)) {
    const [firstId, secondId] = key.split(":");
    if (pairKey(firstId, secondId) !== key) errors.push(`${key}: pair key not sorted`);
    if (ARCADE_RIVALS[firstId] !== secondId || ARCADE_RIVALS[secondId] !== firstId) errors.push(`${key}: not a rival pair`);
    if (!variants?.length || variants.length < 2) errors.push(`${key}: needs 2+ variants`);
    for (const variant of variants || []) {
      if (variant.length !== 2) errors.push(`${key}: exchange must be two lines`);
      for (const card of variant) {
        if (![firstId, secondId].includes(card.id)) errors.push(`${key}: speaker ${card.id} outside pair`);
        if (!card.line || card.line !== card.line.toUpperCase()) errors.push(`${key}: line must be caption-cased`);
      }
    }
  }
  for (const challengerId of fighterIds) {
    const variants = ARCADE_BOSS_DIALOGUE[challengerId];
    if (!variants?.length || variants.length < 2) {
      errors.push(`${challengerId}: needs 2+ boss exchanges`);
      continue;
    }
    for (const variant of variants) {
      if (variant.length !== 2) errors.push(`${challengerId}: exchange must be two lines`);
      if (variant[0].id !== ARCADE_BOSS_ID) errors.push(`${challengerId}: the Commissioner opens the final bout`);
      if (variant[1].id !== challengerId) errors.push(`${challengerId}: the challenger answers`);
    }
  }
  return { rivalPairs: Object.keys(ARCADE_RIVAL_DIALOGUE).length, bossExchanges: Object.keys(ARCADE_BOSS_DIALOGUE).length, errors };
}

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
  // Wave 16: the unlocked Commissioner climbs his own book — all eight names
  // crossed out in shuffled order, no rival beat, then a boss-mirror FINAL
  // BOUT at the Vet against the "real" Keeper.
  const bossRun = playerId === ARCADE_BOSS_ID;
  if (!bossRun && !roster.includes(playerId)) throw new Error(`Unknown arcade fighter: ${playerId}`);
  const rivalId = bossRun ? null : ARCADE_RIVALS[playerId];
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
  // Wave 17: the tenth resolution — South Jersey's native son goes home.
  devil: Object.freeze([
    panel("LAST CALL AT THE VET", "The Commissioner reached for a page that was never written. The Devil reached back. What the crowd remembers is the screech; what the book remembers is the talon through its spine.", "specials", 10, "night"),
    panel("THE WALK HOME", "One by one, every fighter the circuit swallowed got an escort through the barrens — hooves in the sand behind them, wings overhead, nothing daring to follow. Even the ones who'd thrown hands at it. Especially those.", "portrait", 0, "work"),
    panel("THE PINES ANSWER", "At the Wildwood line a single black-book page hangs nailed to a pitch pine, and the locals leave it alone. Some legends collect debts in person. This one collects them for the whole state.", "specials", 14, "dawn"),
  ]),
  // Wave 16: the secret ninth resolution.
  commissioner: Object.freeze([
    panel("EVERY NAME", "He worked the ladder the way he works a ledger: top to bottom, no skipped lines. Eight fighters signed the book in their own blood tonight.", "specials", 10, "night"),
    panel("THE IMPOSTOR", "At the Vet something in his own coat was holding his own cane. The city watched two keepers argue jurisdiction until only one set of footprints left the lot.", "portrait", 0, "work"),
    panel("THE BOOK STAYS OPEN", "He set the ledger on the fifty-yard line and left it there, open. Blank. Every city gets the keeper it deserves — and this one earned him twice.", "specials", 14, "dawn"),
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
