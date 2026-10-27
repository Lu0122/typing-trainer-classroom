<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { sampleFrontier, softenFrontier } from './battle-frontier.mjs';

const GRID_COLUMNS = 36;
const GRID_ROWS = 18;
const WORLD_WIDTH = 120;
const WORLD_HEIGHT = 52;
const CELL_WIDTH = WORLD_WIDTH / GRID_COLUMNS;
const CELL_HEIGHT = WORLD_HEIGHT / GRID_ROWS;
const INITIAL_FRONTIER = [18, 19, 17, 20, 16, 18, 19, 17, 18, 17, 18, 19, 17, 20, 16, 18, 19, 18];
const RED = new THREE.Color('#ff2f53');
const RED_DARK = new THREE.Color('#ff6b7a');
const BLUE = new THREE.Color('#118cff');
const BLUE_LIGHT = new THREE.Color('#25d8ff');

const props = defineProps({
  teams: { type: Object, default: () => ({ red: { area: 50 }, blue: { area: 50 } }) },
  territory: { type: Object, default: () => ({ frontier: [18, 19, 17, 20, 16, 18, 19, 17, 18, 17, 18, 19, 17, 20, 16, 18, 19, 18] }) },
  players: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
  attackPulse: { type: String, default: '' }
});

const host = ref(null);
let scene;
let camera;
let renderer;
let resizeObserver;
let animationFrame;
let reducedMotion = false;
let grid;
let frontierLine;
let frontierGlow;
let cells = [];
let territorySurfaces = [];
let smoothFrontier = [...INITIAL_FRONTIER];
const FRONTIER_SAMPLES = GRID_ROWS * 12 + 1;
let playerSprites = [];
let playerLabels = [];
let playerTanks = new Map();
let activeRunners = [];
let projectiles = [];
let explosions = [];
let muzzleFlashes = [];
let scorchMarks = [];
let cellDelays = new Map();
let seenEvents = new Set();
let eventHydrated = false;
let visualFrontier = [...INITIAL_FRONTIER];
let targetFrontier = [...INITIAL_FRONTIER];
let lastFrame = 0;
let textureCache = new Map();
let impactShake = 0;
const keyOf = (row, column) => `${row}:${column}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const colorFor = (team) => team === 'red' ? RED : BLUE;
const lightColorFor = (team) => team === 'red' ? RED_DARK : BLUE_LIGHT;
const frontierX = (columns) => -WORLD_WIDTH / 2 + columns * CELL_WIDTH;
const cellX = (column) => -WORLD_WIDTH / 2 + (column + 0.5) * CELL_WIDTH;
const cellY = (row) => -WORLD_HEIGHT / 2 + (row + 0.5) * CELL_HEIGHT;

function stableNumber(value, salt = 0) {
  let hash = 2166136261 ^ salt;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return ((hash >>> 0) % 10000) / 10000;
}

function tankBounds(team, y) {
  const row = clamp(Math.floor((y + WORLD_HEIGHT / 2) / CELL_HEIGHT), 0, GRID_ROWS - 1);
  const border = frontierX(visualFrontier[row] ?? GRID_COLUMNS / 2);
  return team === 'red'
    ? { min: -WORLD_WIDTH / 2 + 6, max: Math.max(-WORLD_WIDTH / 2 + 10, border - 7) }
    : { min: Math.min(WORLD_WIDTH / 2 - 10, border + 7), max: WORLD_WIDTH / 2 - 6 };
}

function chooseTankTarget(tank, time = 0) {
  const randomY = -WORLD_HEIGHT / 2 + 7 + stableNumber(`${tank.id}:${time}:${tank.moves}`, tank.moves) * (WORLD_HEIGHT - 14);
  const bounds = tankBounds(tank.team, randomY);
  tank.targetY = randomY;
  tank.targetX = bounds.min + stableNumber(`${tank.id}:x:${time}:${tank.moves}`, tank.moves + 17) * Math.max(1, bounds.max - bounds.min);
  tank.moves += 1;
}

function currentFrontier() {
  const source = props.territory?.frontier;
  return Array.isArray(source) && source.length === GRID_ROWS ? source.map((value) => clamp(Number(value) || 0, 0, GRID_COLUMNS)) : [...INITIAL_FRONTIER];
}

function cellTeam(row, column, frontier = targetFrontier) {
  return column < (frontier[row] ?? GRID_COLUMNS / 2) ? 'red' : 'blue';
}

function makeGrid() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1;
  // Widely spaced contour lines give terrain detail without a square grid.
  for (let band = -3; band < 18; band++) {
    ctx.beginPath();
    for (let x = -20; x <= 1044; x += 6) {
      const y = band * 42 + Math.sin(x * .009 + band * .65) * 20 + Math.sin(x * .019 - band * .5) * 7;
      if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); textureCache.set('terrain-contours', texture);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: .12, depthWrite: false }));
  mesh.position.z = .5;
  return mesh;
}

function makeTerritorySurface(team) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(FRONTIER_SAMPLES * 6);
  const colors = new Float32Array(FRONTIER_SAMPLES * 6);
  const indices = [];
  const shade = new THREE.Color();
  for (let i = 0; i < FRONTIER_SAMPLES; i++) {
    const t = i / (FRONTIER_SAMPLES - 1);
    for (let side = 0; side < 2; side++) {
      shade.set(team === 'red' ? '#dc7083' : '#6aaee0');
      shade.multiplyScalar(.88 + t * .13 + (side === (team === 'red' ? 1 : 0) ? .06 : 0));
      shade.toArray(colors, i * 6 + side * 3);
    }
    if (i < FRONTIER_SAMPLES - 1) {
      const v = i * 2; indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false }));
  mesh.frustumCulled = false;
  scene.add(mesh); territorySurfaces.push({ mesh, team });
}

function updateFrontierLine() {
  if (!frontierLine) return;
  const line = frontierLine.geometry.getAttribute('position');
  const contour = softenFrontier(smoothFrontier);
  for (let i = 0; i < FRONTIER_SAMPLES; i++) {
    const row = GRID_ROWS * i / (FRONTIER_SAMPLES - 1);
    const y = -WORLD_HEIGHT / 2 + row * CELL_HEIGHT;
    const x = frontierX(sampleFrontier(contour, row));
    line.setXYZ(i, x, y, 1.8);
    for (const { mesh, team } of territorySurfaces) {
      const position = mesh.geometry.getAttribute('position');
      position.setXYZ(i * 2, team === 'red' ? -WORLD_WIDTH / 2 : x, y, 0);
      position.setXYZ(i * 2 + 1, team === 'red' ? x : WORLD_WIDTH / 2, y, 0);
    }
  }
  line.needsUpdate = true;
  for (const { mesh } of territorySurfaces) mesh.geometry.getAttribute('position').needsUpdate = true;
}

function readjustVisualFrontier(row) {
  let columns = 0;
  while (columns < GRID_COLUMNS && cells[row * GRID_COLUMNS + columns]?.userData.team === 'red') columns += 1;
  visualFrontier[row] = columns;
}

function setCellTeam(cell, team, pulse = false) {
  cell.userData.team = team;
  cell.userData.targetTeam = team;
  cell.userData.flipAt = 0;

  if (pulse) cell.userData.pulse = 0.5;
  readjustVisualFrontier(cell.userData.row);
}

function makeCells() {
  targetFrontier = currentFrontier();
  visualFrontier = [...targetFrontier];
  smoothFrontier = [...targetFrontier];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const team = cellTeam(row, column);
      const mesh = new THREE.Object3D(); // Logical cells remain available to attack events.
      mesh.position.set(cellX(column), cellY(row), 0);
      mesh.userData = { row, column, team, targetTeam: team, flipAt: 0, pulse: 0 };
      cells.push(mesh);
    }
  }
}

function syncTerritory() {
  const frontier = currentFrontier();
  targetFrontier = [...frontier];
  cells.forEach((cell) => {
    const desired = cellTeam(cell.userData.row, cell.userData.column, frontier);
    cell.userData.targetTeam = desired;
    if (cell.userData.team === desired || cellDelays.has(keyOf(cell.userData.row, cell.userData.column))) return;
    if (reducedMotion) setCellTeam(cell, desired);
    else cell.userData.flipAt = performance.now() + 140;
  });
}

function scheduleCellFlip(row, column, team, delay = 220) {
  const cell = cells[row * GRID_COLUMNS + column];
  if (!cell) return;
  const key = keyOf(row, column);
  cell.userData.targetTeam = team;
  cell.userData.breaking = true;
  cellDelays.set(key, true);
  cell.userData.flipAt = performance.now() + Math.max(90, delay);
}

function makeCanvasTexture(team, kind = 'runner') {
  const cacheKey = `${team}-${kind}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const primary = team === 'red' ? '#ff3154' : '#168fff';
  const glow = team === 'red' ? '#ffd04a' : '#56e8ff';
  context.translate(team === 'red' ? 0 : 128, 0);
  context.scale(team === 'red' ? 1 : -1, 1);
  context.shadowColor = glow;
  context.shadowBlur = kind === 'base' ? 6 : 8;
  context.fillStyle = primary;
  if (kind === 'base') {
    context.fillStyle = '#172b43';
    context.fillRect(20, 72, 78, 26);
    context.fillStyle = '#91a7ba';
    for (let wheel = 0; wheel < 4; wheel += 1) {
      context.beginPath(); context.arc(31 + wheel * 18, 86, 6, 0, Math.PI * 2); context.fill();
    }
    const armor = context.createLinearGradient(0, 36, 0, 77);
    armor.addColorStop(0, '#ffffff'); armor.addColorStop(.23, primary); armor.addColorStop(1, '#223d58');
    context.fillStyle = armor;
    context.beginPath(); context.moveTo(23, 74); context.lineTo(33, 42); context.lineTo(70, 36); context.lineTo(90, 74); context.closePath(); context.fill();
    context.strokeStyle = '#d5e8f5'; context.lineWidth = 2; context.stroke();
    context.fillStyle = '#adbed0'; context.fillRect(60, 49, 49, 14);
    context.fillStyle = '#233a50'; context.fillRect(101, 46, 12, 20);
    context.fillStyle = glow; context.fillRect(39, 51, 16, 5);
  } else {
    context.beginPath(); context.arc(63, 38, 19, 0, Math.PI * 2); context.fill();
    context.fillRect(38, 58, 50, 37);
    context.fillRect(74, 68, 35, 8);
    context.fillRect(45, 92, 12, 23); context.fillRect(73, 92, 12, 23);
  }
  context.shadowBlur = 0;
  if (kind !== 'base') {
  context.fillStyle = '#fff';
  context.beginPath(); context.arc(57, 35, 4, 0, Math.PI * 2); context.arc(72, 35, 4, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#fff'; context.lineWidth = 5; context.lineCap = 'round';
  context.beginPath(); context.moveTo(38, 65); context.lineTo(20, 78); context.moveTo(87, 65); context.lineTo(105, 52); context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(cacheKey, texture);
  return texture;
}

function makeSprite(team, kind, scale) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeCanvasTexture(team, kind), transparent: true, depthWrite: false }));
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

