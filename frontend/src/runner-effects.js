import * as THREE from 'three';

export function createRunnerEffects(scene, assets, reducedMotion) {
  const count = 160, positions = new Float32Array(count * 3), tints = new Float32Array(count * 3);
  const alphas = new Float32Array(count), sizes = new Float32Array(count);
  const particles = Array.from({ length: count }, () => ({ age: 1, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gravity: 0 }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1)); geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 600 } },
    vertexShader: `attribute vec3 aTint; attribute float aAlpha; attribute float aSize; uniform float uScale; varying vec3 vTint; varying float vAlpha;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(aSize*uScale/max(.2,-p.z),1.0,55.0);vTint=aTint;vAlpha=aAlpha;}`,
    fragmentShader: `varying vec3 vTint; varying float vAlpha;void main(){vec2 p=gl_PointCoord*2.0-1.0;float glow=pow(max(0.0,1.0-dot(p,p)),1.8);if(glow<.01)discard;gl_FragColor=vec4(vTint,glow*vAlpha);
      #include <colorspace_fragment>
    }` });
  const cloud = new THREE.Points(geometry, material); cloud.frustumCulled = false; scene.add(cloud);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#8affc4', transparent: true, opacity: 0, depthWrite: false });
  const ripple = new THREE.Mesh(assets.ring, ringMaterial); ripple.rotation.x = -Math.PI / 2; scene.add(ripple);
  let cursor = 0, ringAge = 1, ringLife = 0, impactAge = 2, stepAge = 0;
  const color = new THREE.Color();
  function burst(kind, x, y, z, amount) {
    const dust = kind === 'dust', hit = ['miss', 'stone', 'fall'].includes(kind);
    for (let i = 0; i < (reducedMotion ? Math.min(8, amount) : amount); i++) {
      const index = cursor++ % count, p = particles[index], angle = Math.random() * Math.PI * 2;
      const speed = dust ? .5 + Math.random() * 1.5 : 1.5 + Math.random() * 3;
      Object.assign(p, { age: 0, life: dust ? .35 + Math.random() * .25 : .4 + Math.random() * .35,
        x, y, z, vx: Math.cos(angle) * speed, vy: dust ? .3 + Math.random() : 1 + Math.random() * 3,
        vz: Math.sin(angle) * speed, gravity: dust ? 1 : kind === 'fall' ? 15 : kind === 'respawn' ? -2 : 7 });
      color.set(dust || kind === 'stone' ? '#d9c799' : hit ? (i % 2 ? '#ffad54' : '#ff6350') : kind === 'respawn' ? (i % 2 ? '#ffe5a0' : '#d2fff3') : (i % 2 ? '#fff0ad' : '#8affc4'));
      tints[index * 3] = color.r; tints[index * 3 + 1] = color.g; tints[index * 3 + 2] = color.b;
      sizes[index] = dust ? .22 + Math.random() * .24 : .12 + Math.random() * .16;
    }
    geometry.attributes.aTint.needsUpdate = true; geometry.attributes.aSize.needsUpdate = true;
  }
  function contact(event, x, z, elevation = 0) {
    if (event.kind === 'miss') {
      impactAge = 0;
      if (event.action === 'jump') burst('fall', x, .1, z, 25);
      else if (event.action === 'slide') { burst('stone', x, 1.7, z - .2, 32); burst('dust', x, .1, z, 24); }
      else burst('miss', x, 1.2, z - .2, 48);
    }
    else if (event.kind === 'land') burst('dust', x, .08, z, 42);
    else if (event.kind === 'respawn') {
      burst('respawn', x, .4, z, 60); ringAge = 0; ringLife = .85;
      ripple.position.set(x, .11, z); ringMaterial.color.set('#ffe09a');
    }
    else {
      burst('pass', x, .65 + elevation, z, 32);
      ringAge = 0; ringLife = .5; ripple.position.set(x, .11, z); ringMaterial.color.set('#8affc4');
      if (event.action === 'slide') burst('dust', x, .08, z, 18);
    }
  }
  function frame(delta, moving, x, z, grounded) {
    if (!moving) return { shake: 0, recoil: 0 };
    impactAge += delta; ringAge += delta; stepAge += delta;
    if (grounded && stepAge > .24) { stepAge = 0; burst('dust', x, .05, z + .15, 3); }
    for (let i = 0; i < count; i++) {
      const p = particles[i]; p.age += delta;
      if (p.age >= p.life) { alphas[i] = 0; continue; }
      p.x += p.vx * delta; p.y += p.vy * delta; p.z += p.vz * delta; p.vy -= p.gravity * delta;
      positions[i * 3] = p.x; positions[i * 3 + 1] = Math.max(.02, p.y); positions[i * 3 + 2] = p.z;
      alphas[i] = (1 - p.age / p.life) * .78;
    }
    geometry.attributes.position.needsUpdate = true; geometry.attributes.aAlpha.needsUpdate = true;
    const progress = ringAge / ringLife; ripple.visible = progress < 1;
    if (ripple.visible) { ripple.scale.setScalar(.35 + progress * 2.3); ringMaterial.opacity = (1 - progress) * .85; }
    return { shake: reducedMotion ? 0 : Math.max(0, 1 - impactAge / .26) * .075,
      recoil: Math.max(0, 1 - impactAge / .42) };
  }
  return { contact, burst, frame, resize(height, ratio) { material.uniforms.uScale.value = height * ratio * .6; },
    dispose() { geometry.dispose(); material.dispose(); ringMaterial.dispose(); } };
}
