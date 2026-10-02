import * as THREE from 'three';
import { createRunnerAssets, createExplorer } from './runner-assets';
import { createRunnerEffects } from './runner-effects';
import { actionPose, createContactTracker, createRunnerMotion, trackPosition } from './runner-motion.mjs';

export function createRunnerScene(host, readState, onError, { onFeedback = () => {}, quality: initialQuality = 'auto' } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1; host.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#50766b', .007);
  const camera = new THREE.PerspectiveCamera(56, 1, .1, 240); camera.position.set(0, 5.4, 12);
  scene.add(new THREE.HemisphereLight('#fff1d5', '#354f43', 2.0));
  const sunlight = new THREE.DirectionalLight('#ffdd9d', 2.8); sunlight.position.set(-12, 22, 8); scene.add(sunlight);
  const rim = new THREE.DirectionalLight('#b8eddf', 1); rim.position.set(8, 10, -30); scene.add(rim);
  const assets = createRunnerAssets(renderer), { palette: m, box, plain, sphere, cylinder, leaf, vine } = assets;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const effects = createRunnerEffects(scene, assets, reducedMotion), explorer = createExplorer(assets);
  scene.add(explorer.root); explorer.root.position.z = 2;
  const motion = createRunnerMotion(), contacts = createContactTracker();
  const matrix = new THREE.Matrix4(), temporary = new THREE.Object3D(), batches = [], extraMaterials = [];
  let disposed = false, raf, previous = performance.now(), width = 1, height = 1, viewOffset = -1;
  let lane = 0, previousRun, quality = initialQuality, autoRatio = 1.25, slowSamples = 0, fastSamples = 0;
  let statsAt = previous, statsFrames = 0, lastCoinDistance = 0, lastVisualTime;

  const backgroundMaterial = new THREE.MeshBasicMaterial({ color: '#6b9986', fog: false, toneMapped: false }); extraMaterials.push(backgroundMaterial);
  const backdrop = new THREE.Mesh(assets.geometry(new THREE.PlaneGeometry(250, 141)), backgroundMaterial);
  backdrop.position.set(0, 32, -140); scene.add(backdrop);
  assets.loadImage('/assets/runner/jungle-valley-v2.png', texture => { backgroundMaterial.map = texture; backgroundMaterial.color.set('#ffffff'); backgroundMaterial.needsUpdate = true; });

  function part(parts, shape, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    temporary.position.set(x, y, z); temporary.scale.set(sx, sy, sz); temporary.rotation.set(rx, ry, rz); temporary.updateMatrix();
    parts.push({ shape, mat, matrix: temporary.matrix.clone() });
  }
  // Static scenery is drawn in geometry/material batches instead of hundreds of separate meshes.
  function repeat(count, spacing, behind, build) {
    const grouped = new Map();
    for (let index = 0; index < count; index++) {
      const parts = []; build(parts, index);
      for (const item of parts) {
        const key = `${item.shape.uuid}:${item.mat.uuid}`;
        if (!grouped.has(key)) grouped.set(key, { shape: item.shape, mat: item.mat, entries: [] });
        grouped.get(key).entries.push({ ...item, index });
      }
    }
    for (const { shape, mat, entries } of grouped.values()) {
      const mesh = new THREE.InstancedMesh(shape, mat, entries.length); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; scene.add(mesh); batches.push({ mesh, entries, count, spacing, behind });
    }
  }
  repeat(34, 4.4, 17, (parts, index) => {
    part(parts, box, m.paving, 0, -.35, 0, 7.5, .65, 4.38);
    for (const side of [-1, 1]) {
      part(parts, box, m.edge, side * 3.75, .03, 0, .32, .25, 4.38);
      if (index % 2 === 0) {
        part(parts, box, m.stone, side * 3.7, .64, -.9, .38, 1.12, .44);
        part(parts, box, m.gold, side * 3.7, 1.25, -.9, .46, .12, .5);
      }
      part(parts, cylinder, m.rope, side * 3.7, .96, 0, .048, 4.4, .048, Math.PI / 2);
      if (index % 3 === 0) part(parts, leaf, m.leafDark, side * 3.6, .16, .6, .65, .8, .8, -.4, side * 1.1);
    }
    for (const x of [-1.23, 1.23]) part(parts, plain, m.dark, x, -.02, 0, .018, .018, 4.35);
  });
  repeat(12, 14, 23, (parts, index) => {
    for (const side of [-1, 1]) {
      const x = side * (5.2 + index % 3 * .3);
      part(parts, box, m.stone, x, 2.1, 0, .95, 4.2, .95);
      part(parts, box, m.edge, x, .18, 0, 1.45, .42, 1.4);
      part(parts, box, m.edge, x, 4.3, 0, 1.45, .45, 1.4);
      part(parts, box, m.gold, x, 2.6, .49, .45, .55, .08, 0, 0, Math.PI / 4);
      part(parts, box, m.gold, x, 1.85, .49, .08, .58, .08);
      part(parts, vine, m.moss, x, 0, 0, .9, .95, .9, 0, index * .9);
      part(parts, cylinder, m.leather, x, 3.2, .73, .065, .65, .065, -.3);
      part(parts, sphere, m.flame, x, 3.58, .85, .13, .32, .13);
      const treeX = side * (9 + index % 3 * 2);
      part(parts, sphere, m.stone, treeX, -3.6, -4, 3.9, 3.8, 7, .06, index * .5);
      part(parts, sphere, m.moss, treeX, -.25, -4, 3.8, .7, 6.6, 0, index * .5);
      part(parts, cylinder, m.bark, treeX, 3.8, -4, .32, 8, .36, 0, 0, side * .1);
      for (let n = 0; n < 7; n++) part(parts, leaf, n % 2 ? m.leaves : m.leafDark, treeX + side * .3, 7.4, -4, 3.7, 3.4, 3.6, -.35, n * .90 + index);
      part(parts, sphere, m.moss, side * 7.1, -.25, 1.6, 1.3, .7, 1, .2, index, .2);
      part(parts, sphere, m.stone, side * 7.1, -1.7, 1.6, 1.6, 2, 1.5, .1, index, .1);
      for (let plant = 0; plant < 2; plant++) for (let n = 0; n < 6; n++) {
        part(parts, leaf, n % 2 ? m.leaves : m.leafDark, side * (6.9 + plant * 1.8), .2, 2 + plant * 3,
          1.3, 1.2, 1.4, -.6, n * 1.05 + index);
      }
      part(parts, cylinder, m.stone, side * 3, -5, 0, 1, 10, 1);
    }
    if (index % 4 === 0) part(parts, box, m.edge, 0, 6.7, 0, 11.8, .8, 1.15);
  });
  const water = new THREE.Mesh(assets.geometry(new THREE.PlaneGeometry(180, 210)), m.water);
  water.rotation.x = -Math.PI / 2; water.position.set(0, -8, -50); scene.add(water);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: assets.shadowMap, transparent: true, depthWrite: false, opacity: .68 }); extraMaterials.push(shadowMaterial);
  const shadow = new THREE.Mesh(assets.geometry(new THREE.PlaneGeometry(2.2, 1.8)), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, .02, 2); scene.add(shadow);

  const coins = new THREE.InstancedMesh(assets.coin, m.gold, 30); coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage); coins.frustumCulled = false; scene.add(coins);
  const obstacleRoot = new THREE.Group(); scene.add(obstacleRoot);
  function obstacle(action) {
    const root = new THREE.Group(), parts = [];
    if (action === 'jump') {
      part(parts, plain, m.dark, 0, .025, 0, 7.1, .06, 2.8);
      for (const z of [-1.4, 1.4]) { part(parts, box, m.stone, 0, .12, z, 7.15, .32, .38); part(parts, box, m.gold, 0, .295, z, 6.8, .045, .1); }
      for (const side of [-1, 1]) part(parts, box, m.edge, side * 3.35, .38, 0, .35, .6, 2.9);
    } else if (action === 'slide') {
      for (const side of [-1, 1]) part(parts, box, m.stone, side * 3.25, 1.6, 0, .55, 3.2, .8);
      part(parts, box, m.edge, 0, 1.7, 0, 6.5, .78, .95); part(parts, box, m.gold, 0, 1.63, .5, 5.7, .13, .055);
      for (let x = -2; x <= 2; x++) part(parts, box, m.gold, x, 1.91, .5, .12, .23, .06, 0, 0, Math.PI / 4);
    } else {
      for (const x of action === 'left' ? [0, 2.45] : [-2.45, 0]) {
        part(parts, box, m.stone, x, 1, 0, 2.1, 2, .95); part(parts, box, m.edge, x, 2.04, 0, 2.24, .22, 1.05);
        part(parts, box, m.gold, x, 1.1, .5, .6, .6, .08, 0, 0, Math.PI / 4);
        part(parts, vine, m.moss, x - .6, 0, -.1, .7, .44, .7);
      }
    }
    const groups = new Map();
    for (const item of parts) { const key = `${item.shape.uuid}:${item.mat.uuid}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }
    for (const group of groups.values()) {
      const mesh = new THREE.InstancedMesh(group[0].shape, group[0].mat, group.length); mesh.frustumCulled = false;
      group.forEach((item, i) => mesh.setMatrixAt(i, item.matrix)); root.add(mesh);
    }
    return root;
  }
  const obstacles = Array.from({ length: 4 }, () => {
    const root = new THREE.Group(), variants = Object.fromEntries(['jump', 'slide', 'left', 'right'].map(action => [action, obstacle(action)]));
    Object.values(variants).forEach(group => root.add(group)); obstacleRoot.add(root); return { root, variants };
  });

  function updateSize() {
    const ratio = quality === 'smooth' ? 1 : quality === 'high' ? Math.min(1.7, window.devicePixelRatio || 1) : Math.min(autoRatio, window.devicePixelRatio || 1);
    const budget = quality === 'high' ? 2800000 : quality === 'smooth' ? 950000 : 1700000;
    renderer.setPixelRatio(Math.max(.65, Math.min(ratio, Math.sqrt(budget / (width * height)))));
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    effects.resize(height, renderer.getPixelRatio()); host.dataset.quality = quality;
  }
  function resize() { const rect = host.getBoundingClientRect(); if (!rect.width || !rect.height) return; width = rect.width; height = rect.height; viewOffset = -1; updateSize(); }
  const observer = new ResizeObserver(resize); observer.observe(host); resize();

  function frame(time) {
    if (disposed) return;
    const rawDelta = (time - previous) / 1000, delta = Math.min(.05, Math.max(0, rawDelta)); previous = time;
    const view = readState(), state = view.state || { phase: 'idle' }, task = state.task;
    const candidate = state.phase === 'paused' && task ? state.lastTickAt ?? task.deadline - state.pausedRemaining : view.now;
    const now = state.id === previousRun && state.phase === 'running' && view.connected === false && lastVisualTime !== undefined ? lastVisualTime : candidate;
    lastVisualTime = now;
    const running = state.phase === 'running' && view.connected !== false;
    const distance = motion.step(state, now, delta, view.connected !== false);
    if (state.id !== previousRun) { lane = 0; explorer.root.position.x = 0; previousRun = state.id; lastCoinDistance = distance; }
    const offset = ['running', 'paused'].includes(state.phase) || state.phase === 'countdown' && task ? Math.max(0, Math.min(.49, 210 / height) - .1) : 0;
    if (viewOffset < 0 || Math.abs(offset - viewOffset) > .0001) {
      viewOffset = viewOffset < 0 || reducedMotion ? offset : viewOffset + (offset - viewOffset) * (1 - Math.exp(-delta * 18));
      camera.setViewOffset(width, height, 0, height * viewOffset, width, height);
    }
    for (const batch of batches) {
      for (let i = 0; i < batch.entries.length; i++) {
        const entry = batch.entries[i]; matrix.copy(entry.matrix);
        matrix.elements[14] += trackPosition(entry.index, distance, batch.count, batch.spacing, batch.behind);
        batch.mesh.setMatrixAt(i, matrix);
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
    const events = contacts.update(state, now, view.solved);
    for (const event of events) {
      effects.contact(event, explorer.root.position.x, 2, explorer.root.position.y); onFeedback(event);
      host.dataset.lastContact = `${event.kind}:${event.sequence}`;
    }
    const action = ['running', 'paused'].includes(state.phase) ? contacts.latestAction(now) : null;
    const pose = action ? actionPose(action.action, now, action.deadline) : { active: false, jump: 0, crouch: 0, lean: 0 };
    if (running && action && (action.action === 'left' || action.action === 'right')) lane = action.action === 'left' ? -2.45 : 2.45;
    if (running) explorer.root.position.x += (lane - explorer.root.position.x) * (1 - Math.exp(-delta * 13));
    const reaction = effects.frame(delta, running || state.phase === 'finished', explorer.root.position.x, 2, pose.jump < .1 && pose.crouch < .4 && running);
    const stride = distance * 1.42, movingPose = ['running', 'paused'].includes(state.phase);
    explorer.root.position.y = pose.jump;
    explorer.root.position.z = 2 + reaction.recoil * .45;
    explorer.rig.rotation.set(reaction.recoil * .2 - pose.crouch * .17, 0, -pose.lean * .19 + reaction.recoil * .1);
    explorer.hips.position.y = 1.13 - pose.crouch * .53 + (movingPose && !reducedMotion ? Math.abs(Math.sin(stride)) * .035 : 0);
    explorer.torso.rotation.x = -pose.crouch * 1.22 - reaction.recoil * .34;
    explorer.head.rotation.y = -pose.lean * .22; explorer.scarf.rotation.x = -.2 + Math.sin(stride * 1.5) * .10;
    for (const { side, arm, elbow, leg, knee } of explorer.limbs) {
      const cycle = Math.sin(stride + (side === 1 ? Math.PI : 0));
      leg.rotation.x = pose.crouch * -1.1 + (movingPose && !pose.active ? cycle * .63 : pose.jump > 0 ? .35 * side : 0);
      knee.rotation.x = pose.crouch * 1.65 + (movingPose && !pose.active ? Math.max(0, -cycle) * .75 : pose.jump > 0 ? .5 : .1);
      arm.rotation.x = pose.crouch * -.55 + (movingPose && !pose.active ? -cycle * .60 : pose.jump > 0 ? -.65 : -.2);
      arm.rotation.z = side * (.08 + pose.jump * .07); elbow.rotation.x = -.62 - Math.max(0, cycle) * .18;
    }
    shadow.position.x = explorer.root.position.x; shadow.scale.setScalar(1 - Math.min(.35, pose.jump * .15)); shadowMaterial.opacity = .68 - pose.jump * .15;
    const specs = [];
    if (task && ['running', 'paused'].includes(state.phase)) {
      specs.push(task); let deadline = task.deadline;
      for (const spec of state.upcoming || []) { deadline += 350 + spec.duration; specs.push({ ...spec, deadline }); }
      // A passed stone gate continues behind the runner instead of disappearing at the next poll.
      const trailing = contacts.trailingObstacle(now, task.sequence); if (trailing) specs.push(trailing);
    }
    obstacles.forEach(({ root, variants }, index) => {
      const spec = specs[index]; root.visible = !!spec; if (!spec) return;
      root.position.z = 2 - (spec.deadline - now) / 1000 * (state.speed || 8);
      Object.entries(variants).forEach(([key, group]) => { group.visible = key === spec.action; });
    });
    for (let i = 0; i < 30; i++) {
      const x = (i % 3 - 1) * 2.45, z = trackPosition(i, distance, 30, 4.6, 12);
      const previousZ = trackPosition(i, lastCoinDistance, 30, 4.6, 12);
      if (running && previousZ < 2 && z >= 2 && Math.abs(x - explorer.root.position.x) < .75 && pose.jump < .6) effects.burst('pass', x, .75, 2, 5);
      temporary.position.set(x, .75, z); temporary.rotation.order = 'YXZ'; temporary.rotation.set(Math.PI / 2, distance * .20 + i, 0);
      temporary.scale.setScalar(z > 2 ? .001 : 1); temporary.updateMatrix(); coins.setMatrixAt(i, temporary.matrix);
    }
    lastCoinDistance = distance; coins.instanceMatrix.needsUpdate = true;
    assets.waterMap.offset.y = distance * .002;
    if (running) camera.position.x += (explorer.root.position.x * .25 - camera.position.x) * (1 - Math.exp(-delta * 3));
    const shake = reaction.shake;
    camera.position.y = 5.4 + Math.sin(time * .081) * shake;
    camera.lookAt(explorer.root.position.x * .12 + Math.cos(time * .069) * shake, 1.05, -24);
    renderer.render(scene, camera); statsFrames++;
    if (time - statsAt >= 1000) {
      const fps = statsFrames * 1000 / (time - statsAt); statsAt = time; statsFrames = 0;
      host.dataset.fps = fps.toFixed(1); host.dataset.drawCalls = String(renderer.info.render.calls); host.dataset.triangles = String(renderer.info.render.triangles);
      if (quality === 'auto' && document.visibilityState === 'visible') {
        slowSamples = fps < 42 ? slowSamples + 1 : 0; fastSamples = fps > 58 ? fastSamples + 1 : 0;
        if (slowSamples >= 3 && autoRatio > .7) { autoRatio = Math.max(.7, autoRatio - .15); slowSamples = 0; updateSize(); }
        if (fastSamples >= 10 && autoRatio < 1.25) { autoRatio = Math.min(1.25, autoRatio + .1); fastSamples = 0; updateSize(); }
      }
    }
    raf = requestAnimationFrame(frame);
  }
  const lost = event => { event.preventDefault(); onError?.('3D 场景暂时不可用，打字挑战仍可继续。'); };
  renderer.domElement.addEventListener('webglcontextlost', lost); raf = requestAnimationFrame(frame);
  return { setQuality(value) { quality = value; slowSamples = fastSamples = 0; updateSize(); },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); renderer.domElement.removeEventListener('webglcontextlost', lost);
      effects.dispose(); extraMaterials.forEach(item => item.dispose());
      scene.traverse(item => { if (item.isInstancedMesh) item.dispose(); }); assets.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    } };
}
