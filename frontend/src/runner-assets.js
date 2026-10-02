import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export function createRunnerAssets(renderer) {
  const geometries = new Set(), materials = new Set(), textures = new Set(); let disposed = false;
  const geometry = item => { geometries.add(item); return item; };
  const material = (color, extra = {}) => { const item = new THREE.MeshStandardMaterial({ color, roughness: .88, ...extra }); materials.add(item); return item; };
  const texture = canvas => { const item = new THREE.CanvasTexture(canvas); item.colorSpace = THREE.SRGBColorSpace; textures.add(item); return item; };
  const box = geometry(new RoundedBoxGeometry(1, 1, 1, 2, .075));
  const plain = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphere = geometry(new THREE.SphereGeometry(1, 12, 8));
  const cylinder = geometry(new THREE.CylinderGeometry(.8, 1, 1, 10));
  const capsule = geometry(new THREE.CapsuleGeometry(.14, .36, 3, 8));
  const coin = geometry(new THREE.CylinderGeometry(.23, .23, .055, 16));
  const ring = geometry(new THREE.TorusGeometry(1, .025, 4, 40));
  const vine = geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(.3, 0, .3), new THREE.Vector3(-.35, 1, .4), new THREE.Vector3(.3, 2, -.25),
    new THREE.Vector3(-.25, 3, .3), new THREE.Vector3(.1, 4.5, -.3)
  ]), 18, .045, 4, false));
  const leafVertices = [], leafUV = [], leafIndices = [];
  for (let i = 0; i <= 8; i++) for (const side of [-1, 1]) {
    const t = i / 8, width = Math.sin(t * Math.PI) ** .8 * .28;
    leafVertices.push(side * width, Math.sin(t * Math.PI) * .2 - t * t * .3, t * 1.6);
    leafUV.push((side + 1) / 2, t);
  }
  for (let i = 0; i < 8; i++) { const a = i * 2; leafIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const leaf = geometry(new THREE.BufferGeometry()); leaf.setAttribute('position', new THREE.Float32BufferAttribute(leafVertices, 3));
  leaf.setAttribute('uv', new THREE.Float32BufferAttribute(leafUV, 2)); leaf.setIndex(leafIndices); leaf.computeVertexNormals();
  const leafCanvas = document.createElement('canvas'); leafCanvas.width = 128; leafCanvas.height = 256;
  const leafContext = leafCanvas.getContext('2d'), leafGradient = leafContext.createLinearGradient(0, 0, 128, 0);
  leafGradient.addColorStop(0, '#286344'); leafGradient.addColorStop(.5, '#93b654'); leafGradient.addColorStop(1, '#235944');
  leafContext.fillStyle = leafGradient; leafContext.fillRect(0, 0, 128, 256); leafContext.strokeStyle = '#b8cf7777'; leafContext.lineWidth = 2;
  for (let y = 8; y < 250; y += 18) { leafContext.beginPath(); leafContext.moveTo(3, y + 30); leafContext.lineTo(64, y); leafContext.lineTo(125, y + 30); leafContext.stroke(); }
  const leafMap = texture(leafCanvas);
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext('2d'), shadowGradient = shadowContext.createRadialGradient(32, 32, 0, 32, 32, 30);
  shadowGradient.addColorStop(0, '#000b'); shadowGradient.addColorStop(1, '#0000'); shadowContext.fillStyle = shadowGradient; shadowContext.fillRect(0, 0, 64, 64);
  const shadowMap = texture(shadowCanvas);
  const waterCanvas = document.createElement('canvas'); waterCanvas.width = waterCanvas.height = 256;
  const waterContext = waterCanvas.getContext('2d'); waterContext.fillStyle = '#247c83'; waterContext.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 180; i++) {
    const x = i * 83 % 256, y = i * 47 % 256;
    waterContext.strokeStyle = i % 3 ? '#8ae5cf18' : '#0b454632'; waterContext.lineWidth = 1 + i % 3;
    waterContext.beginPath(); waterContext.moveTo(x - 32, y);
    waterContext.bezierCurveTo(x - 14, y - 3, x + 7, y + 3, x + 31, y); waterContext.stroke();
  }
  const waterMap = texture(waterCanvas); waterMap.wrapS = waterMap.wrapT = THREE.RepeatWrapping; waterMap.repeat.set(14, 18);
  const mossCanvas = document.createElement('canvas'); mossCanvas.width = mossCanvas.height = 128;
  const mossContext = mossCanvas.getContext('2d'); mossContext.fillStyle = '#819a52'; mossContext.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2400; i++) {
    mossContext.fillStyle = ['#44684455', '#bdcc7666', '#65844866', '#dfd6a02b'][i % 4];
    mossContext.fillRect((i * 71.37) % 128, (i * 47.19) % 128, 1 + i % 3, 1 + i % 2);
  }
  const mossMap = texture(mossCanvas); mossMap.wrapS = mossMap.wrapT = THREE.RepeatWrapping; mossMap.repeat.set(3, 3);
  const palette = {
    paving: material('#d7c5a0'), stone: material('#a99c7c'), edge: material('#d2bf91'), dark: material('#243c36'),
    moss: material('#b6cc94', { map: mossMap }), bark: material('#685442'), rope: material('#ac8b56'), gold: material('#fbd46a', { metalness: .35, roughness: .28, emissive: '#b78327', emissiveIntensity: .12 }),
    leaves: material('#fff5cc', { map: leafMap, side: THREE.DoubleSide, roughness: 1, emissive: '#4b7442', emissiveIntensity: .35 }),
    leafDark: material('#c6dba8', { map: leafMap, side: THREE.DoubleSide, roughness: 1, emissive: '#406644', emissiveIntensity: .28 }),
    shirt: material('#2e927f'), shirtLight: material('#62b69b'), skin: material('#ecc29b'), trousers: material('#c9b78e'),
    leather: material('#865635'), bag: material('#b96738'), hat: material('#d4b477'), band: material('#604432'), scarf: material('#ec9460'),
    flame: material('#ffd77b', { emissive: '#ffb44c', emissiveIntensity: 2.2 }), water: material('#aacbc5', { map: waterMap, metalness: .12, roughness: .5 })
  };
  const loader = new THREE.TextureLoader();
  function loadImage(url, onLoad) {
    const item = loader.load(url, loaded => {
      if (disposed) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace; loaded.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); onLoad(loaded);
    }); textures.add(item); return item;
  }
  loadImage('/assets/runner/moss-sandstone-v2.png', map => {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    for (const name of ['paving', 'stone', 'edge']) { palette[name].map = map; palette[name].needsUpdate = true; }
  });
  return { geometry, material, palette, box, plain, sphere, cylinder, capsule, coin, leaf, vine, ring, shadowMap, waterMap, loadImage,
    dispose() { disposed = true; geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose()); } };
}