function makeAvatarTexture(player, team) {
  const source = String(player?.avatarUrl || player?.avatarData || '');
  const sourceKey = source ? `${source.length}-${source.slice(-18)}` : `initial-${String(player?.name || '玩家').slice(0, 8)}`;
  const cacheKey = `avatar-${player?.id || 'pool'}-${team}-${sourceKey}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const context = canvas.getContext('2d');
  const teamColor = team === 'red' ? '#ff3b50' : '#1592ff';
  const teamDark = team === 'red' ? '#8f1834' : '#0754a7';
  const initials = Array.from(String(player?.name || '玩家')).slice(0, 1).join('');
  const drawPlaceholder = () => {
    context.clearRect(0, 0, 256, 256);
    context.shadowColor = `${teamColor}aa`; context.shadowBlur = 20;
    context.fillStyle = teamDark; context.beginPath(); context.arc(128, 128, 102, 0, Math.PI * 2); context.fill();
    context.shadowBlur = 0; context.fillStyle = '#fff'; context.font = '700 92px Microsoft YaHei'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(initials, 128, 136);
    context.strokeStyle = teamColor; context.lineWidth = 8; context.beginPath(); context.arc(128, 128, 108, 0, Math.PI * 2); context.stroke();
  };
  drawPlaceholder();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textureCache.set(cacheKey, texture);
  if (/^(?:data:image\/|\/api\/users\/)/i.test(source)) {
    const image = new Image(); image.crossOrigin = 'anonymous';
    image.onload = () => {
      context.clearRect(0, 0, 256, 256);
      context.save(); context.beginPath(); context.arc(128, 128, 96, 0, Math.PI * 2); context.clip();
      const side = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
      const sx = ((image.naturalWidth || image.width) - side) / 2; const sy = ((image.naturalHeight || image.height) - side) / 2;
      context.drawImage(image, sx, sy, side, side, 32, 32, 192, 192); context.restore();
      context.strokeStyle = teamColor; context.lineWidth = 8; context.shadowColor = `${teamColor}aa`; context.shadowBlur = 12; context.beginPath(); context.arc(128, 128, 108, 0, Math.PI * 2); context.stroke(); context.shadowBlur = 0;
      texture.needsUpdate = true;
    };
    image.onerror = () => { drawPlaceholder(); texture.needsUpdate = true; };
    image.src = source;
  }
  return texture;
}

function makeAvatarSprite(player, team, scale) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeAvatarTexture(player, team), transparent: true, depthWrite: false }));
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

function makeNameTexture(name, team) {
  const label = String(name || '玩家').slice(0, 5);
  const cacheKey = `name-${team}-${label}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const canvas = document.createElement('canvas');
  canvas.width = 260; canvas.height = 64;
  const context = canvas.getContext('2d');
  const color = team === 'red' ? '#ff5a44' : '#35a6ff';
  context.fillStyle = '#0d2549cc';
  context.beginPath(); context.roundRect(2, 3, 256, 58, 28); context.fill();
  context.strokeStyle = color; context.lineWidth = 3; context.stroke();
  context.fillStyle = '#fff'; context.font = '700 30px Microsoft YaHei'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(label, 130, 33);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textureCache.set(cacheKey, texture); return texture;
}

