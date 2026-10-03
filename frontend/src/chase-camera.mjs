import { chasePoint } from './chase-motion.mjs';

export const RIDER_HALF_LENGTH = 1.4;
export function chaseRiderPoint(position, role, trackMeters = 520) {
  const point = chasePoint(position, trackMeters);
  // Logical positions are the police's front and the thief's rear: zero gap is actual contact.
  const offset = role === 'police' ? -RIDER_HALF_LENGTH : RIDER_HALF_LENGTH;
  return { ...point, x: point.x + point.tx * offset, z: point.z + point.tz * offset };
}

export function chasePressure(distance, trackMeters = 520) {
  const gap = Math.max(0, distance);
  return { gap, label: gap > 0 && gap < .1 ? '<0.1' : gap < 10 ? gap.toFixed(1) : String(Math.round(gap)),
    level: gap <= 6 ? 'danger' : gap <= 12 ? 'near' : 'normal',
    laps: Math.floor(gap / trackMeters) };
}

// The outside of the bend gives the riders a readable side profile instead of overlapping silhouettes.
export function chasePursuitFrame(policePosition, thiefPosition, aspect = 16 / 9, trackMeters = 520) {
  const police = chaseRiderPoint(policePosition, 'police', trackMeters), thief = chaseRiderPoint(thiefPosition, 'thief', trackMeters);
  const gap = Math.max(0, thiefPosition - policePosition), spread = Math.hypot(thief.x - police.x, thief.z - police.z);
  const midpoint = chasePoint((policePosition + thiefPosition) / 2, trackMeters);
  const tx = spread > .01 ? (thief.x - police.x) / spread : midpoint.tx;
  const tz = spread > .01 ? (thief.z - police.z) / spread : midpoint.tz;
  const direction = tz * midpoint.x - tx * midpoint.z >= 0 ? 1 : -1;
  const nx = tz * direction, nz = -tx * direction;
  const safeAspect = Math.max(.35, aspect);
  const distance = Math.max(9.2 + Math.min(.8, gap / 25), (spread + 4.6) / (2 * Math.tan(26 * Math.PI / 180) * safeAspect * .65));
  const center = { x: (police.x + thief.x) / 2, z: (police.z + thief.z) / 2 };
  // Long leads can put riders on opposite sides of the island or a whole lap apart.
  // Pull above the scenery in that case, while the distance display continues to use unwrapped metres.
  if (gap >= trackMeters / 4) {
    const altitude = Math.max(58, 64 / safeAspect);
    return { position: { x: 0, y: altitude, z: altitude * .55 }, look: { x: 0, y: 1, z: 0 }, gap, wide: true };
  }
  return {
    position: { x: center.x + nx * distance - tx * distance * .22, y: 3.4 + distance * .14, z: center.z + nz * distance - tz * distance * .22 },
    look: { x: center.x, y: 1.35, z: center.z }, gap, wide: false
  };
}
