import{c as r}from"./global-leaderboard-5kBy31NQ.js";const i=""+new URL("party-land-thumb-Bkk2hIVw.webp",import.meta.url).href,o=""+new URL("speed-devils-thumb-CRL8Ut-m.webp",import.meta.url).href,d=""+new URL("gameshow-thumb-BDvt3cIa.webp",import.meta.url).href,p=""+new URL("stones-thumb-DEbrTsLH.webp",import.meta.url).href,n=[{id:"party-land",name:"Party Land",line:"Ducks, Cyclone, Puke & the Mad elephant",art:i,playable:!0},{id:"speed-devils",name:"Speed Devils",line:"Gears, overtakes, pit stops & turbo",art:o,playable:!0},{id:"billion-dollar-gameshow",name:"Billion Dollar Gameshow",line:"Six prizes, the wheel & the billion loop",art:d,playable:!0},{id:"stones-n-bones",name:"Stones 'n' Bones",line:"Ghosts, the Tower, the Well & the Vault",art:p,playable:!0}],l=document.querySelector("#app");if(l===null)throw new Error("Application root #app was not found.");document.title="Pinball Fantasies HD";document.body.classList.add("shell-mode");function c(a){const e=a.art===null?'<span class="table-card__art table-card__art--pending" aria-hidden="true">🦴</span>':`<img class="table-card__art" src="${a.art}" alt="" decoding="async" />`,t=a.playable?'<span class="table-card__status">Play</span>':'<span class="table-card__status table-card__status--soon">Coming soon</span>',s=`
    ${e}
    <span class="table-card__veil" aria-hidden="true"></span>
    <span class="table-card__label">
      <strong>${a.name}</strong>
      <span>${a.line}</span>
      <span class="table-card__champion" data-champion="${a.id}"></span>
      ${t}
    </span>
  `;return a.playable?`<a class="table-card" href="?table=${a.id}">${s}</a>`:`<div class="table-card table-card--disabled" aria-disabled="true">${s}</div>`}l.innerHTML=`
  <div class="shell">
    <header class="shell__masthead">
      <p class="eyebrow">Four tables · three balls · one quarter</p>
      <h1 class="shell__title">
        Pinball <span>Fantasies</span> <em>HD</em>
      </h1>
      <p class="shell__tag">
        The 1992 Digital Illusions classic, faithfully rebuilt for the
        browser — original rules, timing and scoring, new high-resolution
        art and sound.
      </p>
    </header>

    <div class="shell__tables">
      ${n.map(c).join("")}
    </div>

    <footer class="shell__foot">
      <p class="shell__keys">
        <kbd>Z</kbd>/<kbd>←</kbd> left flipper ·
        <kbd>/</kbd>/<kbd>→</kbd> right flipper ·
        <kbd>Space</kbd> pull plunger ·
        <kbd>X</kbd> nudge ·
        <kbd>P</kbd> pause ·
        <kbd>F1</kbd>–<kbd>F8</kbd> players
      </p>
      <p class="shell__note">
        A personal tribute build. Original game © 1992 Digital Illusions /
        21st Century Entertainment.
      </p>
      <p class="shell__build" title="Build 20260802T191302Z">
        v1.27.0 · build 20260802T191302Z
      </p>
    </footer>
  </div>
`;async function b(a){const e=l?.querySelector(`[data-champion="${a.id}"]`);if(!e)return;const t=r(`pinball-fantasies-${a.id}`),[s]=await t.fetchTop();if(s===void 0){e.textContent=t.status==="ready"?"No global score yet":"";return}e.textContent=`★ ${s.initials} · ${s.score.toLocaleString("en-US")}`,e.classList.add("table-card__champion--held")}for(const a of n)a.playable&&b(a);
