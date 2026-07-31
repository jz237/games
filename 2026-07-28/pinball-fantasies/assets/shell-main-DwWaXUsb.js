/* empty css               */const n=""+new URL("party-land-thumb-Bkk2hIVw.webp",import.meta.url).href,r=""+new URL("speed-devils-thumb-CRL8Ut-m.webp",import.meta.url).href,i=""+new URL("gameshow-thumb-BDvt3cIa.webp",import.meta.url).href,d=""+new URL("stones-thumb-DEbrTsLH.webp",import.meta.url).href,o=[{id:"party-land",name:"Party Land",line:"Ducks, Cyclone, Puke & the Mad elephant",art:n,playable:!0},{id:"speed-devils",name:"Speed Devils",line:"Gears, overtakes, pit stops & turbo",art:r,playable:!0},{id:"billion-dollar-gameshow",name:"Billion Dollar Gameshow",line:"Six prizes, the wheel & the billion loop",art:i,playable:!0},{id:"stones-n-bones",name:"Stones 'n' Bones",line:"Ghosts, the Tower, the Well & the Vault",art:d,playable:!0}],s=document.querySelector("#app");if(s===null)throw new Error("Application root #app was not found.");document.title="Pinball Fantasies HD";document.body.classList.add("shell-mode");function p(e){const l=e.art===null?'<span class="table-card__art table-card__art--pending" aria-hidden="true">🦴</span>':`<img class="table-card__art" src="${e.art}" alt="" decoding="async" />`,t=e.playable?'<span class="table-card__status">Play</span>':'<span class="table-card__status table-card__status--soon">Coming soon</span>',a=`
    ${l}
    <span class="table-card__veil" aria-hidden="true"></span>
    <span class="table-card__label">
      <strong>${e.name}</strong>
      <span>${e.line}</span>
      ${t}
    </span>
  `;return e.playable?`<a class="table-card" href="?table=${e.id}">${a}</a>`:`<div class="table-card table-card--disabled" aria-disabled="true">${a}</div>`}s.innerHTML=`
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
      ${o.map(p).join("")}
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
      <p class="shell__build" title="Build 20260731T030619Z">
        v1.14.0 · build 20260731T030619Z
      </p>
    </footer>
  </div>
`;