function updatePlayerSprites() {
  const players = props.players || [];
  const labelScale = players.length > 24 ? 5.4 : players.length > 12 ? 6.8 : 8.2;
  const avatarScale = players.length > 24 ? 6.6 : players.length > 12 ? 7.6 : 8.8;
  while (playerSprites.length < 60) {
    const sprite = makeAvatarSprite({ id: `pool-${playerSprites.length}`, name: '玩家' }, 'red', avatarScale);
    sprite.visible = false;
    scene.add(sprite);
    playerSprites.push(sprite);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    label.visible = false; label.scale.set(8.2, 2, 1); label.renderOrder = 6;
    scene.add(label); playerLabels.push(label);
  }
  const activeIds = new Set(players.map((player) => player.id));
  players.forEach((player, index) => {
    const sprite = playerSprites[index];
    const label = playerLabels[index];
    let tank = playerTanks.get(player.id);
    if (!tank || tank.team !== player.team) {
      const initialY = -WORLD_HEIGHT / 2 + 7 + stableNumber(player.id, 3) * (WORLD_HEIGHT - 14);
      const bounds = tankBounds(player.team, initialY);
      tank = { id: player.id, team: player.team, x: bounds.min + stableNumber(player.id, 7) * Math.max(1, bounds.max - bounds.min), y: initialY, targetX: 0, targetY: initialY, moves: 0, recoil: 0, sprite, label };
      chooseTankTarget(tank, 0); playerTanks.set(player.id, tank);
    }
    tank.sprite = sprite; tank.label = label;
    sprite.material.map = makeAvatarTexture(player, player.team);
    sprite.material.needsUpdate = true;
    sprite.visible = true;
    sprite.scale.set(avatarScale, avatarScale, 1);
    sprite.userData = { playerId: player.id, team: player.team };
    sprite.position.set(tank.x, tank.y, 2.2);
    sprite.material.rotation = 0;
    sprite.material.opacity = 1;
    label.scale.set(labelScale, labelScale * .244, 1);
    label.material.map = makeNameTexture(player.name, player.team);
    label.material.needsUpdate = true; label.visible = true;
    label.position.set(tank.x, tank.y - 4.2, 3.2);
  });
  for (const [id, tank] of playerTanks) {
    if (!activeIds.has(id)) { tank.sprite.visible = false; tank.label.visible = false; playerTanks.delete(id); }
  }
  playerSprites.slice(players.length).forEach((sprite) => { sprite.visible = false; });
  playerLabels.slice(players.length).forEach((label) => { label.visible = false; });
}