export function createExplorer(assets) {
  const { palette: m, box, sphere, cylinder, capsule } = assets;
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  function add(parent, shape, mat, x, y, z, sx, sy, sz, rx = 0, rz = 0) {
    const mesh = new THREE.Mesh(shape, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.set(rx, 0, rz); parent.add(mesh); return mesh;
  }
  const hips = new THREE.Group(); hips.position.y = 1.13; rig.add(hips);
  add(hips, box, m.trousers, 0, 0, 0, .58, .26, .37); add(hips, box, m.leather, 0, .09, 0, .61, .1, .4);
  add(hips, box, m.gold, 0, .09, -.22, .12, .1, .04);
  const torso = new THREE.Group(); torso.position.y = .15; hips.add(torso);
  add(torso, box, m.shirt, 0, .35, 0, .66, .74, .43);
  add(torso, cylinder, m.skin, 0, .78, 0, .14, .16, .14);
  const head = new THREE.Group(); head.position.y = 1.04; torso.add(head);
  add(head, sphere, m.skin, 0, 0, 0, .26, .29, .25);
  add(head, sphere, m.band, 0, .08, .06, .27, .21, .23);
  add(head, cylinder, m.hat, 0, .24, 0, .43, .065, .43);
  add(head, cylinder, m.hat, 0, .37, 0, .29, .24, .3);
  add(head, cylinder, m.band, 0, .275, 0, .305, .055, .315);
  add(head, sphere, m.skin, 0, -.035, -.25, .055, .08, .06);
  for (const side of [-1, 1]) {
    add(head, sphere, m.skin, side * .26, -.01, 0, .055, .08, .06);
    add(head, sphere, m.dark, side * .10, .035, -.232, .025, .027, .023);
    add(torso, box, m.leather, side * .24, .36, .24, .08, .68, .07);
  }
  add(torso, box, m.bag, 0, .32, .32, .49, .59, .24);
  add(torso, box, m.leather, 0, .23, .465, .34, .2, .045);
  add(torso, box, m.gold, 0, .33, .505, .07, .06, .025);
  const bedroll = add(torso, cylinder, m.trousers, 0, .71, .38, .13, .6, .13); bedroll.rotation.z = Math.PI / 2;
  for (const x of [-.20, .20]) add(torso, box, m.band, x, .71, .39, .04, .22, .26);
  add(torso, cylinder, m.scarf, 0, .77, 0, .19, .07, .18);
  const scarf = add(torso, box, m.scarf, .1, .64, .40, .12, .31, .045, -.2);
  const limbs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .38, .65, 0); torso.add(arm);
    add(arm, capsule, m.shirtLight, 0, -.16, 0, 1.05, .60, 1.05);
    const elbow = new THREE.Group(); elbow.position.y = -.33; arm.add(elbow);
    add(elbow, capsule, m.skin, 0, -.19, 0, .75, .63, .75);
    add(elbow, sphere, m.skin, 0, -.4, -.01, .095, .12, .10);
    const leg = new THREE.Group(); leg.position.set(side * .19, -.10, 0); hips.add(leg);
    add(leg, capsule, m.trousers, 0, -.23, 0, 1.03, .79, 1.07);
    const knee = new THREE.Group(); knee.position.y = -.45; leg.add(knee);
    add(knee, capsule, m.trousers, 0, -.19, 0, .87, .7, .91);
    add(knee, box, m.leather, 0, -.41, -.07, .25, .23, .39);
    add(knee, box, m.band, 0, -.51, -.07, .27, .045, .4);
    limbs.push({ side, arm, elbow, leg, knee });
  }
  return { root, rig, hips, torso, head, scarf, limbs };
}
