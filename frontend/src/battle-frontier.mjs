// Smooth, bounded frontier interpolation. Half-row caps preserve total territory area.
export function sampleFrontier(frontier, position) {
  const coordinate = Math.max(0, Math.min(frontier.length - 1, position - 0.5));
  const lower = Math.floor(coordinate);
  const upper = Math.min(frontier.length - 1, lower + 1);
  const t = coordinate - lower;
  const eased = t * t * (3 - 2 * t);
  return frontier[lower] + (frontier[upper] - frontier[lower]) * eased;
}

// Symmetric diffusion softens small notches without transferring area between teams.
export function softenFrontier(frontier, passes = 3) {
  let values = [...frontier];
  for (let pass = 0; pass < passes; pass++) {
    values = values.map((value, i) => value * .5 + values[Math.max(0, i - 1)] * .25 + values[Math.min(values.length - 1, i + 1)] * .25);
  }
  return values;
}
