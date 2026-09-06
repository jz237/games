// Pure pixel kernels for the CINEMA 3D fighter banks, plus the idle-time
// queue that runs them. No "three", no DOM: everything here works on plain
// RGBA byte arrays so Node can test the maths and so a later Worker move is
// a transfer, not a rewrite.
//
// 5.1 (#40): until now every bank was built SYNCHRONOUSLY on the render
// thread the first frame a pose landed in it — bleed + normal map + smear +
// foot metrics over 1.64 M pixels, which measured as a hundreds-of-ms hitch
// on the first jab / first hit / first crouch of a 3D fight. The kernels now
// (a) do far less work (the bleed walks the silhouette FRONTIER instead of
// re-scanning the whole sheet seven times — the transparent interior of a
// 4x4 sheet is >70% of its pixels and never changes), and (b) run as steps
// on an IdleQueue that fighters.mjs drains between frames.

// --- Alpha bleed (RGB dilation) --------------------------------------------
// Floods each opaque pixel's colour outward into the transparent region so
// linear filtering at the sprite edge blends toward the character's own
// colours, not the white the sheets store under alpha 0 ("sticker fringe").
//
// Output is IDENTICAL to the old whole-sheet scan (tests/cinema-fighters
// pins it against a reference copy of that scan): each pass fills every
// unknown pixel that has a known 4-neighbour with the mean of those
// neighbours, reading only colours that were known BEFORE the pass. The
// only difference is which pixels get LOOKED AT: pass 0 scans once to find
// the frontier, and every later pass visits only the unknown neighbours of
// what the previous pass filled.
export function bleedPixels(data, w, h, passes = 7) {
  const n = w * h;
  const known = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) known[i] = data[i * 4 + 3] > 12 ? 1 : 0;
  // Pass-0 frontier: unknown pixels touching a known one.
  let frontier = [];
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      const i = row + x;
      if (known[i]) continue;
      if ((x > 0 && known[i - 1]) || (x < w - 1 && known[i + 1])
        || (y > 0 && known[i - w]) || (y < h - 1 && known[i + w])) frontier.push(i);
    }
  }
  const queued = new Int32Array(n).fill(-1); // pass index a pixel was queued for
  for (let pass = 0; pass < passes && frontier.length; pass += 1) {
    const filled = [];
    for (let f = 0; f < frontier.length; f += 1) {
      const i = frontier[f];
      const x = i % w;
      const y = (i - x) / w;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      if (x > 0 && known[i - 1]) { const p = (i - 1) * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; count += 1; }
      if (x < w - 1 && known[i + 1]) { const p = (i + 1) * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; count += 1; }
      if (y > 0 && known[i - w]) { const p = (i - w) * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; count += 1; }
      if (y < h - 1 && known[i + w]) { const p = (i + w) * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; count += 1; }
      if (!count) continue;
      const p = i * 4;
      data[p] = r / count;
      data[p + 1] = g / count;
      data[p + 2] = b / count;
      filled.push(i);
    }
    // Promote this pass's fills to known AFTER the pass (the reference scan
    // reads `known` from the previous pass throughout), then seed the next
    // frontier from their still-unknown neighbours.
    for (let f = 0; f < filled.length; f += 1) known[filled[f]] = 1;
    const next = [];
    for (let f = 0; f < filled.length; f += 1) {
      const i = filled[f];
      const x = i % w;
      const y = (i - x) / w;
      const consider = (j) => {
        if (known[j] || queued[j] === pass) return;
        queued[j] = pass;
        next.push(j);
      };
      if (x > 0) consider(i - 1);
      if (x < w - 1) consider(i + 1);
      if (y > 0) consider(i - w);
      if (y < h - 1) consider(i + w);
    }
    frontier = next;
  }
  return data;
}