function makeGridLayer() {
  makeTerritorySurface('red');
  makeTerritorySurface('blue');
  grid = makeGrid();
  scene.add(grid);
  frontierLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(FRONTIER_SAMPLES * 3), 3)), new THREE.LineBasicMaterial({ color: '#fff', transparent: true, opacity: 0.98 }));
  frontierGlow = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(FRONTIER_SAMPLES * 3), 3)), new THREE.LineBasicMaterial({ color: '#f5fafb', transparent: true, opacity: 0.28 }));
  frontierGlow.geometry.dispose();
  frontierGlow.geometry = frontierLine.geometry;
  scene.add(frontierGlow, frontierLine);
  updateFrontierLine();
}

function makeFlashTexture(team) {
  const key = `${team}-flash`;
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, '#fff'); gradient.addColorStop(.18, team === 'red' ? '#ffd66b' : '#d7fbff'); gradient.addColorStop(.5, team === 'red' ? '#ff4d38aa' : '#29bfffaa'); gradient.addColorStop(1, 'transparent');
  context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textureCache.set(key, texture); return texture;
}

function pointOnCurve(start, control, end, t) {
  const one = 1 - t;
  return new THREE.Vector3(one * one * start.x + 2 * one * t * control.x + t * t * end.x, one * one * start.y + 2 * one * t * control.y + t * t * end.y, 2.8);
}

