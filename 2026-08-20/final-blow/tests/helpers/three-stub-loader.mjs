// Module-resolution hook: routes "three", "three/addons/*" and the vendored
// postprocessing modules to tests/helpers/three-stub.mjs so a Node test can
// import renderer/three/fighters.mjs and drive poseRig with a mock host.
// Registered by tests/cinema-fighters.test.mjs through module.register().
const STUB_URL = new URL("./three-stub.mjs", import.meta.url).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === "three" || specifier.startsWith("three/") || specifier.includes("/vendor/jsm/")) {
    return { url: STUB_URL, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
