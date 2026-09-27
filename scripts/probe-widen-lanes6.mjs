// 探针 6：把「道真的更宽」当成一个优化问题解。
//
// 前五个探针排除了三条路，得到一条硬约束链：
//   · 判定线 judge 必须锁在 0.86（要与 CSS 那条线重合）—— 这是硬约束。
//   · judge 只由 camY / camZ / 世界坐标决定，与 aspect 无关。
//   · 轨道占宽 frac 同时受 camera、世界尺度、aspect 影响，但**在 judge 锁定的前提下**，
//     frac 几乎只由 aspect 决定（探针 3、4）。
//
// 所以问题变成：在 judge=0.86 的约束面上，怎么把「单条道的屏幕占宽」最大化？
// 自由度：
//   (a) camZ / camY  —— 决定视角
//   (b) BASE_WIDTH   —— 世界尺度（决定纵深 LENGTH = W×4/3，也决定 pitch）
//   (c) 整个赛道在画面里的横向填充率（floor 的富余边）—— 不影响 frac，只影响观感
//
// 本脚本在 (camZ, camY, BASE_WIDTH) 上做网格搜索，目标：judge→0.86 且 frac 最大。
// aspect 取实际赛道区宽高比。
import * as THREE from 'three';

const FOV = 52;
const TARGET = 0.861;
const LANE_COUNT = 4;
const probe = new THREE.Vector3();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 2000);
const ratioY = (y, z) => { probe.set(0, y, z).project(camera); return (1 - probe.y) / 2; };
const screenX = (x, y, z) => { probe.set(x, y, z).project(camera); return (probe.x + 1) / 2 * 100; };

function evaluate({ width, camZ, camY, aspect }) {
  const length = width * (4 / 3);
  camera.aspect = aspect;
  camera.position.set(0, camY, camZ);
  camera.lookAt(0, 0, -length * 0.5);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const judge = ratioY(0, 0), far = ratioY(0, -length);
  const frac = screenX(width / 2, 0, 0) - screenX(-width / 2, 0, 0);
  return { judge, far, depth: judge - far, frac, laneW: frac / LANE_COUNT };
}

// aspect 取 4:1 布局下 1920×1080 的赛道区宽高比 1.30（探针 5 实测）。
const ASPECT = 1.30;

// 对给定 (width, camZ)，二分 camY 把 judge 打到目标 —— 注意必须走峰值右侧分支。
function solve({ width, camZ }) {
  let lo = camZ * 2.4, hi = camZ * 40;
  const jLo = evaluate({ width, camZ, camY: lo, aspect: ASPECT }).judge;
  const jHi = evaluate({ width, camZ, camY: hi, aspect: ASPECT }).judge;
  if ((jLo - TARGET) * (jHi - TARGET) > 0) return null;
  let best = null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const r = evaluate({ width, camZ, camY: mid, aspect: ASPECT });
    if (best === null || Math.abs(r.judge - TARGET) < Math.abs(best.judge - TARGET)) best = { ...r, camY: mid };
    if (r.judge > TARGET) lo = mid; else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return best;
}

console.log(`约束 judge=0.861，赛道区 aspect=${ASPECT}。搜索 (BASE_WIDTH, camZ)：\n`);
console.log('BASE_WIDTH  camZ   =>  camY    judge   far    纵深   轨道占宽  单道宽');
const results = [];
for (const width of [10, 15, 20, 30, 45, 60, 90]) {
  for (const camZ of [2, 3, 4.4, 6, 9, 14, 22, 35]) {
    const s = solve({ width, camZ });
    if (!s) continue;
    if (Math.abs(s.judge - TARGET) > 1e-6) continue;
    if (s.far < 0.15 || s.depth < 0.5) continue;
    results.push({ width, camZ, camY: s.camY, ...s });
    console.log(`${String(width).padStart(10)}  ${String(camZ).padStart(4)}   =>  ${s.camY.toFixed(2).padStart(6)}  ` +
      `${s.judge.toFixed(3)}  ${s.far.toFixed(3)}  ${s.depth.toFixed(3)}  ${s.frac.toFixed(1).padStart(6)}%  ${s.laneW.toFixed(2).padStart(5)}%`);
  }
}

results.sort((a, b) => b.laneW - a.laneW);
console.log('\n按单道宽排序的前 8 名（单道宽 = 轨道占宽 / 4）：');
for (const r of results.slice(0, 8)) {
  console.log(`  BASE_WIDTH=${String(r.width).padStart(3)} camZ=${String(r.camZ).padStart(4)} camY=${r.camY.toFixed(1).padStart(6)}  ` +
    `轨道占宽 ${r.frac.toFixed(1)}%  单道宽 ${r.laneW.toFixed(2)}%  far=${r.far.toFixed(3)} 纵深=${r.depth.toFixed(3)}`);
}