function createExplosion(x, y, team, commitCell = null) {

  const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.4, 18), new THREE.MeshBasicMaterial({ color: '#182436', transparent: true, opacity: .12, depthWrite: false }));
  scorch.position.set(x, y, .7); scorch.scale.set(.45, .24, 1); scene.add(scorch);
  scorchMarks.push({ mesh: scorch, age: 0 });
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeFlashTexture(team), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.position.set(x, y, 3.2); flash.scale.set(8, 8, 1); scene.add(flash);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.5, 48), new THREE.MeshBasicMaterial({ color: lightColorFor(team), transparent: true, opacity: .95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.position.set(x, y, 3); scene.add(ring);
  const count = 12; const positions = new Float32Array(count * 3); const velocities = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2; positions[index * 3] = x; positions[index * 3 + 1] = y; positions[index * 3 + 2] = 3;
    velocities.push({ x: Math.cos(angle) * (1.2 + Math.random() * 2.2), y: Math.sin(angle) * (1.2 + Math.random() * 2.2) });
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sparks = new THREE.Points(geometry, new THREE.PointsMaterial({ color: lightColorFor(team), size: .65, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(sparks); explosions.push({ flash, ring, sparks, velocities, age: 0, commitCell });
}

function createMuzzleFlash(team, x, y, playerId = null) {
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeFlashTexture(team), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.position.set(x, y, 4); flash.scale.set(3.4, 3.4, 1); scene.add(flash);
  muzzleFlashes.push({ sprite: flash, age: 0 });
  const tank = playerId && playerTanks.get(playerId);
  if (tank) tank.recoil = 1;
}

function createProjectile({ team, startX, startY, targetX, targetY, commitCell = null, heavy = false, playerId = null }) {
  createMuzzleFlash(team, startX, startY, playerId);
  const group = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(heavy ? .75 : .52, 10, 10), new THREE.MeshBasicMaterial({ color: lightColorFor(team), transparent: true, blending: THREE.AdditiveBlending }));
  group.add(head);
  const dots = [];
  for (let index = 0; index < (heavy ? 14 : 11); index += 1) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(heavy ? .5 : .36, 7, 7), new THREE.MeshBasicMaterial({ color: lightColorFor(team), transparent: true, opacity: .86, blending: THREE.AdditiveBlending }));
    group.add(dot); dots.push(dot);
  }
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(dots.length * 3), 3));
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: lightColorFor(team), transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(trail);
  scene.add(group);
  const direction = team === 'red' ? 1 : -1;
  projectiles.push({ group, trail, head, dots, team, direction, start: new THREE.Vector3(startX, startY, 2.8), control: new THREE.Vector3((startX + targetX) / 2, (startY + targetY) / 2 + (Math.random() - .5) * 22, 2.8), end: new THREE.Vector3(targetX, targetY, 2.8), age: 0, duration: heavy ? .56 : .78, commitCell });
}

