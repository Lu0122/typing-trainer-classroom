// 复现「生死时速」判定与平衡：用假时钟跑完整局，打印双方位置与视觉角度。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { ChaseRoom, ROUND_MS, TRACK_METERS, THIEF_HEADSTART, STEP_METERS } = require('../src/chase.js');

const BASE_ANGLE = { police: 145, thief: 270 };
function visualAngle(room, player) {
  return (BASE_ANGLE[player.role] + (room.position(player) / TRACK_METERS) * 360 + 360) % 360;
}

function run({ humanRole, cps, accuracy, label }) {
  let t = 1_000_000;
  const now = () => t;
  const room = new ChaseRoom({ code: '1', now });
  const user = { id: 'u1', displayName: '玩家' };
  room.create(user, humanRole);
  room.addBot(user, humanRole);
  // addBot 内部直接 start()，先推进到 running
  t += 3_000; room.tick();
  const me = () => room.players.get('u1');
  const bot = () => room.players.get('cpu');

  const stepMs = Math.round(1000 / cps);
  let typed = 0, correct = 0, wrong = 0, catchAt = null;
  while (room.phase === 'running' && t < 1_000_000 + 3_000 + ROUND_MS + stepMs * 2) {
    t += stepMs;
    const player = me();
    if (!player?.task) break;
    const task = player.task;
    if (task.typed.length >= task.text.length) { room.next('u1', { seat: player.seat, ticket: task.id }); continue; }
    const nextIndex = task.typed.length;
    const expect = task.text[nextIndex];
    const isWrong = Math.random() > accuracy;
    const char = isWrong ? (expect === 'x' ? 'y' : 'x') : expect;
    typed++;
    if (isWrong) wrong++; else correct++;
    room.type('u1', { seat: player.seat, ticket: task.id, text: task.typed + char });
    if (room.phase === 'finished' && catchAt === null) catchAt = t - room.startedAt;
  }
  const police = room.players.get(humanRole === 'police' ? 'u1' : 'cpu');
  const thief = room.players.get(humanRole === 'thief' ? 'u1' : 'cpu');
  const policePos = room.position(police), thiefPos = room.position(thief);
  const policeAngle = visualAngle(room, police), thiefAngle = visualAngle(room, thief);
  console.log(`\n[${label}] human=${humanRole} cps=${cps} acc=${accuracy}`);
  console.log(`  结果 outcome=${room.result?.outcome} winner=${room.result?.winnerRole} 用时=${((room.result?.durationMs || 0) / 1000).toFixed(1)}s catchAt=${catchAt === null ? '未追上' : (catchAt / 1000).toFixed(1) + 's'}`);
  console.log(`  警察 position=${policePos.toFixed(1)}  小偷 position=${thiefPos.toFixed(1)}  差值=${(thiefPos - policePos).toFixed(1)}m`);
  console.log(`  视觉角度 警察=${policeAngle.toFixed(1)}° 小偷=${thiefAngle.toFixed(1)}° 屏幕间隔≈${(Math.abs(thiefAngle - policeAngle) / 360 * TRACK_METERS).toFixed(0)}m(折算)`);
  console.log(`  已输入 ${typed} 字（正确 ${correct}/错误 ${wrong}），AI 位置=${room.position(bot()).toFixed(1)}`);
}

console.log(`THIEF_HEADSTART=${THIEF_HEADSTART} STEP=${JSON.stringify(STEP_METERS)} TRACK=${TRACK_METERS} 视觉基准角=${JSON.stringify(BASE_ANGLE)}`);
console.log(`起始视觉间隔≈${(((BASE_ANGLE.thief + THIEF_HEADSTART / TRACK_METERS * 360) - BASE_ANGLE.police) / 360 * TRACK_METERS).toFixed(0)}m(折算)`);

run({ humanRole: 'police', cps: 4, accuracy: 1, label: '人当警察' });
run({ humanRole: 'police', cps: 6, accuracy: 0.8, label: '人当警察-失误多' });
run({ humanRole: 'thief', cps: 4, accuracy: 1, label: '人当小偷' });
run({ humanRole: 'thief', cps: 7, accuracy: 0.95, label: '人当小偷-手快' });
