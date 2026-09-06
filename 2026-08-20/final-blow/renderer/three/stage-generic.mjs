// 3D stage for every stage id without a bespoke builder (vet / wildwood /
// buffet / cruise / janney). Graded backdrop card at depth + dark ground + a
// serviceable three-point night rig — and, since 5.3, PRACTICALS that answer
// the fight.
//
// 5.3 SPECTACLE (#16/#43): this file's update used to be an empty stub. Every
// ambient reaction 5.0 and 5.1 shipped (the Vet's floodlight swell and its
// fireworks, Wildwood's wheel and sign, the buffet's wok and pendants, the
// cruise deck's pool flash, Janney's sodium lamp) was drawn by
// drawStageAmbient, whose only caller sits inside game.js's `!cinema3dWorld`
// branch. Toggling CINEMA 3D therefore traded a living scene for a flat card
// with three lights, and a KO on the Vet had no swell at all.
//
// Now each stage carries its own practicals from engine/stage-practicals.mjs:
//   - an ADDITIVE EMISSIVE CARD pinned to the painted fixture on the plate
//     (the table's positions are the same 1280x720 plate coordinates the 2D
//     ambientGlow calls use, mapped through this backdrop's own size and
//     curvature — so the head lands on the floodlight, not near it);
//   - for the big ones, a POINT LIGHT pushed out in front of the plate, which
//     is what makes the asphalt and the fighters flare rather than a distant
//     decal brightening on its own;
//   - and, on the Vet and Wildwood, fireworks through a small points cloud on
//     exactly the shots the 2D pass fires (one on a big hit, two on a KO).
// Cost: 3-7 additive quads + 1 points cloud + up to 3 point lights per stage.
import * as THREE from "three";
import { canvasTexture, asphaltMaps, softDotTexture } from "./textures.mjs";
import { hash01 } from "./shared.mjs";
// 5.1 (#45): the sprite-light descriptor the fighter shader reads for this
// stage (rims / crown / floor bounce fitted to the plate) travels with the
// stage object; STAGE_MOOD below only lights the world, not the sprites.
import { spriteLightFor } from "./stage-lighting.mjs";
import {
  PLATE_H,
  PLATE_W,
  STAGE_PRACTICALS,
  fireworkShots,
  practicalLevel,
  practicalSpill,
} from "../../engine/stage-practicals.mjs";

const STAGE_MOOD = {
  vet: { key: 0xffd9a0, rim: 0xffb054, fog: 0x141008 },
  wildwood: { key: 0xaac8ff, rim: 0xff7fd4, fog: 0x0c1220 },
  buffet: { key: 0xffd0a0, rim: 0xff5f4a, fog: 0x140d08 },
  cruise: { key: 0xbfe4ff, rim: 0x62e8ff, fog: 0x0a1626 },
  janney: { key: 0xd8b8ff, rim: 0xff9a3c, fog: 0x120e18 },
};

// The backdrop card's geometry, in one place: the plate mapping below and the
// mesh build must not drift apart.
const PLATE = { width: 30, height: 16.9, x: 0, y: 4.6, z: -13.5, bend: 2, bendPower: 1.7 };
// Fireworks: 26 shell points per shot is enough to read as a burst at this
// depth and keeps the whole layer to one draw call.
const FIREWORK_POINTS = 26;
const FIREWORK_SHOTS = 2;

// Plate (1280x720 canvas px, the coordinates drawStageAmbient paints in) ->
// world. The z term reproduces the backdrop's own barrel bend so a card at
// the plate edge sits ON the curved plane instead of punching through it.
function plateToWorld(px, py, lift = 0.09) {
  const x = (px / PLATE_W - 0.5) * PLATE.width + PLATE.x;
  const y = PLATE.y + (0.5 - py / PLATE_H) * PLATE.height;
  const bend = -Math.pow(Math.abs(x) / (PLATE.width * 0.5), PLATE.bendPower) * PLATE.bend;
  return { x, y, z: PLATE.z + bend + lift };
}