function createAttackSequence(team, targets = [], commitKeys = new Set(), playerId = null) {
  if (!targets.length) return;
  const direction = team === 'red' ? 1 : -1;
  const tank = playerId && playerTanks.get(playerId);
  if (tank) {
    targets.slice(0, Math.max(3, targets.length)).forEach((target, index) => {
      const targetX = cellX(clamp(target.column, 0, GRID_COLUMNS - 1));
      const targetY = cellY(clamp(target.row, 0, GRID_ROWS - 1));
      createProjectile({ team, startX: tank.x + direction * 3.2, startY: tank.y + (index - 1) * .45, targetX, targetY, playerId, commitCell: commitKeys.has(keyOf(target.row, target.column)) ? target : null, heavy: true });
    });
    return;
  }
  targets.slice(0, Math.max(3, targets.length)).forEach((target, index) => {
    const targetX = cellX(clamp(target.column, 0, GRID_COLUMNS - 1));
    const targetY = cellY(clamp(target.row, 0, GRID_ROWS - 1));
    const startX = direction === 1 ? -WORLD_WIDTH / 2 + 4 : WORLD_WIDTH / 2 - 4;
    const runner = makeSprite(team, 'runner', 6.1);
    runner.position.set(startX, targetY + (index - 1) * 1.5, 3);
    scene.add(runner);
    activeRunners.push({ runner, team, direction, startX, runX: startX + direction * 13, targetX, targetY, age: -index * .13, shot: false, captured: commitKeys.has(keyOf(target.row, target.column)) ? target : null, heavy: true });
  });
}

function playEvent(event) {
  if (!event || seenEvents.has(event.id)) return;
  seenEvents.add(event.id);
  const captured = Array.isArray(event.captured) ? event.captured : [];
  captured.forEach((cell) => {
    cellDelays.set(keyOf(cell.row, cell.column), true);
    const target = cells[cell.row * GRID_COLUMNS + cell.column];
    if (target) { target.userData.targetTeam = event.team; target.userData.flipAt = 0; }
  });
  if (reducedMotion) {
    captured.forEach((cell) => {
      const target = cells[cell.row * GRID_COLUMNS + cell.column];
      if (target) { cellDelays.delete(keyOf(cell.row, cell.column)); setCellTeam(target, event.team); }
    });
    updateFrontierLine();
    return;
  }
  const targets = captured.length ? captured : (event.impact ? [event.impact] : []);
  createAttackSequence(event.team, targets, new Set(captured.map((cell) => keyOf(cell.row, cell.column))), event.playerId);
}

