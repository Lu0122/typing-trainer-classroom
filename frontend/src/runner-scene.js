import * as THREE from 'three';

// 所有模型由几何体制作，反复利用同一批道路、树木和石柱，路线长度不增加显存。
export function createRunnerScene(host, readState, onError) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25; host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#254943', .012);
  const camera = new THREE.PerspectiveCamera(56, 1, .1, 220);
  camera.position.set(0, 5.4, 12); camera.lookAt(0, 1, -24);
  scene.add(new THREE.HemisphereLight('#d9f5de', '#344c3b', 2.7));
  const sun = new THREE.DirectionalLight('#ffe0a2', 3.4); sun.position.set(-15, 25, 12); scene.add(sun);
  const materials = {}, geometries = [];
  function material(name, color, extra = {}) {
    return materials[name] ||= new THREE.MeshStandardMaterial({ color, roughness: .88, ...extra });
  }
  const stone = material('stone', '#879b87'), edge = material('edge', '#b2b49a'), moss = material('moss', '#52794f');
  const gold = material('gold', '#ffd276', { metalness: .55, roughness: .3 });
  const bark = material('bark', '#5d493b'), leaves = material('leaves', '#285b42');
  const leafLight = material('leafLight', '#497f4c'), dark = material('dark', '#142d2b');
  function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
    const item = new THREE.Mesh(geometry, mat); geometries.push(geometry); item.position.set(x, y, z); parent.add(item); return item;
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1); geometries.push(boxGeo);
  function box(parent, mat, x, y, z, w, h, d) {
    const item = new THREE.Mesh(boxGeo, mat); item.position.set(x, y, z); item.scale.set(w, h, d); parent.add(item); return item;
  }
  const road = [], scenery = [];
  for (let i = 0; i < 34; i++) {
    const tile = new THREE.Group();
    box(tile, i % 3 ? stone : moss, 0, -.4, 0, 7.6, .7, 4.38);
    for (const side of [-1, 1]) {
      box(tile, edge, side * 3.8, .05, 0, .38, .22, 4.38);
      if (i % 2 === 0) box(tile, moss, side * 3.7, .2, 0, .5, .05, 2.3);
    }
    for (const x of [-2.45, 0, 2.45]) box(tile, dark, x, -.04, 0, .025, .025, 4.3);
    scene.add(tile); road.push(tile);
  }
  const flame = material('flame', '#ffd29a', { emissive: '#ff9b33', emissiveIntensity: 2.5 });
  for (let i = 0; i < 11; i++) {
    const decor = new THREE.Group();
    for (const side of [-1, 1]) {
      const x = side * (5.2 + i % 3 * .5);
      box(decor, edge, x, .1, 0, 1.5, .5, 1.5);
      box(decor, stone, x, 2.5, 0, .9, 5, .9);
      box(decor, edge, x, 5, 0, 1.5, .4, 1.5);
      box(decor, gold, x, 3.2, .48, .13, 1.2, .1);
      const fire = mesh(new THREE.IcosahedronGeometry(.23, 0), flame, decor, x, 4, .65); fire.scale.y = 1.7;
      box(decor, bark, x, 3.6, .6, .12, .65, .12);
      const treeX = side * (10 + (i * 7 % 9));
      mesh(new THREE.CylinderGeometry(.3, .6, 7, 5), bark, decor, treeX, 3.1, -5);
      mesh(new THREE.IcosahedronGeometry(3.8, 0), leaves, decor, treeX, 8, -5);
      mesh(new THREE.IcosahedronGeometry(2.8, 0), leafLight, decor, treeX + side * 2, 6.8, -4);
      mesh(new THREE.IcosahedronGeometry(2, 0), leaves, decor, treeX - side * 2, 6.4, -3);
      const rock = mesh(new THREE.DodecahedronGeometry(1.3, 0), moss, decor, side * 8, .2, 2); rock.scale.y = .75;
    }
    if (i % 3 === 0) {
      box(decor, stone, 0, 6.4, 0, 12, 1, 1.5);
      for (const side of [-1, 1]) box(decor, moss, side * 5.2, 5.9, 0, 1.3, .4, 1.8);
    }
    scene.add(decor); scenery.push(decor);
  }
  const water = mesh(new THREE.PlaneGeometry(210, 250), material('water', '#164d46', { roughness: .3, metalness: .2 }), scene, 0, -4, -60); water.rotation.x = -Math.PI / 2;
  const temple = new THREE.Group(); temple.position.z = -125;
  for (let i = 0; i < 6; i++) box(temple, stone, 0, i * .5, 0, 30 - i * 3, .6, 18 - i * 2);
  for (const side of [-1, 1]) box(temple, edge, side * 7, 8, 0, 3, 13, 3);
  box(temple, edge, 0, 15, 0, 19, 3, 4); box(temple, gold, 0, 12, .5, 3, 4, .5);
  scene.add(temple);
  mesh(new THREE.SphereGeometry(11, 16, 12), material('sun', '#ffe8b5', { emissive: '#ffcd80', emissiveIntensity: 1.5 }), scene, -39, 39, -150);

  const player = new THREE.Group(), body = new THREE.Group(); player.add(body); scene.add(player); player.position.z = 2;
  const shirt = material('shirt', '#26b9a6'), skin = material('skin', '#edbc85'), trousers = material('trousers', '#344454');
  const bag = material('bag', '#e28b44'), boots = material('boots', '#3a302e');
  box(body, shirt, 0, 1.65, 0, .72, .85, .48);
  box(body, bag, 0, 1.7, .37, .58, .67, .25);
  box(body, gold, 0, 1.72, .53, .3, .08, .05);
  mesh(new THREE.SphereGeometry(.32, 8, 8), skin, body, 0, 2.34, 0);
  const hat = mesh(new THREE.CylinderGeometry(.44, .44, .09, 10), bag, body, 0, 2.5, 0);
  mesh(new THREE.CylinderGeometry(.28, .35, .27, 8), bag, body, 0, 2.67, 0);
  const limbs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .48, 1.94, 0); body.add(arm);
    box(arm, shirt, 0, -.16, 0, .24, .38, .25); box(arm, skin, 0, -.47, 0, .2, .3, .22);
    const leg = new THREE.Group(); leg.position.set(side * .2, 1.2, 0); body.add(leg);
    box(leg, trousers, 0, -.3, 0, .27, .63, .29); box(leg, boots, 0, -.68, -.1, .3, .18, .45);
    limbs.push({ side, arm, leg });
  }
  const shadow = mesh(new THREE.CircleGeometry(.75, 20), new THREE.MeshBasicMaterial({ color: '#072322', transparent: true, opacity: .35, depthWrite: false }), scene, 0, .01, 2);
  shadow.rotation.x = -Math.PI / 2; shadow.scale.y = .55;

  const obstacles = [];
  function obstacle(action) {
    const group = new THREE.Group();
    if (action === 'jump') {
      box(group, dark, 0, .02, 0, 7.2, .04, 3.2);
      for (const z of [-1.6, 1.6]) box(group, edge, 0, .12, z, 7.5, .35, .3);
      for (const x of [-3.4, 3.4]) box(group, moss, x, .4, 0, .5, .8, 3.5);
    } else if (action === 'slide') {
      for (const x of [-3.3, 3.3]) box(group, edge, x, 1.55, 0, .55, 3.1, .9);
      box(group, edge, 0, 1.66, 0, 6.8, .8, 1);
      box(group, gold, 0, 1.7, .52, 5.8, .12, .05);
    } else {
      for (const x of action === 'left' ? [0, 2.45] : [-2.45, 0]) {
        box(group, stone, x, 1, 0, 2.2, 2, 1.1);
        box(group, gold, x, 1.1, .58, 1.5, .15, .06);
        mesh(new THREE.ConeGeometry(.32, .65, 4), edge, group, x, 2.25, 0);
      }
    }
    return group;
  }
  for (let i = 0; i < 3; i++) {
    const variants = Object.fromEntries(['jump', 'slide', 'left', 'right'].map(action => [action, obstacle(action)]));
    const root = new THREE.Group(); Object.values(variants).forEach(g => root.add(g)); scene.add(root); obstacles.push({ root, variants });
  }
  const coins = [];
  const coinGeo = new THREE.TorusGeometry(.22, .08, 5, 10); geometries.push(coinGeo);
  for (let i = 0; i < 24; i++) {
    const coin = new THREE.Mesh(coinGeo, gold); scene.add(coin); coins.push(coin);
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let disposed = false, raf, previous = performance.now(), lane = 0, previousRun, previousSequence = 0, previousAction, lastLevel, viewWidth = 1, viewHeight = 1, viewOffset = -1;
  const tones = ['#254943', '#324952', '#514939'];
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    viewWidth = width; viewHeight = height; viewOffset = -1;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  function frame(time) {
    if (disposed) return;
    const dt = Math.min(.05, (time - previous) / 1000); previous = time;
    const view = readState(), { state, solved } = view;
    const now = state?.phase === 'paused' && state.task ? state.task.deadline - state.pausedRemaining : view.now;
    const running = state?.phase === 'running', task = state?.task;
    if (state?.phase === 'countdown') { previousAction = null; previousSequence = 0; }
    // 把跑者留在输入面板上方，短屏也能看到跳跃和滑铲。
    const offset = running || state?.phase === 'paused' ? Math.max(0, Math.min(.49, 210 / viewHeight) - .1) : 0;
    if (offset !== viewOffset) { camera.setViewOffset(viewWidth, viewHeight, 0, viewHeight * offset, viewWidth, viewHeight); viewOffset = offset; }
    const distance = (state?.distance || 0) + (running ? Math.max(0, Math.min(now, task?.deadline + 350) - state.serverNow) / 1000 * state.speed : 0);
    const clock = running ? (state.activeMs || 0) / 1000 + Math.max(0, now - state.serverNow) / 1000 : (state?.activeMs || 0) / 1000;
    if (state?.id !== previousRun) { lane = 0; previousSequence = 0; previousAction = null; previousRun = state?.id; }
    if (state?.level !== lastLevel) { scene.fog.color.set(tones[((state?.level || 1) - 1) % tones.length]); lastLevel = state?.level; }
    road.forEach((tile, i) => { tile.position.z = 8 - i * 4.4 + distance % 4.4; });
    scenery.forEach((decor, i) => { decor.position.z = 9 - i * 16 + distance % 16; });
    if (running && task && (task.cleared || solved) && now >= task.deadline - 550 && task.sequence !== previousSequence) {
      previousSequence = task.sequence; previousAction = { action: task.action, at: task.deadline - 550 };
      if (task.action === 'left') lane = -2.45;
      if (task.action === 'right') lane = 2.45;
    }
    player.position.x += (lane - player.position.x) * Math.min(1, dt * 10);
    const actionProgress = previousAction ? (now - previousAction.at) / 1100 : 2;
    const doingAction = actionProgress >= 0 && actionProgress <= 1;
    player.position.y = doingAction && previousAction.action === 'jump' ? Math.sin(actionProgress * Math.PI) * 2.15 : 0;
    body.scale.y = doingAction && previousAction.action === 'slide' ? .45 : 1;
    body.rotation.x = doingAction && previousAction.action === 'slide' ? -.22 : 0;
    body.position.y = running && !reducedMotion ? Math.abs(Math.sin(clock * 10)) * .07 : 0;
    limbs.forEach(({ side, arm, leg }) => {
      leg.rotation.x = running ? Math.sin(clock * 10 + (side === 1 ? Math.PI : 0)) * .65 : .12 * side;
      arm.rotation.x = -leg.rotation.x;
    });
    shadow.position.x = player.position.x; shadow.scale.setScalar(1 - Math.min(.4, player.position.y * .15));
    const specs = task && ['running', 'paused'].includes(state.phase) ? [task, ...(state.upcoming || [])] : [];
    let deadline = task?.deadline || now;
    obstacles.forEach(({ root, variants }, index) => {
      const spec = specs[index]; root.visible = !!spec;
      if (!spec) return;
      if (index) deadline += 350 + spec.duration;
      root.position.z = 2 - (deadline - now) / 1000 * (state.speed || 8);
      Object.entries(variants).forEach(([action, group]) => { group.visible = action === spec.action; });
    });
    coins.forEach((coin, i) => {
      coin.position.set(i % 3 === 0 ? 2.45 : i % 3 === 1 ? 0 : -2.45, .8, 5 - i * 4.6 + distance % 4.6);
      coin.rotation.y = clock * 2 + i; coin.visible = coin.position.z < 1;
    });
    camera.position.x += (player.position.x * .28 - camera.position.x) * Math.min(1, dt * 3);
    camera.lookAt(player.position.x * .12, 1.05, -24);
    renderer.render(scene, camera); raf = requestAnimationFrame(frame);
  }
  const lost = event => { event.preventDefault(); onError?.('3D 场景暂时不可用，打字挑战仍可继续。'); };
  renderer.domElement.addEventListener('webglcontextlost', lost); raf = requestAnimationFrame(frame);
  return { dispose() {
    disposed = true; cancelAnimationFrame(raf); observer.disconnect(); renderer.domElement.removeEventListener('webglcontextlost', lost);
    new Set(geometries).forEach(g => g.dispose());
    const used = new Set(Object.values(materials)); used.add(shadow.material); used.forEach(m => m.dispose());
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  } };
}
