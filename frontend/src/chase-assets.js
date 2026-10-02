import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export function createChaseAssets() {
  const geometries = new Set(), materials = new Set(), textures = new Set(); let disposed = false;
  const geo = geometry => { geometries.add(geometry); return geometry; };
  const mat = (color, extra = {}) => { const material = new THREE.MeshStandardMaterial({ color, roughness: .7, ...extra }); materials.add(material); return material; };
  const tex = canvas => { const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture); return texture; };
  const box = geo(new RoundedBoxGeometry(1, 1, 1, 2, .06)), plain = geo(new THREE.BoxGeometry(1, 1, 1));
  const sphere = geo(new THREE.SphereGeometry(1, 16, 12)), cylinder = geo(new THREE.CylinderGeometry(1, 1, 1, 16));
  const capsule = geo(new THREE.CapsuleGeometry(.15, .5, 3, 8)), cone = geo(new THREE.ConeGeometry(1, 1, 12));
  const asphalt = document.createElement('canvas'); asphalt.width = asphalt.height = 256;
  const context = asphalt.getContext('2d'); context.fillStyle = '#354650'; context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7500; i++) { const value = 38 + i * 47 % 40; context.fillStyle = `rgba(${value},${value+12},${value+20},.3)`; context.fillRect(i * 83 % 256, i * 61 % 256, 1, 1); }
  const asphaltMap = tex(asphalt); asphaltMap.wrapS = asphaltMap.wrapT = THREE.RepeatWrapping;
  const waterCanvas = document.createElement('canvas'); waterCanvas.width = waterCanvas.height = 256;
  const waterContext = waterCanvas.getContext('2d'); waterContext.fillStyle = '#244e61'; waterContext.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) { waterContext.strokeStyle = i % 3 ? '#7fb8b625' : '#ffcf9128'; waterContext.beginPath(); const x = i * 83 % 256, y = i * 67 % 256; waterContext.moveTo(x, y); waterContext.bezierCurveTo(x+8,y-2,x+22,y+2,x+40,y); waterContext.stroke(); }
  const waterMap = tex(waterCanvas); waterMap.wrapS = waterMap.wrapT = THREE.RepeatWrapping; waterMap.repeat.set(18, 18);
  const p = {
    road: mat('#bed1cf', { map: asphaltMap, roughness: .52 }), curb: mat('#b1c1be'), white: mat('#dbe5dc'), dark: mat('#202b35'),
    navy: mat('#263f59'), blue: mat('#318bd1', { metalness: .2 }), orange: mat('#e9853e', { metalness: .2 }), skin: mat('#dba77e'), helmet: mat('#ecf0e3', { roughness: .3 }),
    chrome: mat('#b9cfce', { metalness: .75, roughness: .3 }), tyre: mat('#18232b', { roughness: .95 }), visor: mat('#174654', { metalness: .45, roughness: .18 }),
    cyan: mat('#78e9ef', { emissive: '#41d7ff', emissiveIntensity: 1.8 }), amber: mat('#ffcd73', { emissive: '#ffbf5c', emissiveIntensity: 1.5 }),
    red: mat('#ef4e44', { emissive: '#ee442e', emissiveIntensity: 1.3 }), wall: mat('#c5ad92'), roof: mat('#476275'), teal: mat('#518b8a'),
    foliage: mat('#347360'), leaves: mat('#54886a'), trunk: mat('#69594e'), paving: mat('#a6b2a8'),
    water: mat('#73b9cf', { map: waterMap, roughness: .86, metalness: .1 }),
    light: mat('#ffe7ae', { emissive: '#ffdc9a', emissiveIntensity: 1.4 }), windows: mat('#ffd99a', { emissive: '#ffbd6c', emissiveIntensity: .85 })
  };
  function loadImage(url, onLoad) {
    new THREE.TextureLoader().load(url, texture => { if (disposed) { texture.dispose(); return; } texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture); onLoad(texture); });
  }
  return { geo, mat, tex, box, plain, sphere, cylinder, capsule, cone, p, waterMap, loadImage,
    dispose() { disposed = true; geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose()); } };
}