function animate(time = 0) {
  const delta = Math.min(.05, (time - lastFrame) / 1000 || 0); lastFrame = time;
  if (!reducedMotion) {
    playerTanks.forEach((tank) => {
      const distance = Math.hypot(tank.targetX - tank.x, tank.targetY - tank.y);
      if (distance < .45) chooseTankTarget(tank, time);
      const speed = 5.2 * delta;
      const nextDistance = Math.hypot(tank.targetX - tank.x, tank.targetY - tank.y) || 1;
      tank.x += (tank.targetX - tank.x) / nextDistance * Math.min(speed, nextDistance);
      tank.y += (tank.targetY - tank.y) / nextDistance * Math.min(speed, nextDistance);
      tank.recoil = Math.max(0, tank.recoil - delta * 4.8);
      const direction = tank.team === 'red' ? 1 : -1;
      tank.sprite.position.set(tank.x - direction * tank.recoil * 1.2, tank.y, 2.2);
      tank.sprite.material.rotation = 0;
      tank.label.position.set(tank.x, tank.y - 4.2, 3.2);
    });
    muzzleFlashes = muzzleFlashes.filter((item) => {
      item.age += delta; const progress = Math.min(1, item.age / .24);
      item.sprite.scale.setScalar(3.4 + progress * 3); item.sprite.material.opacity = 1 - progress;
      if (progress < 1) return true;
      item.sprite.material.dispose(); scene.remove(item.sprite); return false;
    });
    scorchMarks = scorchMarks.filter((item) => {
      item.age += delta; const progress = Math.min(1, item.age / 1.15);
      item.mesh.scale.set(.45 + progress * 1.7, .24 + progress * .86, 1); item.mesh.material.opacity = (1 - progress) * .42;
      if (progress < 1) return true;
      item.mesh.geometry.dispose(); item.mesh.material.dispose(); scene.remove(item.mesh); return false;
    });
    activeRunners = activeRunners.filter((item) => {
      item.age += delta;
      if (item.age >= 0) {
        const progress = clamp(item.age / .82, 0, 1); const eased = 1 - ((1 - progress) ** 3);
        item.runner.position.x = item.startX + (item.runX - item.startX) * eased;
        item.runner.position.y = item.targetY + Math.sin(time * .014 + item.targetY) * .65;
        if (!item.shot && item.age >= .28) {
          item.shot = true;
          createProjectile({ team: item.team, startX: item.runner.position.x + item.direction * 2, startY: item.runner.position.y, targetX: item.targetX, targetY: item.targetY, commitCell: item.captured, heavy: item.heavy });
        }
      }
      if (item.age < 1.08) return true;
      scene.remove(item.runner); return false;
    });
    projectiles = projectiles.filter((item) => {
      item.age += delta; const progress = clamp(item.age / item.duration, 0, 1); const point = pointOnCurve(item.start, item.control, item.end, 1 - ((1 - progress) ** 2));
      item.head.position.copy(point);
      item.dots.forEach((dot, index) => { const trailT = clamp(progress - (index + 1) * .045, 0, 1); dot.position.copy(pointOnCurve(item.start, item.control, item.end, 1 - ((1 - trailT) ** 2))); dot.material.opacity = Math.max(.08, .84 - index * .05); });
      const trailPosition = item.trail.geometry.getAttribute('position');
      item.dots.forEach((dot, index) => { trailPosition.setXYZ(index, dot.position.x, dot.position.y, 2.65); });
      trailPosition.needsUpdate = true;
      if (progress < 1) return true;
      createExplosion(item.end.x, item.end.y, item.team, item.commitCell);
      item.group.children.forEach((child) => { child.geometry.dispose(); child.material.dispose(); }); item.trail.geometry.dispose(); item.trail.material.dispose(); scene.remove(item.group, item.trail); return false;
    });
    explosions = explosions.filter((item) => {
      item.age += delta; const progress = clamp(item.age / .72, 0, 1);
      item.flash.scale.setScalar(3 + progress * 5); item.flash.material.opacity = (1 - progress) * .7;
      item.ring.scale.setScalar(1 + progress * 2.5); item.ring.material.opacity = (1 - progress) * .45;
      const position = item.sparks.geometry.getAttribute('position'); item.velocities.forEach((velocity, index) => { position.setX(index, position.getX(index) + velocity.x * delta * 5); position.setY(index, position.getY(index) + velocity.y * delta * 5); }); position.needsUpdate = true; item.sparks.material.opacity = 1 - progress;
      if (item.commitCell && progress >= .42) { scheduleCellFlip(item.commitCell.row, item.commitCell.column, item.commitCell.team, 0); item.commitCell = null; }
      if (progress < 1) return true;
      item.flash.material.dispose(); item.ring.geometry.dispose(); item.ring.material.dispose(); item.sparks.geometry.dispose(); item.sparks.material.dispose(); scene.remove(item.flash, item.ring, item.sparks); return false;
    });
    cells.forEach((cell) => {
      if (cell.userData.flipAt && time >= cell.userData.flipAt) {
        const key = keyOf(cell.userData.row, cell.userData.column); cellDelays.delete(key); cell.userData.breaking = false; setCellTeam(cell, cell.userData.targetTeam, true); updateFrontierLine();
      }

    });
    if (frontierLine) frontierLine.material.opacity = .8 + Math.sin(time * .006) * .15;
  }
  let frontierMoving = false;
  for (let row = 0; row < GRID_ROWS; row++) {
    const difference = visualFrontier[row] - smoothFrontier[row];
    if (Math.abs(difference) > .0001) {
      smoothFrontier[row] = reducedMotion ? visualFrontier[row] : smoothFrontier[row] + difference * (1 - Math.exp(-delta * 6));
      frontierMoving = true;
    }
  }
  if (frontierMoving) updateFrontierLine();
  if (!reducedMotion && impactShake > .01) {
    scene.position.set((Math.random() - .5) * impactShake, (Math.random() - .5) * impactShake, 0);
    impactShake *= Math.max(0, 1 - delta * 8);
  } else if (scene) scene.position.set(0, 0, 0);
  renderer?.render(scene, camera); animationFrame = requestAnimationFrame(animate);
}

