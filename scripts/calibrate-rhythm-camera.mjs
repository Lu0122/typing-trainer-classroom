// 最终验收：与 frontend/src/rhythm-stage.js 的相机实现逐字对应。
//
// 相机是常量（BASE_CAM_Z / BASE_CAM_Y），不随容器尺寸变化。
// 因此本脚本不做任何解算，只在各档视口下核对投影结果。
//
// 视口列表与 scripts/verify-arena-layout.mjs 保持一致：只列当前真实存在的
// 「左右两列 4:1」布局。旧的三行布局视口不在此处 —— 它们的赛道区宽高比
// 在当前布局下已不存在，留在列表里只会输出误导性的 FAIL。
//
// 判据：
//   judge ≈ 0.86（与 CSS 判定线重合）
//   far   > 0.15（远端在容器内，方块不从画面外凭空出现）
//   纵深  > 0.5 （下落路径铺满可见区）
//   轨道宽 30% ~ 100%（赛道区宽高比落在当前布局区间时的合理值）
//   单道宽 ≥ 9%（道窄到看不清就失去「四条道」的意义）
//   道间距 > 隙宽（四条道能分辨）
import * as THREE from 'three';
const BASE_WIDTH = 20, LANE_COUNT = 4, FOV = 52;
const BASE_CAM_Z = 9, BASE_CAM_Y = 31.48;
const BLOCK_SPAN = 0.94;
const LENGTH = BASE_WIDTH * (4 / 3);
const PITCH = BASE_WIDTH / LANE_COUNT;
// ── 方块与字母 ────────────────────────────────────────────────
// 必须与 frontend/src/rhythm-stage.js 顶部同名常量一致。
const BLOCK_H = 0.16, BLOCK_D = 0.66;
// 字母方框的世界边长，与 BLOCK_D 解耦（见 rhythm-stage.js 顶部说明）。
// 进深压到 0.66 去贴合效果图比例后，字母若仍跟着进深走会小到看不清，
// 所以字母的物理尺寸单独钉在这里。
const LETTER_BOX = 0.9;
// 方块在判定线处的放大（placeBlock 的 scale 上界）。
const BLOCK_SCALE = 1.22;
// 判定线处方块中心的 y（placeBlock 的 JUDGE_Y）与远端抬升量。
const JUDGE_Y = 0.12, FAR_LIFT = 0.1;
// 可见字形的目标像素高度。低于这个值方块上的字母就成了一横糊字。
const LETTER_PX_MIN = 15;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 2000);
const probe = new THREE.Vector3();
const ratioY = (y, z) => { probe.set(0, y, z).project(camera); return (1 - probe.y) / 2; };
const screenX = (x, y, z) => { probe.set(x, y, z).project(camera); return (probe.x + 1) / 2 * 100; };
// 世界点投影后的纵向像素值。用两点之差量「某个长度在屏幕上占多少像素」，
// 这样量出来的高度已经自动包含了透视远近与倾角的缩短。
const screenYpx = (x, y, z, h) => { probe.set(x, y, z).project(camera); return (1 - probe.y) / 2 * h; };
function layout(w, h) {
  camera.aspect = w / h;
  camera.position.set(0, BASE_CAM_Y, BASE_CAM_Z);
  camera.lookAt(0, 0, -LENGTH * 0.5);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
}
// 判定线处方块上的字母在屏幕上有多高（像素）。
//
// 直接量「方块中心 + 半个字母」与「方块中心 − 半个字母」两个世界点投影后的像素差，
// 这样透视缩短、倾角、容器高度全部自动算进去了，不用手写近似公式。
// 方块现在只有顶面贴字（平躺地砖），所以量的是顶面沿进深（Z）方向的投影高度：
// 字母方框边长 = LETTER_BOX（世界单位，不受进深影响）。
function letterPx(sh) {
  const y = JUDGE_Y;                    // 判定线处方块中心的 y（与 placeBlock 一致）
  const half = LETTER_BOX * BLOCK_SCALE / 2;
  return Math.abs(screenYpx(0, y, half, sh) - screenYpx(0, y, -half, sh));
}
// 远端方块顶面的屏幕位置。方块变高之后这是「会不会顶出赛道区上边缘」的关键量，
// 必须纳入判据，否则改高方块就悄悄越界了。
function farTopRatio() {
  const s = 0.82;                       // progress = 0 处的放大
  // 地砖平躺，顶点高度就是中心 + 半个厚度。
  return ratioY(JUDGE_Y + FAR_LIFT + (BLOCK_H / 2) * s, -LENGTH);
}
const JUDGE_TARGET = 0.86;
console.log('视口             赛道区         aspect  judge   far    纵深   轨道宽   单道宽  道间距  空隙  字母高  远端顶  结果');
let ok = true;
for (const [vp, sw, sh] of [
  ['1366×768·4:1', 762, 556], ['1440×900·4:1', 800, 700],
  ['1920×1080·4:1', 1036, 804], ['2560×1440·4:1', 1237, 1344],
]) {
  layout(sw, sh);
  const judge = ratioY(0, 0), far = ratioY(0, -LENGTH);
  const gap = Math.abs(screenX(PITCH / 2, 0.42, 0) - screenX(-PITCH / 2, 0.42, 0));
  const bw = Math.abs(screenX(PITCH * BLOCK_SPAN / 2, 0.42, 0) - screenX(-PITCH * BLOCK_SPAN / 2, 0.42, 0));
  const depth = judge - far;
  const frac = screenX(BASE_WIDTH / 2, 0, 0) - screenX(-BASE_WIDTH / 2, 0, 0);
  const laneW = frac / LANE_COUNT;
  const lp = letterPx(sh);
  const farTop = farTopRatio();
  const pass = Math.abs(judge - JUDGE_TARGET) < 0.06 && far > 0.15 && depth > 0.5
    && frac >= 30 && frac <= 100 && laneW >= 9 && (gap - bw) > 0.05
    && lp >= LETTER_PX_MIN && farTop > 0.02;
  if (!pass) ok = false;
  console.log(`${vp.padEnd(17)} ${String(sw).padStart(4)}×${String(sh).padEnd(4)}  ${(sw / sh).toFixed(2).padStart(5)}  ` +
    `${judge.toFixed(3)}  ${far.toFixed(3)}  ${depth.toFixed(3)}  ${frac.toFixed(1).padStart(5)}%  ${laneW.toFixed(2).padStart(5)}%  ` +
    `${gap.toFixed(2).padStart(6)}%  ${(gap - bw).toFixed(2).padStart(5)}%  ${lp.toFixed(1).padStart(5)}px  ` +
    `${farTop.toFixed(3).padStart(6)}  ${pass ? 'PASS' : 'FAIL'}`);
}
console.log(`\n全部 ${ok ? '通过' : '未通过'}`);
console.log(`相机 camZ=${BASE_CAM_Z} camY=${BASE_CAM_Y}（常量，不随容器变化）· 轨道世界宽 ${BASE_WIDTH}`);
console.log('判据：judge ≈ 0.86（±0.06，与 CSS 判定线重合）· far > 0.15 · 纵深 > 0.5');
console.log('      轨道宽 30% ~ 100% · 单道宽 ≥ 9% · 道间空隙 > 0.05%（四条道可分辨）');
console.log(`      方块上字母的屏幕高度 ≥ ${LETTER_PX_MIN}px（低于此值字形糊成一条线）`);
console.log('      远端方块顶面 > 0.02（不顶出赛道区上边缘）');
console.log('      视口与 scripts/verify-arena-layout.mjs 对齐（左右两列 4:1 布局）');
