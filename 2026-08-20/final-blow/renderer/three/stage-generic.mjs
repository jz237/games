// Fallback 3D stage used for any stage id without a bespoke builder yet
// (vet / wildwood / buffet / cruise / janney until their domain agents land).
// Graded backdrop card at depth + dark ground + a serviceable three-point
// night rig, so stage switching in 3D mode never breaks or goes black.
import * as THREE from "three";
import { canvasTexture, asphaltMaps } from "./textures.mjs";
// 5.1 (#45): the sprite-light descriptor the fighter shader reads for this
// stage (rims / crown / floor bounce fitted to the plate) travels with the
// stage object; STAGE_MOOD below only lights the world, not the sprites.
import { spriteLightFor } from "./stage-lighting.mjs";

const STAGE_MOOD = {
  vet: { key: 0xffd9a0, rim: 0xffb054, fog: 0x141008 },
  wildwood: { key: 0xaac8ff, rim: 0xff7fd4, fog: 0x0c1220 },
  buffet: { key: 0xffd0a0, rim: 0xff5f4a, fog: 0x140d08 },
  cruise: { key: 0xbfe4ff, rim: 0x62e8ff, fog: 0x0a1626 },
  janney: { key: 0xd8b8ff, rim: 0xff9a3c, fog: 0x120e18 },
};

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
    new THREE.PlaneGeometry(30, 16.9, 32, 6),
    // color > 1 (4.3): the baked night grade + vignette left these backdrops
    // near-black on real monitors; lift them ~45% before tone mapping.
    new THREE.MeshBasicMaterial({ map: gradedBackdrop(host.stageImages[stageId]), color: new THREE.Color(1.45, 1.45, 1.45) }),
  );
  const positions = backdrop.geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const nx = positions.getX(i) / 15;
    positions.setZ(i, -Math.pow(Math.abs(nx), 1.7) * 2);
  }
  backdrop.position.set(0, 4.6, -13.5);
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
  group.add(new THREE.HemisphereLight(0x2f4160, 0x14100a, 1.05));

  return {
    group,
    // Depth-graded: clear at the fight plane, thickening past mid-ground.
    fog: new THREE.Fog(mood.fog, 8.8, 27),
    background: new THREE.Color(0x05070d),
    keyLight: key,
    spriteLight: spriteLightFor(stageId),
    update() {},
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
