const test = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const cameraModule = import('../frontend/src/chase-camera.mjs');
const motionModule = import('../frontend/src/chase-motion.mjs');

test('追逐视角在弯道、跨圈和横竖屏中始终容纳两名骑手', async () => {
  const { chasePursuitFrame, chaseRiderPoint } = await cameraModule;
  for (const aspect of [.45, .88, 16 / 9, 2.05, 4.4]) {
    for (const position of [0, 65, 130, 195, 260, 325, 390, 519]) {
      for (const gap of [0, 3, 6, 16, 40, 80, 129, 130, 260, 519, 520, 1040]) {
        const frame = chasePursuitFrame(position, position + gap, aspect);
        const camera = new THREE.PerspectiveCamera(52, aspect, .1, 240);
        camera.position.set(frame.position.x, frame.position.y, frame.position.z);
        camera.lookAt(frame.look.x, frame.look.y, frame.look.z);
        camera.updateMatrixWorld();
        for (const role of ['police', 'thief']) {
          const point = chaseRiderPoint(position + (role === 'thief' ? gap : 0), role);
          for (const height of [.25, 3.15]) {
            for (const offset of [-1.5, 1.5]) {
              const projected = new THREE.Vector3(point.x + point.tx * offset, height, point.z + point.tz * offset).project(camera);
              const context = `${role}, aspect ${aspect}, position ${position}, gap ${gap}`;
              assert.ok(Math.abs(projected.x) < .93, `骑手横向越界: ${context}, x=${projected.x}`);
              assert.ok(Math.abs(projected.y) < .9, `骑手纵向越界: ${context}, y=${projected.y}`);
              assert.ok(projected.z > -1 && projected.z < 1, `骑手被远近平面裁掉: ${context}`);
            }
          }
        }
      }
    }
  }
});

test('开局两人分开可见，接近时镜头收紧，远距离切为高空取景', async () => {
  const { chasePursuitFrame, chaseRiderPoint } = await cameraModule;
  for (const position of [0, 130, 260, 390, 519]) {
    const frame = chasePursuitFrame(position, position + 16);
    const camera = new THREE.PerspectiveCamera(52, 16 / 9, .1, 240);
    camera.position.set(frame.position.x, frame.position.y, frame.position.z);
    camera.lookAt(frame.look.x, frame.look.y, frame.look.z); camera.updateMatrixWorld();
    const projected = ['police', 'thief'].map(role => {
      const p = chaseRiderPoint(position + (role === 'thief' ? 16 : 0), role);
      return new THREE.Vector3(p.x, 1.75, p.z).project(camera);
    });
    assert.ok(Math.abs(projected[1].x - projected[0].x) > .65, '开局两名骑手应分开可见');
    const near = chasePursuitFrame(position, position + 3);
    assert.ok(near.position.y < frame.position.y);
    assert.equal(near.wide, false);
    assert.equal(chasePursuitFrame(position, position + 130).wide, true);
  }
});

test('追平时车头与车尾相接，未追平前保持分离', async () => {
  const { chaseRiderPoint, RIDER_HALF_LENGTH } = await cameraModule;
  const { chasePoint } = await motionModule;
  for (const position of [0, 130, 260, 390, 520]) {
    const anchor = chasePoint(position), police = chaseRiderPoint(position, 'police'), thief = chaseRiderPoint(position, 'thief');
    assert.ok(Math.hypot(police.x + police.tx * RIDER_HALF_LENGTH - anchor.x, police.z + police.tz * RIDER_HALF_LENGTH - anchor.z) < 1e-10);
    assert.ok(Math.hypot(thief.x - thief.tx * RIDER_HALF_LENGTH - anchor.x, thief.z - thief.tz * RIDER_HALF_LENGTH - anchor.z) < 1e-10);
    const ahead = chasePoint(position + 3);
    assert.ok(Math.hypot(ahead.x - anchor.x, ahead.z - anchor.z) > .6);
  }
});

test('距离提示使用累计米数，跨圈不误报接近，接近等级边界准确', async () => {
  const { chasePressure, chasePursuitFrame } = await cameraModule;
  assert.deepEqual(chasePressure(5.2), { gap: 5.2, label: '5.2', level: 'danger', laps: 0 });
  assert.equal(chasePressure(6).level, 'danger');
  assert.equal(chasePressure(6.01).level, 'near');
  assert.equal(chasePressure(12).level, 'near');
  assert.equal(chasePressure(12.01).level, 'normal');
  assert.equal(chasePressure(-2).label, '0.0');
  assert.equal(chasePressure(.04).label, '<0.1', '尚未追平时不能提前显示零距离');
  assert.equal(chasePressure(536).label, '536');
  assert.equal(chasePressure(536).laps, 1);
  assert.equal(chasePressure(810, 800).laps, 1);
  assert.equal(chasePursuitFrame(519, 1055).gap, 536);
  const frame = chasePursuitFrame(519, 535), nextLap = chasePursuitFrame(1039, 1055);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(frame.position[axis] - nextLap.position[axis]) < 1e-10);
});