export function createMotorcycle(assets, role) {
  const { p, box, sphere, cylinder, capsule } = assets, root = new THREE.Group(), lean = new THREE.Group(); root.add(lean);
  const temporary = new THREE.Object3D(), parts = [], paint = role === 'police' ? p.blue : p.orange, clothes = role === 'police' ? p.navy : p.dark;
  function part(shape, material, x, y, z, sx, sy, sz, rx=0, ry=0, rz=0) {
    temporary.position.set(x,y,z); temporary.rotation.set(rx,ry,rz); temporary.scale.set(sx,sy,sz); temporary.updateMatrix();
    parts.push({ shape, material, matrix: temporary.matrix.clone() });
  }
  part(box,p.chrome,0,.65,0,.15,.17,1.65); part(box,p.dark,0,.79,.13,.5,.45,.75);
  part(box,paint,0,1.08,-.23,.63,.55,.7,-.15); part(box,clothes,0,1.1,.48,.53,.15,.83,.06);
  part(box,paint,0,.83,.87,.46,.23,.36); part(box,p.red,0,.94,1.05,.33,.08,.045);
  part(box,paint,0,1.1,-.88,.62,.45,.25,-.18); part(box,p.light,0,1.05,-1.025,.42,.15,.045);
  part(box,p.visor,0,1.4,-.9,.52,.46,.035,-.3);
  for (const side of [-1,1]) {
    part(cylinder,p.chrome,side*.20,.77,-.85,.045,.64,.045,-.2);
    part(cylinder,p.chrome,side*.28,.59,.55,.055,.55,.055,.35);
    part(cylinder,p.dark,side*.42,1.43,-.66,.035,.4,.035,0,0,Math.PI/2);
    part(box,p.chrome,side*.47,1.58,-.69,.18,.13,.08); part(box,p.dark,side*.38,.68,.3,.13,.13,.35);
    part(cylinder,p.chrome,side*.31,.65,.82,.10,.55,.10,Math.PI/2);
    if (role === 'police') { part(box,p.helmet,side*.43,.98,.64,.32,.47,.53); part(box,paint,side*.6,1.02,.64,.025,.18,.32); }
    part(capsule,clothes,side*.30,1.13,.2,.9,.64,1.2,-.8); part(capsule,p.dark,side*.36,.82,.08,.85,.58,.9,.5);
    part(box,p.dark,side*.35,.56,.12,.25,.18,.38);
    part(capsule,clothes,side*.36,1.65,-.25,.88,.6,.95,-1); part(capsule,p.dark,side*.4,1.46,-.53,.77,.47,.77,-.75);
    part(sphere,p.dark,side*.41,1.4,-.68,.09,.10,.10);
  }
  part(box,clothes,0,1.35,.28,.60,.27,.48); part(box,clothes,0,1.66,.0,.70,.7,.44,-.3);
  part(box,role==='police'?p.blue:p.orange,0,1.69,.22,.52,.38,.08,-.3);
  part(cylinder,p.skin,0,2.0,-.2,.13,.2,.13);
  part(sphere,role==='police'?p.helmet:p.dark,0,2.26,-.26,.33,.36,.32);
  part(sphere,p.skin,0,2.18,-.49,.24,.23,.11);
  part(box,role==='police'?p.blue:p.orange,0,2.56,-.24,.10,.04,.45);
  part(box,p.visor,0,2.31,-.555,.44,.09,.025,-.22);
  for (const side of [-1,1]) { part(sphere,p.dark,side*.095,2.24,-.599,.025,.029,.024); part(sphere,p.chrome,side*.31,2.27,-.29,.055,.09,.07); }
  if (role === 'police') { part(box,p.cyan,-.17,1.21,.79,.23,.12,.13); part(box,p.red,.17,1.21,.79,.23,.12,.13); }
  const groups = new Map();
  for (const part of parts) { const key = `${part.shape.uuid}:${part.material.uuid}`; if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(part); }
  for (const group of groups.values()) { const mesh = new THREE.InstancedMesh(group[0].shape,group[0].material,group.length); mesh.frustumCulled=false; group.forEach((part,i)=>mesh.setMatrixAt(i,part.matrix)); lean.add(mesh); }
  const wheels = [];
  for (const z of [-.85,.85]) {
    const wheel = new THREE.Group(); wheel.position.set(0,.41,z); lean.add(wheel); wheels.push(wheel);
    const tyre = new THREE.Mesh(cylinder,p.tyre); tyre.scale.set(.39,.25,.39); tyre.rotation.z=Math.PI/2; wheel.add(tyre);
    const hub = new THREE.Mesh(cylinder,p.chrome); hub.scale.set(.24,.265,.24); hub.rotation.z=Math.PI/2; wheel.add(hub);
    const spoke = new THREE.Mesh(box,p.dark); spoke.scale.set(.28,.055,.47); wheel.add(spoke);
  }
  root.scale.setScalar(1.12);
  return { root, lean, wheels };
}
