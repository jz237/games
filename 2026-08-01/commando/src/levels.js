// levels.js — the campaign: three areas, then it loops harder.
import { AREA1 } from './level1.js';
import { AREA2 } from './level2.js';
import { AREA3 } from './level3.js';

export const AREAS = [AREA1, AREA2, AREA3];

// lighting & weather per area
export const AMBIENCE = {
  day: {
    sunDir: [-0.62, 0.72, 0.3], sunColor: '#ffe0b0', sun: 3.1,
    hemiSky: '#c4d8ee', hemiGround: '#6a5840', hemi: 0.95,
    fog: '#b9b39a', fogNear: 55, fogFar: 140, exposure: 1.05, env: 0.55,
    sky: { zen: [0.26, 0.42, 0.72], hor: [0.95, 0.82, 0.62], gnd: [0.22, 0.18, 0.12], glow: [1.6, 1.2, 0.7] },
    grade: { shadow: [0.93, 0.98, 1.07], hi: [1.05, 1.0, 0.92], sat: 1.08, vig: 0.32 },
    water: '#3a6356', bloom: 0.5,
  },
  'dusk-rain': {
    sunDir: [-0.84, 0.42, 0.22], sunColor: '#ffb07a', sun: 2.2,
    hemiSky: '#8a96b4', hemiGround: '#3c3228', hemi: 1.0,
    fog: '#666878', fogNear: 36, fogFar: 118, exposure: 1.24, env: 0.7,
    sky: { zen: [0.16, 0.2, 0.34], hor: [0.85, 0.5, 0.36], gnd: [0.14, 0.12, 0.1], glow: [1.9, 0.9, 0.45] },
    grade: { shadow: [0.9, 0.96, 1.1], hi: [1.08, 0.98, 0.9], sat: 1.02, vig: 0.4 },
    water: '#34504e', bloom: 0.6, rain: true, wet: 1,
  },
  night: {
    sunDir: [-0.45, 0.8, 0.35], sunColor: '#a8bcff', sun: 1.35,
    hemiSky: '#40548a', hemiGround: '#1a1814', hemi: 1.15,
    fog: '#121a2a', fogNear: 34, fogFar: 115, exposure: 1.55, env: 0.6,
    sky: { zen: [0.05, 0.08, 0.2], hor: [0.16, 0.2, 0.34], gnd: [0.03, 0.03, 0.03], glow: [0.7, 0.8, 1.1] },
    grade: { shadow: [0.86, 0.95, 1.16], hi: [1.04, 1.0, 0.94], sat: 0.95, vig: 0.42 },
    water: '#26403c', bloom: 0.75, night: true, wet: 0.4,
  },
};