// --- Height-from-luminance normal map ----------------------------------------
// Alpha-weighted so the silhouette edge produces strong outward normals: the
// sprite shader's directional rims are GATED by these (an edge must face its
// practical to catch it), so a flat map means no rims at all — this kernel is
// never skipped, only downsampled (`step` 2 on the balanced tier: a quarter
// of the work and of the GPU bytes, and the 3x3 blur already softens the
// field past what the step loses).
// Returns { data, width, height } RGBA bytes at (w/step, h/step).
export function normalPixels(src, w, h, { strength = 1.6, step = 1 } = {}) {
  const ow = Math.max(1, Math.floor(w / step));
  const oh = Math.max(1, Math.floor(h / step));
  const height = new Float32Array(ow * oh);
  if (step === 1) {
    for (let i = 0, p = 0; i < height.length; i += 1, p += 4) {
      height[i] = ((src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114) / 255) * (src[p + 3] / 255);
    }
  } else {
    const inv = 1 / (step * step);
    for (let y = 0; y < oh; y += 1) {
      for (let x = 0; x < ow; x += 1) {
        let sum = 0;
        for (let dy = 0; dy < step; dy += 1) {
          let p = ((y * step + dy) * w + x * step) * 4;
          for (let dx = 0; dx < step; dx += 1, p += 4) {
            sum += ((src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114) / 255) * (src[p + 3] / 255);
          }
        }
        height[y * ow + x] = sum * inv;
      }
    }
  }
  const blurred = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y += 1) {
    for (let x = 0; x < ow; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= oh) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= ow) continue;
          sum += height[yy * ow + xx];
          count += 1;
        }
      }
      blurred[y * ow + x] = sum / count;
    }
  }
  const data = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y += 1) {
    const y0 = Math.max(0, y - 1) * ow;
    const y1 = Math.min(oh - 1, y + 1) * ow;
    const row = y * ow;
    for (let x = 0; x < ow; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(ow - 1, x + 1);
      const dhdx = (blurred[row + x1] - blurred[row + x0]) * strength;
      const dhdy = (blurred[y1 + x] - blurred[y0 + x]) * strength;
      // CanvasTexture flipY makes v point up, so +dhdy (image-down) maps to +G.
      let nx = -dhdx;
      let ny = dhdy;
      const nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv;
      ny *= inv;
      const p = (row + x) * 4;
      data[p] = Math.round((nx * 0.5 + 0.5) * 255);
      data[p + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[p + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      data[p + 3] = 255;
    }
  }
  return { data, width: ow, height: oh };
}

// --- Per-cell silhouette metrics ---------------------------------------------
// For a columns x rows sprite sheet:
//   padBottom[frame] — fraction of the CELL height empty below the lowest
//                      opaque pixel (0 = the soles touch the cell edge);
//   feet[frame]      — 1-2 { u } sole-cluster centroids in -0.5..0.5 cell
//                      widths from the cell centre (sprite-local, pre-mirror);
//   extent[frame]    — { left, right, top, bottom } silhouette bounds:
//                      left/right in -0.5..0.5 cell widths, top/bottom as
//                      fractions of the cell height measured from the FLOOR
//                      (bottom === padBottom; top === 1 for a cell whose
//                      drawing reaches the cell's top edge). 5.1 (#44): the
//                      prone settle rotates this box to find where a lying
//                      body's lowest point actually is.
// Alpha > 96 throughout: the soft antialiased skirt the shader erodes away
// must not count as "the shoe touches here".
export function footMetricsFromPixels(data, w, h, columns = 4, rows = 4) {
  const cellW = Math.floor(w / columns);
  const cellH = Math.floor(h / rows);
  const count = columns * rows;
  const padBottom = new Float32Array(count);
  const feet = [];
  const extent = [];
  for (let frame = 0; frame < count; frame += 1) {
    const cx0 = (frame % columns) * cellW;
    const cy0 = Math.floor(frame / columns) * cellH;
    let footRow = -1;
    let topRow = -1;
    let leftCol = cellW;
    let rightCol = -1;
    for (let y = 0; y < cellH; y += 1) {
      const row = (cy0 + y) * w;
      let any = false;
      for (let x = 0; x < cellW; x += 1) {
        if (data[(row + cx0 + x) * 4 + 3] > 96) {
          any = true;
          if (x < leftCol) leftCol = x;
          if (x > rightCol) rightCol = x;
        }
      }
      if (!any) continue;
      if (topRow < 0) topRow = y;
      footRow = y;
    }
    if (footRow < 0) {
      padBottom[frame] = 0;
      feet.push([]);
      extent.push({ left: -0.5, right: 0.5, top: 1, bottom: 0 });
      continue;
    }
    padBottom[frame] = (cellH - 1 - footRow) / cellH;
    extent.push({
      left: leftCol / cellW - 0.5,
      right: (rightCol + 1) / cellW - 0.5,
      top: (cellH - topRow) / cellH,
      bottom: padBottom[frame],
    });
    // Opaque columns within the sole band (bottom ~5% of the sprite).
    const band = Math.max(3, Math.round(cellH * 0.045));
    const hits = [];
    for (let x = 0; x < cellW; x += 1) {
      let any = false;
      for (let y = Math.max(0, footRow - band); y <= footRow && !any; y += 1) {
        if (data[((cy0 + y) * w + cx0 + x) * 4 + 3] > 96) any = true;
      }
      if (any) hits.push(x);
    }
    // Cluster by gaps: a break wider than 6% of the cell splits the feet.
    const clusters = [];
    let start = hits[0];
    let prev = hits[0];
    for (let i = 1; i <= hits.length; i += 1) {
      const x = hits[i];
      if (x === undefined || x - prev > cellW * 0.06) {
        clusters.push({ mid: (start + prev) / 2, size: prev - start + 1 });
        start = x;
      }
      prev = x ?? prev;
    }
    clusters.sort((a, b) => b.size - a.size);
    feet.push(clusters.slice(0, 2).map((c) => ({ u: c.mid / cellW - 0.5 })));
  }
  return { padBottom, feet, extent };
}

// --- Idle-time step queue -----------------------------------------------------
// One bank build = several steps (pixels, bleed, smear, normal, HD). Steps
// run between frames — requestIdleCallback where it exists (with a timeout
// so a busy tab still progresses), setTimeout(0) elsewhere (iOS Safari has
// no rIC) — and a single callback keeps going only while the browser says
// there is idle time left, so a build never squats on a gameplay frame.
// Keys let a rig cancel everything it queued when it is disposed mid-build.
export class IdleQueue {
  constructor({ schedule = null, minSliceMs = 6 } = {}) {
    this.steps = [];
    this.scheduled = false;
    this.minSliceMs = minSliceMs;
    this.ran = 0;
    this.schedule = schedule || defaultSchedule;
  }

  get pending() {
    return this.steps.length;
  }

  push(fn, { key = null, priority = 0 } = {}) {
    // Stable priority order: lower runs first, FIFO within a priority.
    let at = this.steps.length;
    while (at > 0 && this.steps[at - 1].priority > priority) at -= 1;
    this.steps.splice(at, 0, { fn, key, priority });
    this.arm();
  }

  cancel(key) {
    const before = this.steps.length;
    this.steps = this.steps.filter((step) => step.key !== key);
    return before - this.steps.length;
  }

  arm() {
    // A step that pushes its successor (the bank chain) must not re-arm
    // from inside run(): the loop re-arms once when it is done.
    if (this.scheduled || this.running || !this.steps.length) return;
    this.scheduled = true;
    this.schedule((deadline) => this.run(deadline));
  }

  // Runs at least one step, then more while the deadline has slack.
  run(deadline = null) {
    this.scheduled = false;
    this.running = true;
    let slack = true;
    while (this.steps.length && slack) {
      const step = this.steps.shift();
      try {
        step.fn();
      } catch (error) {
        console.warn("CINEMA 3D bank step failed", error);
      }
      this.ran += 1;
      slack = Boolean(deadline && typeof deadline.timeRemaining === "function"
        && deadline.timeRemaining() > this.minSliceMs);
    }
    this.running = false;
    this.arm();
  }

  // Synchronous drain for QA hooks and tests ("warm everything NOW").
  drain() {
    this.running = true;
    while (this.steps.length) {
      const step = this.steps.shift();
      try {
        step.fn();
      } catch (error) {
        console.warn("CINEMA 3D bank step failed", error);
      }
      this.ran += 1;
    }
    this.running = false;
    return this.ran;
  }
}

function defaultSchedule(callback) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(callback, { timeout: 120 });
  } else {
    setTimeout(() => callback(null), 0);
  }
}