function gradedBackdrop(image) {
  return canvasTexture(1280, 720, (ctx, w, h) => {
    if (image?.complete && image.naturalWidth) ctx.drawImage(image, 0, 0, w, h);
    else {
      ctx.fillStyle = "#0b0f1a";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "multiply";
    const grade = ctx.createLinearGradient(0, 0, 0, h);
    grade.addColorStop(0, "#6b7ba2");
    grade.addColorStop(0.6, "#948fa4");
    grade.addColorStop(1, "#544c60");
    ctx.fillStyle = grade;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    const vignette = ctx.createLinearGradient(0, 0, 0, h);
    vignette.addColorStop(0, "rgba(3,5,10,0.5)");
    vignette.addColorStop(0.4, "rgba(3,5,10,0)");
    vignette.addColorStop(1, "rgba(4,5,10,0.75)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: true });
}

export function buildGenericStage(host, { quality, stageId }) {
  const mood = STAGE_MOOD[stageId] || STAGE_MOOD.janney;
  const group = new THREE.Group();
  group.name = `stage-${stageId}`;
  const shadowSize = quality === "high" ? 2048 : 1024;
  const balanced = quality !== "high";

  const maps = asphaltMaps(0xbead + stageId.length * 977);
  maps.albedo.repeat.set(7, 2);
  maps.roughness.repeat.set(7, 2);
  maps.metalness.repeat.set(7, 2);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 13),
    new THREE.MeshStandardMaterial({
      map: maps.albedo,
      roughnessMap: maps.roughness,
      metalnessMap: maps.metalness,
      // 4.3: metalness 1 made the lot a black mirror of the night env map;
      // a mostly-dielectric asphalt reads its own albedo under the rig.
      roughness: 0.92,
      metalness: 0.2,
      envMapIntensity: 0.6,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -2.4);
  ground.receiveShadow = true;
  group.add(ground);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(PLATE.width, PLATE.height, 32, 6),
    // color > 1 (4.3): the baked night grade + vignette left these backdrops
    // near-black on real monitors; lift them ~45% before tone mapping.
    new THREE.MeshBasicMaterial({ map: gradedBackdrop(host.stageImages[stageId]), color: new THREE.Color(1.45, 1.45, 1.45) }),
  );
  const positions = backdrop.geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const nx = positions.getX(i) / (PLATE.width * 0.5);
    positions.setZ(i, -Math.pow(Math.abs(nx), PLATE.bendPower) * PLATE.bend);
  }
  backdrop.position.set(PLATE.x, PLATE.y, PLATE.z);
  group.add(backdrop);

  const key = new THREE.DirectionalLight(mood.key, 3.1);
  key.position.set(-5, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -2;
  key.shadow.bias = -0.0005;
  group.add(key);
  const rimLeft = new THREE.PointLight(mood.rim, 20, 10, 2);
  rimLeft.position.set(-6.2, 1.8, 1.3);
  group.add(rimLeft);
  const rimRight = new THREE.PointLight(mood.key, 15, 10, 2);
  rimRight.position.set(6.2, 2, 1.1);
  group.add(rimRight);
  // 0.55 -> 1.05 (4.3): lifts the fight plane out of the murk on the generic
  // night rigs without touching the practicals.
  const hemisphere = new THREE.HemisphereLight(0x2f4160, 0x14100a, 1.05);
  group.add(hemisphere);

  // --- 5.3 practicals -------------------------------------------------------
  const glowTexture = softDotTexture(96);
  const specs = STAGE_PRACTICALS[stageId] || [];
  const practicals = specs.map((spec, index) => {
    const at = plateToWorld(spec.x, spec.y);
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.w / PLATE_W * PLATE.width, spec.h / PLATE_H * PLATE.height),
      new THREE.MeshBasicMaterial({
        map: glowTexture,
        color: new THREE.Color(spec.color),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    card.position.set(at.x, at.y, at.z);
    card.renderOrder = 2;
    group.add(card);
    let light = null;
    // The balanced tier keeps only the spill lights that carry a stage's
    // headline reaction (the biggest budget on the stage), so a KO still
    // flares the asphalt at 2 extra lights instead of 4.
    const spillRank = specs.filter((other) => other.spill > 0)
      .sort((a, b) => b.spillGain - a.spillGain).indexOf(spec);
    if (spec.spill > 0 && (!balanced || spillRank < 2)) {
      // Pushed out of the plate toward the fight plane: the practical must
      // light the street, not just brighten a distant decal.
      const t = Math.min(0.92, spec.spill / Math.abs(PLATE.z));
      light = new THREE.PointLight(spec.color, 0, 18, 2);
      light.position.set(at.x * (1 - t * 0.72), Math.max(0.9, at.y * (1 - t * 0.5)), PLATE.z + spec.spill);
      group.add(light);
    }
    return { spec, card, light, index };
  });

  // Fireworks over the bowl / pier: one points cloud, both shots, seeded from
  // the pulse's latch tick so a replay puts the same shell in the same place.
  const fireworkPositions = new Float32Array(FIREWORK_SHOTS * FIREWORK_POINTS * 3);
  const fireworkColors = new Float32Array(FIREWORK_SHOTS * FIREWORK_POINTS * 3);
  const fireworkGeometry = new THREE.BufferGeometry();
  fireworkGeometry.setAttribute("position", new THREE.BufferAttribute(fireworkPositions, 3));
  fireworkGeometry.setAttribute("color", new THREE.BufferAttribute(fireworkColors, 3));
  const fireworks = new THREE.Points(fireworkGeometry, new THREE.PointsMaterial({
    size: 0.5,
    map: glowTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true,
    fog: false,
  }));
  fireworks.frustumCulled = false;
  fireworks.renderOrder = 3;
  fireworks.visible = false;
  group.add(fireworks);

  // Super-freeze dim, applied AFTER update() every frame (main.mjs order), so
  // a practical mid-flare still drops into the rim-lit silhouette.
  let dim = 0;
  // QA read: the strongest practical level this frame + how many fired.
  const report = { stage: stageId, practicals: practicals.length, peak: 0, lights: 0, fireworks: 0 };

  function updatePracticals(beat) {
    const surge = beat?.surge || null;
    const reaction = beat?.reaction || 0;
    const frame = surge?.frame ?? 0;
    const reduced = Boolean(surge?.reduced);
    // The crowd's own reaction is a floor under the surge: people roaring at
    // a 0.9 stir light the stage even between the discrete pulses (the 2D
    // pass folds `reaction` into the practicals the same way).
    const floor = Math.min(0.55, reaction * 0.4);
    const lifted = surge
      ? { ...surge, level: Math.max(surge.level, floor) }
      : { level: floor, age: -1, ko: false, hold: false };
    let peak = 0;
    let lit = 0;
    for (const { spec, card, light } of practicals) {
      // Flicker window matches the 2D stutter's: a new hash every 3 ticks.
      const hash = hash01(Math.floor(frame / 3) * 31 + spec.x + spec.y);
      const level = practicalLevel(spec, lifted, frame, hash, reduced);
      peak = Math.max(peak, level);
      card.material.opacity = Math.min(1, level * 0.55) * (1 - dim * 0.55);
      if (light) {
        light.intensity = practicalSpill(spec, level) * (1 - dim * 0.72);
        if (light.intensity > 0.01) lit += 1;
      }
    }
    report.peak = Number(peak.toFixed(3));
    report.lights = lit;
    return lifted;
  }

  function updateFireworks(surge) {
    const shots = fireworkShots(surge, surge?.latchTick ?? 0, stageId);
    if (!shots.length) {
      fireworks.visible = false;
      report.fireworks = 0;
      return;
    }
    fireworks.visible = true;
    report.fireworks = shots.length;
    for (let shot = 0; shot < FIREWORK_SHOTS; shot += 1) {
      const live = shots[shot] || null;
      for (let point = 0; point < FIREWORK_POINTS; point += 1) {
        const i = (shot * FIREWORK_POINTS + point) * 3;
        if (!live) {
          fireworkColors[i] = fireworkColors[i + 1] = fireworkColors[i + 2] = 0;
          continue;
        }
        // The 2D burst arcs over the bowl between plate x 300..980, y 60..170.
        const seed = live.seed * 7 + point * 13;
        const originX = 300 + hash01(live.seed) * 680;
        const originY = 60 + hash01(live.seed * 3 + 1) * 110;
        const angle = hash01(seed) * Math.PI * 2;
        const speed = 0.35 + hash01(seed + 5) * 0.65;
        const reach = live.progress * speed * 190;
        const at = plateToWorld(
          originX + Math.cos(angle) * reach,
          originY + Math.sin(angle) * reach * 0.8 + live.progress * live.progress * 70,
          0.35,
        );
        fireworkPositions[i] = at.x;
        fireworkPositions[i + 1] = at.y;
        fireworkPositions[i + 2] = at.z;
        // Warm gold shell cooling to red as it falls.
        const fade = Math.max(0, 1 - live.progress) * (0.5 + hash01(seed + 9) * 0.5);
        fireworkColors[i] = fade * 2.6;
        fireworkColors[i + 1] = fade * (1.5 + hash01(live.seed * 11) * 0.9);
        fireworkColors[i + 2] = fade * 0.6;
      }
    }
    fireworkGeometry.attributes.position.needsUpdate = true;
    fireworkGeometry.attributes.color.needsUpdate = true;
  }

  return {
    group,
    // Depth-graded: clear at the fight plane, thickening past mid-ground.
    fog: new THREE.Fog(mood.fog, 8.8, 27),
    background: new THREE.Color(0x05070d),
    keyLight: key,
    spriteLight: spriteLightFor(stageId),
    report: () => ({ ...report }),
    setDim(level) {
      dim = level;
      key.intensity = 3.1 * (1 - level * 0.72);
      key.shadow.intensity = 1 - level * 0.85;
      hemisphere.intensity = 1.05 * (1 - level * 0.6);
      rimLeft.intensity = 20 * (1 - level * 0.35);
      rimRight.intensity = 15 * (1 - level * 0.35);
      backdrop.material.color.setScalar(1.45 * (1 - level * 0.62));
    },
    // 5.3: a REAL update. `beat` is { surge, reaction } from main.mjs.
    update(timeSec, state, beat) {
      const surge = updatePracticals(beat);
      updateFireworks(surge);
    },
    dispose() {
      group.traverse((node) => {
        node.geometry?.dispose?.();
        if (node.material) {
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
        }
      });
    },
  };
}