function resize() {
  if (!renderer || !camera || !host.value) return;
  const width = Math.max(1, host.value.clientWidth); const height = Math.max(1, host.value.clientHeight); renderer.setSize(width, height, false);
  const aspect = width / height;
  const cameraWidth = WORLD_HEIGHT * aspect;
  camera.left = -cameraWidth / 2; camera.right = cameraWidth / 2; camera.top = WORLD_HEIGHT / 2; camera.bottom = -WORLD_HEIGHT / 2; camera.updateProjectionMatrix();
  if (scene) scene.scale.x = cameraWidth / WORLD_WIDTH;
}

function dispose() {
  cancelAnimationFrame(animationFrame); resizeObserver?.disconnect();
  scene?.traverse((object) => { object.geometry?.dispose(); if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose()); else object.material?.dispose(); });
  textureCache.forEach((texture) => texture.dispose()); renderer?.dispose(); if (host.value) host.value.innerHTML = '';
}

onMounted(() => {
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  scene = new THREE.Scene(); camera = new THREE.OrthographicCamera(-60, 60, 30, -30, .1, 20); camera.position.z = 10;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setClearColor(0x000000, 0); host.value.appendChild(renderer.domElement);
  makeCells(); makeGridLayer(); updatePlayerSprites(); syncTerritory(); resize(); resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host.value); animate();
});

watch(() => props.territory?.frontier, syncTerritory, { deep: true });
watch(() => props.players, updatePlayerSprites, { deep: true });
watch(() => props.events, (events = []) => {
  const sorted = events.filter(Boolean).sort((a, b) => a.id - b.id);
  if (!eventHydrated) {
    // The territory response already contains the current grid. Do not replay
    // historic attacks after a browser refresh or when a player joins late.
    if (!sorted.length) return;
    sorted.forEach((event) => seenEvents.add(event.id));
    eventHydrated = true;
  } else sorted.forEach(playEvent);
}, { deep: true, immediate: true });

onBeforeUnmount(dispose);
</script>

<template><div ref="host" class="battle-three-map" aria-hidden="true"></div></template>
