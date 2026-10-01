// 四道下落音游的 three.js 舞台。
//
// 为什么单独抽成模块而不是写在 .vue 组件里：
//   渲染状态（场景、相机、实例网格、粒子池）是纯命令式的一坨，与 Vue 的响应式无关。
//   混在 setup 里会让「哪部分每帧在动、哪部分只在 props 变化时动」变得不可读，
//   也容易让渲染循环误读到响应式代理造成额外开销。
//
// 时间轴是最关键的一点：
//   服务端只以 1Hz 下发 elapsed，`chart.notes` 也只包含「还在下落窗口内」的音符 ——
//   直接拿这两个值画方块，方块会每秒跳一格，且刚进入视野的音符会凭空出现在半空中。
//   因此调用方（Vue 组件）负责两件事：用本地 rAF 时钟外推 elapsed、把音符缓存到判定后才移除；
//   本模块只管「给定一份方块列表和当前 elapsed，把它们画在对的位置」。
import * as THREE from 'three';

export const LANE_COUNT = 4;
// ── 轨道尺度 ────────────────────────────────────────────────────
// z = 0 是判定线，z = -LENGTH 是远处的生成点，LENGTH = 宽 × 4/3。
// 纵深比这个更长，远端会被画面顶边裁掉；更短则方块显得"从眼前冒出来"。
//
// 三个常量：世界轨道宽、相机位置。相机是**常量**，不随容器尺寸变化。
//
// 为什么相机不动：透视投影下世界点的**纵向**屏幕比例只由 camY/camZ/坐标决定，
// 与 aspect 无关（aspect 只改投影矩阵的 x 分量，y 分量恒为 cot(fov/2)）。
// 相机不动，判定线就永远落在同一屏幕高度 —— 这正是它必须与 CSS 判定线对齐的量。
//
// 这组值的来历（scripts/probe-widen-lanes6.mjs 网格搜索）：
// 在「判定线锁死 0.861」的约束面上，把相机往后拉（camZ 变大）并把 camY 同步抬高，
// 轨道在画面里会真的变宽 —— 单道占宽从 11.88% 提到 12.76%（1920×1080 赛道区实测）。
// 曾经试过的两条路都已证伪：
//   · 世界与相机同乘 k → 逐像素不变（相似变换不变性），占宽纹丝不动。
//   · 只改 BASE_WIDTH 不动相机 → 判定线冲到 1.0 以上，飞出容器。
const BASE_WIDTH = 20;
const BASE_CAM_Z = 9;
const BASE_CAM_Y = 31.48;
// 方块横向占道宽的比例。加大它 = 道里的方块更宽、彼此更近。
// 上限受「相邻道的方块必须留缝」约束：四条道的分布是玩家判断用哪只手的唯一依据，
// 连成一片就看不出道了。
// 注意还有一层约束：方块在判定线附近会乘上 1.22 的放大（见 placeBlock 的 scale），
// 所以真实占宽是 BLOCK_SPAN × 1.22。0.94 × 1.22 = 1.15 —— 已经越过道宽。
// 但效果图里方块本就几乎占满道、且在判定线处会立即被判定收走，
// 所以这里让它在近端略微压过道线，视觉上更接近"铺满整条道"。
// 若将来觉得近端两道方块粘连，把 scale 上界从 1.22 收到 1.1 即可。
const BLOCK_SPAN = 0.94;
// 方块本体的基准尺寸（未乘 progress 缩放）。三轴分别定义：
//   X：横向 —— 占道宽的 BLOCK_SPAN。效果图里的方块几乎占满整条道，所以取 0.94。
//   Y：厚度 —— 0.16。**极薄**：效果图的方块是平躺在道面上的地砖，没有立起来的正面。
//   Z：纵深 —— 0.66，即地砖的"进深"。它决定屏幕上这块砖看起来多高。
//
// 形态是按用户给的效果图定的：方块只留一个**顶面**（+Y），完全放平。
// 这样有两个好处，都是之前「立起键块」实现不了的：
//   1. 字母只出现在一个面上，不会顶面+正面各印一份（近处方块会看到重影）。
//   2. 顶面没有透视缩短以外的干扰，字母可以铺得更大。
//
// 为什么厚度取 0.16 而不是 0：完全零厚度会让方块在侧视时变成一条线，
// 而且相邻方块落地时会瞬间贴在一起、看不出先后。留一点厚度既保住地砖的观感，
// 又能在方块前后错开时给出一点体积暗示。
//
// 进深 0.66 是照效果图量出来的，不是拍的：效果图右道里三块方块的
//   屏幕宽/高 = 6.43 / 7.75 / 8.00；换成世界坐标就是「宽 ÷ 进深」的比值。
//   我们原先取 0.9，实测同一口径只有 5.3~6.0 —— 方块显得「又短又厚」，
//   与效果图那种扁平横条有明显差距。按比值反解，进深收到 0.66 才能落回 7~8。
const BLOCK_H = 0.16;
const BLOCK_D = 0.66;
// 字母方框的**世界边长**（正方形），与 BLOCK_D 解耦。
//
// 为什么不让字母跟着进深走：进深已经压到 0.66 去贴合效果图比例了，
// 若字母仍由 min(顶面宽, 进深) 决定，字母高度会被进深绑死，
// 远端只剩个位数像素（判据要求 ≥15px）。
// 这里直接把字母的物理尺寸钉死在 0.9 世界单位 —— 略大于地砖进深，
// 于是字母在顶面上会「上下压边」（描边刚好贴住砖的前后沿），
// 视觉上正是效果图那种「字撑满砖面」的观感，同时保证远处也读得清。
const LETTER_BOX = 0.9;
const NOTE_LIMIT = 96;            // 同屏方块上限（实例化网格一次绘制）
const SPARK_LIMIT = 160;          // 命中/漏键粒子池

const TONE = {
  perfect: new THREE.Color('#7be5d5'),
  great: new THREE.Color('#8fd0f0'),
  good: new THREE.Color('#e9c877'),
  miss: new THREE.Color('#ff8a9b'),
  idle: new THREE.Color('#6fd8ca'),
  past: new THREE.Color('#a8697c'),
};
// 左右手各用一种底色，玩家一眼能分出「这只手该动」。
const LANE_TINT = [0x2a6f7d, 0x2f5f8a, 0x2a6f7d, 0x2f5f8a];
const JUDGE_FX_MS = 240;          // 判定后方块收缩淡出的时长
const GROOVE_BASE_OPACITY = 0.26; // 道槽基础亮度，render 时在其附近做呼吸起伏

// ── 字母图集 ──────────────────────────────────────────────────
// 方块上要显示对应的字母，但 InstancedMesh 的所有实例共用一份几何与材质，
// 没法给每个实例贴不同的图。标准解法是「图集 + 逐实例 UV 偏移」：
// 把 26 个字母排成一张 8×4 的网格贴图，每个实例用 InstancedBufferAttribute
// 把自己的 UV 偏移传进去，在顶点着色器里改写 uv 采样窗口。
// 这样仍然是一次 draw call，方块上的字母各不相同。
const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;                    // 8 × 4 = 32 ≥ 26
const ATLAS_CELL = 128;                  // 每个格子的像素边长
// 字形只占格子中间的 96px，四边各留 16px 空白。留白是为了 mipmap：
// 方块绝大多数时间在远处，纹理是被**缩小**采样的，必须靠 mipmap 抗锯齿。
// 而 mipmap 的粗层会把相邻字格混进来 —— 留白就是给这种串色留的缓冲。
const ATLAS_GLYPH = 96;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function buildLetterAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * ATLAS_CELL;
  canvas.height = ATLAS_ROWS * ATLAS_CELL;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#eafffb';
  ctx.font = `700 ${ATLAS_GLYPH}px Consolas, "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < ALPHABET.length; i++) {
    const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
    // 加一层暗色描边：方块本体是青色系的，白字直接压上去在亮块上会发虚。
    const cx = col * ATLAS_CELL + ATLAS_CELL / 2;
    const cy = row * ATLAS_CELL + ATLAS_CELL / 2;
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#07222b';
    ctx.strokeText(ALPHABET[i], cx, cy);
    ctx.fillText(ALPHABET[i], cx, cy);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // 开 mipmap + 三线性过滤：远处方块上的字母才不会抖成一片噪点。
  // 留白（见 ATLAS_GLYPH 的注释）保证粗层不会把邻格的字母混进来。
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

// 某字母在图集里的 UV 偏移（左上角为原点）。
function atlasOffset(letter) {
  const index = ALPHABET.indexOf(letter);
  if (index < 0) return { x: 0, y: 0 };
  const col = index % ATLAS_COLS, row = Math.floor(index / ATLAS_COLS);
  // three 的 uv 原点在左下角，图集的行是从上往下排的，所以 y 要翻过来。
  return { x: col / ATLAS_COLS, y: 1 - (row + 1) / ATLAS_ROWS };
}

export function createStage(host, options = {}) {
  // 判定线在容器里的纵向位置（0=顶、1=底）。由组件传入 judgeRatio，
  // 使三维场景的发光带与 CSS 画的那条判定线落在同一高度上。
  const JUDGE_SCREEN_RATIO = options.judgeRatio ?? 0.86;
  // 某条道的中心 x（基准尺度）。四条道等宽铺在 [-BASE_WIDTH/2, BASE_WIDTH/2] 上。
  const baseLaneX = (lane) => -BASE_WIDTH / 2 + (BASE_WIDTH / LANE_COUNT) * (lane + 0.5);

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // ── 相机 ────────────────────────────────────────────────────
  // 相机位置 = 基准位置 × 缩放系数 k（k 由 layout() 按容器宽高比算出）。
  //
  // 透视投影下，把世界与相机**同时**按 k 缩放，投影结果完全不变 ——
  // 所以纵向布局（判定线落在哪、远端落在哪）由基准尺度唯一钉死，
  // 与容器宽高比无关；k 只决定轨道在画面里占多少横向宽度。
  //
  // 基准位置的来历（scripts/calibrate-rhythm-camera.mjs，11 档视口 0.92 ~ 8.00 实测）：
  //   BASE_CAM_Z = 4.4、BASE_CAM_Y = 26 → 判定线一律落在屏幕 0.860、远端 0.241。
  //
  // 关键原理：世界点的**纵向**屏幕比例只由 camY/camZ/坐标决定，与 aspect 无关
  // （aspect 只改变投影矩阵的 x 分量；y 分量永远是 cot(fov/2)）。
  // 因此只要相机不动，判定线永远落在同一屏幕高度 —— 这正是它必须与 CSS 判定线对齐的量。
  //
  // ── 曾经的错误做法（别再走回去）────────────────────────────
  // ① 把 camZ 绑死在「轨道总宽恒定占视口宽 92%」上：
  //      camZ = WIDTH / (0.92 · 2 · tan(fov/2) · aspect)
  //    这等于用**横向**需求去决定**纵向**布局。容器越窄高 → camZ 越大 → 相机越退越远，
  //    纵向空间被摊薄，判定线反而上不去。实测 judge 峰值：
  //      aspect 5.29 → 1.295（可达）；aspect 1.29 → 0.797；aspect 0.92 → 0.727（都够不到 0.86）
  //    这是 4:1 布局下 2560×1440 判定线卡在 0.755 的根因。
  // ② 对 camY 二分求判定线落点：judge 关于 camY 是**单峰**函数
  //    （峰值在 camY/camZ ≈ 1.3~2.0，之后单调回落趋向 0.5），二分必然越过峰值顶到边界，
  //    实测跑出 camY = 1262 这种荒谬值。
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1200);

  // ── 可缩放场景 ──────────────────────────────────────────────
  // 静态几何体在建好尺寸后不便改（改几何要重建 BufferGeometry，代价高），
  // 所以把它们放进一个 Group，靠 group.scale 做整体缩放 —— 一次赋值即可。
  // 方块与粒子的**位置**在 render 里逐帧写入，那边直接乘 k 即可，无需缩放容器。
  const world = new THREE.Group();
  scene.add(world);

  const disposables = [];
  const track = (object) => { disposables.push(object.geometry, object.material); return object; };
  const plane = (w, h, color, opacity, rotationX = -Math.PI / 2) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    );
    mesh.rotation.x = rotationX;
    return track(mesh);
  };

  // ── 静态场景 ────────────────────────────────────────────────
  // 全部按基准尺度直接建成世界坐标（相机已是常量，不需要任何缩放补偿）。
  const LENGTH = BASE_WIDTH * (4 / 3);
  const floor = plane(BASE_WIDTH + 9, LENGTH + 16, 0x16213a, 0.72);
  floor.position.set(0, 0, -LENGTH / 2);
  world.add(floor);

  // 道线：四条道在视觉上分开；两侧外框略亮，形成"赛道"的边界感。
  // 内部分隔线的亮度和道槽接近，靠"线 + 槽"两层叠加让四条道一眼可辨 ——
  // 只画细线时，在低矮轨道上几乎看不见，玩家会以为只有一块整片场地。
  for (let i = 0; i <= LANE_COUNT; i++) {
    const edge = i === 0 || i === LANE_COUNT;
    const line = plane(edge ? 0.42 : 0.2, LENGTH + 8, edge ? 0x62d0e4 : 0x4f9fb8, edge ? 0.68 : 0.42);
    line.position.set(-BASE_WIDTH / 2 + (BASE_WIDTH / LANE_COUNT) * i, 0.02, -LENGTH / 2);
    world.add(line);
  }

  // 每条道铺一条底槽，方块是"跑在槽里"而不是浮在空地上。
  // 左两道偏青、右两道偏蓝：颜色本身就是「哪只手」的提示。
  const grooves = [];
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const groove = plane(BASE_WIDTH / LANE_COUNT - 0.42, LENGTH + 6, LANE_TINT[lane], GROOVE_BASE_OPACITY);
    groove.position.set(baseLaneX(lane), 0.04, -LENGTH / 2);
    world.add(groove);
    grooves.push(groove);
  }

  // 判定线：发光横条 + 更宽的一层光晕。
  const judgeBar = plane(BASE_WIDTH + 1.6, 0.28, 0x7be5d5, 0.92);
  judgeBar.position.set(0, 0.06, 0);
  world.add(judgeBar);
  const judgeGlow = plane(BASE_WIDTH + 5, 3.4, 0x7be5d5, 0.14);
  judgeGlow.position.set(0, 0.05, 0.6);
  world.add(judgeGlow);

  // 每条道在判定线处的受击条：命中时该道闪一下，明确指出"是哪条道被按中了"。
  const laneHits = [];
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const bar = plane(BASE_WIDTH / LANE_COUNT - 0.6, 0.62, 0x9ff5e6, 0);
    bar.position.set(baseLaneX(lane), 0.08, 0);
    world.add(bar);
    laneHits.push(bar);
  }

  // ── 下落方块：实例化网格 ─────────────────────────────────────
  // 几何体是立方体（像参考图里的键块），带顶点色以支持逐实例上色。
  // 纹理 UV 由 BoxGeometry 自带，每个面都是 0..1 的整块，正好用来贴字母。
  const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
  blockGeometry.setAttribute('color', new THREE.Float32BufferAttribute(
    new Array(blockGeometry.attributes.position.count * 3).fill(1), 3,
  ));
  const blockMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.97 });

  // 给方块材质挂上字母图集与逐实例 UV 偏移。
  //
  // 为什么不用「每帧重建材质数量张纹理」：一个区块最多 96 个方块，那样会退化成 96 次
  // 材质切换 + 96 次 draw call，下落时的顺滑度立刻垮掉。图集方案仍然只有 1 次 draw call。
  //
  // GLSL 里做三件事：
  //   1. **只让顶面显示字母** —— 方块是平躺的地砖，玩家看到的就是顶面。
  //      其他面不贴字：正面/侧面在透视里被压成一条线，底面根本背对镜头。
  //   2. 用实例属性 aAtlas 把采样窗口平移到该字母所在的那一格。
  //   3. **把字母压进一个居中的方框**，而不是铺满整个面。
  //      地砖是「很宽很浅」的横条（横向约 0.94 道宽、进深只有 0.66），
  //      直接把字母铺满整面会被横向拉伸成一条糊字。Letterbox 到方框后字形才是正的。
  // 顶面（+Y）在**几何体 uv 两个方向**上的真实世界尺寸。
  //
  // 不能想当然地认为「u 就是横、v 就是竖」—— three.js 的 BoxGeometry 每个面
  // 用的 uv 轴不一样。实测（对 BoxGeometry(1,1,1) 逐顶点统计）：
  //   正面(+Z)：u 沿 X、v 沿 Y
  //   顶面(+Y)：u 沿 X、v 沿 Z
  // 顶面的 u 是横向（宽）、v 是进深（短）。方框要按世界尺寸归一化，所以两个方向都得传进去，
  // 传错的表现就是字母被拉成横条或竖条。
  const FACE_W = (BASE_WIDTH / LANE_COUNT) * BLOCK_SPAN;
  const TILE_D = BLOCK_D;
  const letterAtlas = buildLetterAtlas();
  disposables.push(letterAtlas);
  blockMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlas = { value: letterAtlas };
    shader.uniforms.uCell = { value: new THREE.Vector2(1 / ATLAS_COLS, 1 / ATLAS_ROWS) };
    shader.uniforms.uTopExt = { value: new THREE.Vector2(FACE_W, TILE_D) };
    shader.uniforms.uLetterBox = { value: LETTER_BOX };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aAtlas;
        varying vec2 vAtlas;
        varying vec2 vCellUv;
        varying float vTop;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vAtlas = aAtlas;
        // 必须自己把几何体 uv 传下来。
        // MeshBasicMaterial 在没有 map 时不会把 uv 属性/变量编进着色器，
        // 片元里直接写 uv 会得到 "undeclared identifier" 而整个程序编译失败 ——
        // 表现是方块全部消失（不是变黑，是根本没画）。
        vCellUv = uv;
        // 只有顶面（法线 +Y）贴字。方块是平躺的地砖，顶面就是玩家看到的那一面。
        vTop = normalize(normal).y > 0.5 ? 1.0 : 0.0;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uAtlas;
        uniform vec2 uCell;
        uniform vec2 uTopExt;
        uniform float uLetterBox;
        varying vec2 vAtlas;
        varying vec2 vCellUv;
        varying float vTop;`)
      .replace('#include <dithering_fragment>', `
        {
          // 把字母压进一个居中的方框，而不是铺满整面。
          // 地砖是「很宽很浅」的横条（宽是进深的 7~8 倍），字母铺满整面会被横向拉成一条糊字。
          // 做法：方框边长取 uLetterBox（世界单位，与进深解耦，见文件顶部说明），
          // 再把 uv 按两个方向各自的世界尺寸归一化回去 —— 这样字形在世界坐标里是正的，
          // 与道有多宽、砖有多厚都无关。
          float side = uLetterBox;
          vec2 cell = (vCellUv - 0.5) * uTopExt / side + 0.5;
          // 落在方框之外的部分不贴字，保持方块本来的青色。
          float inside = step(0.0, cell.x) * step(cell.x, 1.0)
                       * step(0.0, cell.y) * step(cell.y, 1.0);
          vec2 cellUv = vAtlas + clamp(cell, 0.0, 1.0) * uCell;
          float ink = texture2D(uAtlas, cellUv).a;
          float amount = ink * vTop * inside;
          // 字母用深色而不是纯白：方块本体是亮青色，白字在亮底上会糊。
          vec3 letterColor = vec3(0.02, 0.075, 0.095);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, letterColor, amount);
        }
        #include <dithering_fragment>`);
  };
  // onBeforeCompile 注入的着色器会改变程序源码，缓存键必须跟着变，
  // 否则同名材质会复用旧程序（这里就是没字母的版本）。
  blockMaterial.customProgramCacheKey = () => 'letterAtlas';

  const blocks = new THREE.InstancedMesh(blockGeometry, blockMaterial, NOTE_LIMIT);
  blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blocks.frustumCulled = false;
  // 逐实例的图集 UV 偏移。默认全部指向 A 格，render 时按音符字母改写。
  const atlasAttr = new THREE.InstancedBufferAttribute(new Float32Array(NOTE_LIMIT * 2), 2);
  atlasAttr.setUsage(THREE.DynamicDrawUsage);
  blocks.geometry.setAttribute('aAtlas', atlasAttr);
  // 挂进 world 组：便于整体管理，也为将来可能的整体变换留出口。
  world.add(blocks);
  // BufferAttribute 由 geometry 统一释放，没有独立的 dispose 方法。
  disposables.push(blockGeometry, blockMaterial);

  // 复用的临时对象：每帧要写上百个实例矩阵，避免反复 new。
  const scratch = new THREE.Object3D();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < NOTE_LIMIT; i++) {
    blocks.setMatrixAt(i, hidden);
    blocks.setColorAt(i, TONE.idle);
  }
  blocks.instanceMatrix.needsUpdate = true;
  if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;

  // 方块从生成点到判定线的位姿。
  //   progress 0 → 远端：体积略小
  //   progress 1 → 判定线：放大、立起来
  //
  // 方块是「横向宽、纵向短」的键块（横向约占道宽的 86%），和参考图一致：
  // 按键本来就比手指宽而扁，偏成长条形会看不出「这是一个键」。
  // 横向严格对齐自己那条道的中心线，不做任何散开 —— 四条道的分布是玩家判断
  // 「这个键该用哪只手」的唯一依据，横向一分散，道的含义就糊了。
  const LANE_PITCH = BASE_WIDTH / LANE_COUNT;
  //
  // 高度基准点：方块到达判定线时，**底面**正好压在判定线的高度上。
  //
  // 方块现在是平躺的地砖（不倾斜），中心到最低点的距离就是 BLOCK_H/2。
  // 在判定线处还要乘上 1.22 的放大，所以底面 y = JUDGE_Y − BLOCK_H·1.22/2。
  // 取 JUDGE_Y = 0.12 → 底面落在 y ≈ 0.02，刚好贴着判定线发光条，不悬空也不穿进地面。
  // 这个值随 BLOCK_H 一起变，改方块厚度时必须重算。
  const JUDGE_Y = 0.12;
  function placeBlock(lane, progress) {
    const p = Math.max(0, Math.min(1.02, progress));
    const z = -LENGTH * (1 - p);
    // 远端略微抬高。方块变平之后不再靠倾角制造高度差，
    // 这点抬升用来让远端地砖"浮起一点点"，避免与道面完全共面而看不出边界。
    const y = JUDGE_Y + (1 - p) * 0.1;
    const scale = 0.82 + p * 0.4;
    scratch.position.set(baseLaneX(lane), y, z);
    // **不倾斜**：地砖平躺在道面上，只有这样顶面才正对俯视的相机，
    // 字母才不会因为面与视线的夹角而缩成一条。
    scratch.rotation.set(0, 0, 0);
    // 横向占道宽的比例由 BLOCK_SPAN 决定（见文件顶部注释）。
    scratch.scale.set(LANE_PITCH * BLOCK_SPAN * scale, BLOCK_H * scale, BLOCK_D * scale);
    scratch.updateMatrix();
    // 方块位置直接就是世界坐标。
    return scratch.matrix;
  }

  // ── 粒子池 ──────────────────────────────────────────────────
  // 粒子挂在 world 之外（要参与自己的物理运动），坐标直接用世界坐标。
  const sparkGeometry = new THREE.PlaneGeometry(0.34, 0.34);
  const sparkMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.InstancedMesh(sparkGeometry, sparkMaterial, SPARK_LIMIT);
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.frustumCulled = false;
  scene.add(sparks);
  disposables.push(sparkGeometry, sparkMaterial);
  // 粒子用扁平数组存，避免每帧为每个粒子建对象。
  const spark = {
    life: new Float32Array(SPARK_LIMIT), ttl: new Float32Array(SPARK_LIMIT),
    x: new Float32Array(SPARK_LIMIT), y: new Float32Array(SPARK_LIMIT), z: new Float32Array(SPARK_LIMIT),
    vx: new Float32Array(SPARK_LIMIT), vy: new Float32Array(SPARK_LIMIT), vz: new Float32Array(SPARK_LIMIT),
  };
  let sparkCursor = 0;
  for (let i = 0; i < SPARK_LIMIT; i++) sparks.setMatrixAt(i, hidden);
  sparks.instanceMatrix.needsUpdate = true;

  function emitSparks(lane, tone, count) {
    if (reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const slot = sparkCursor++ % SPARK_LIMIT;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.4 + Math.random() * 6.5;
      spark.life[slot] = 0.76; spark.ttl[slot] = 0.76;
      spark.x[slot] = baseLaneX(lane); spark.y[slot] = 0.7; spark.z[slot] = 0.3;
      spark.vx[slot] = Math.cos(angle) * speed; spark.vy[slot] = 1.6 + Math.random() * 3.4; spark.vz[slot] = Math.sin(angle) * speed * 0.6;
    }
    sparkMaterial.color.copy(tone);
  }

  // ── 生命周期 ────────────────────────────────────────────────
  let time = 0;
  const judged = new Map();     // noteId → { grade, at }，用于判定后的收尾动画

  // ── 相机 ────────────────────────────────────────────────────
  // 相机位置是**常量**，不随容器尺寸变化（原因见 layout 的注释）。
  // 因此这里只需要一个投影探针，把世界点转成屏幕比例。
  const _probe = new THREE.Vector3();
  function screenRatioOf(x, y, z) {
    _probe.set(x, y, z).project(camera);
    return (1 - _probe.y) / 2;
  }
  // 轨道横向占比（0~1）：给验收脚本判断轨道有没有细得看不清。
  function trackFraction() {
    _probe.set(-BASE_WIDTH / 2, 0, 0).project(camera);
    const left = _probe.x;
    _probe.set(BASE_WIDTH / 2, 0, 0).project(camera);
    return (_probe.x - left) / 2;
  }

  // 视线固定看向 (0, 0, -纵深/2) —— 轨道面的中点。
  // 为什么必须显式给出 lookAt 目标而不是"看向相机下方某比例处"：
  // 后者算出的视线方向依赖 camY 自身，会把俯角锁死在很小的值，
  // 判定线与远端双双挤到画面正中（实测两个比例都趋近 0.5），相机高度就失去了作用。
  const LOOK_TARGET_Z = -(BASE_WIDTH * (4 / 3)) * 0.5;

  function layout() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    // 相机固定不动 —— 判定线与远端的屏幕落点因此与容器尺寸无关。
    //
    // 加宽轨道试过三条路，只有第三条成立（前两条都是陷阱）：
    //   · 世界与相机同比放大 k 倍：投影完全不变，占宽纹丝不动（相似变换不变性）。
    //   · 只放大世界：轨道向相机方向胀，纵深被推出画面顶边
    //     （实测 k=1.2 时 far 从 0.241 掉到 0.156，k=2 时 far 变负）。
    //   · 只加大 BASE_WIDTH 而不动相机：判定线冲到 1.0 以上，飞出容器。
    // 成立的第三条：加大 BASE_WIDTH 的同时把相机**往后拉**（camZ 变大）并按
    // 判定线 0.861 重解 camY —— 轨道被推远，但世界轨道铺得开，投影里横向张角反而更大。
    // 实测单道占宽 11.88% → 12.76%（1920×1080 赛道区）。
    //
    // 还需知道的硬约束：在判定线锁定的前提下，「轨道横向占宽」几乎只由赛道区自身的
    // 宽高比决定（实测 frac ≈ 51 / aspect，反比关系）。所以换列比例、改 max-width
    // 对道宽几乎没有净收益 —— 真要让道更宽，只能改相机这一维。
    camera.aspect = w / h;
    camera.position.set(0, BASE_CAM_Y, BASE_CAM_Z);
    camera.lookAt(0, 0, LOOK_TARGET_Z);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
  }

  // 渲染一帧。view.notes 由调用方给出，形如 [{ id, lane, at }]。
  function render(view, delta) {
    time += delta * 1000;
    const fallMs = Math.max(1, view.fallMs);
    const mist = 0.5 + 0.5 * Math.sin(time / 1400);

    // 静止时也有呼吸感：判定线光晕起伏、道槽明暗缓慢流动。
    judgeGlow.material.opacity = 0.1 + 0.06 * mist;
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const bar = laneHits[lane];
      if (bar.material.opacity > 0) bar.material.opacity = Math.max(0, bar.material.opacity - delta * 3.2);
      // 道槽在基础亮度附近缓慢起伏；每条道错开相位，画面才像"流动"而不是整体闪烁。
      grooves[lane].material.opacity = GROOVE_BASE_OPACITY + 0.07 * (0.5 + 0.5 * Math.sin(time / 1100 + lane * 1.3));
    }

    // 方块：逐实例写入矩阵、颜色与图集 UV 偏移。
    const list = view.notes;
    let slot = 0;
    for (let i = 0; i < list.length && slot < NOTE_LIMIT; i++) {
      const note = list[i];
      const progress = 1 - (note.at + fallMs - view.elapsed) / fallMs;
      if (progress < -0.35) continue;              // 早已越过判定线，不再绘制
      const fx = judged.get(note.id);
      let shrink = 1;
      if (fx) {
        const age = (time - fx.at) / JUDGE_FX_MS;
        if (age >= 1) { judged.delete(note.id); }
        else shrink = Math.max(0.05, 1 - age * age * 1.4);
      }
      blocks.setMatrixAt(slot, placeBlock(note.lane, progress));
      blocks.setColorAt(slot, fx ? (TONE[fx.grade] || TONE.idle) : (progress > 1 ? TONE.past : TONE.idle));
      // 该方块显示自己的字母：把 UV 采样窗口平移到图集里对应的那一格。
      const uv = atlasOffset(note.letter);
      atlasAttr.setXY(slot, uv.x, uv.y);
      if (shrink !== 1) {
        scratch.scale.multiplyScalar(shrink);
        scratch.updateMatrix();
        blocks.setMatrixAt(slot, scratch.matrix);
      }
      slot++;
    }
    // 剩余槽位压成 0 尺寸，否则上一帧的方块会残留在场上。
    for (let i = slot; i < NOTE_LIMIT; i++) blocks.setMatrixAt(i, hidden);
    blocks.instanceMatrix.needsUpdate = true;
    atlasAttr.needsUpdate = true;
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;

    // 粒子
    for (let i = 0; i < SPARK_LIMIT; i++) {
      if (spark.life[i] <= 0) continue;
      spark.life[i] = Math.max(0, spark.life[i] - delta);
      if (spark.life[i] === 0) { sparks.setMatrixAt(i, hidden); continue; }
      spark.vy[i] -= 11 * delta;
      spark.x[i] += spark.vx[i] * delta;
      spark.y[i] += spark.vy[i] * delta;
      spark.z[i] += spark.vz[i] * delta;
      if (spark.y[i] < 0.2) { spark.y[i] = 0.2; spark.vy[i] = Math.abs(spark.vy[i]) * 0.4; }
      scratch.position.set(spark.x[i], spark.y[i], spark.z[i]);
      scratch.rotation.set(0, 0, spark.life[i] * 6);
      scratch.scale.setScalar(spark.life[i] / spark.ttl[i]);
      scratch.updateMatrix();
      sparks.setMatrixAt(i, scratch.matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);
  }

  layout();
  const observer = new ResizeObserver(layout);
  observer.observe(host);

  return {
    render,
    layout,
    // 供验收脚本读取：判定线与轨道远端在容器里的实际投影位置。
    // 有了这两个数，脚本就能断言「三维判定线与 CSS 判定线重合、远端未越界、纵深铺得开」，
    // 而不用靠截图目测。
    probe() {
      const len = BASE_WIDTH * (4 / 3);
      const pitch = BASE_WIDTH / LANE_COUNT;
      return {
        judgeRatio: screenRatioOf(0, 0, 0),
        farRatio: screenRatioOf(0, 0, -len),
        depthSpan: screenRatioOf(0, 0, 0) - screenRatioOf(0, 0, -len),
        trackFraction: trackFraction(),
        // 单条道的屏幕占宽（%），以及方块横向占道宽的比例。
        // 验收脚本据此断言「道够宽、方块没有宽到相邻道连成一片」。
        laneFraction: trackFraction() / LANE_COUNT,
        blockSpan: BLOCK_SPAN,
        pitch,
        targetJudgeRatio: JUDGE_SCREEN_RATIO,
        camDist: camera.position.z,
        camY: camera.position.y,
        length: len,
      };
    },
    // 判定反馈：登记一次判定，方块会在接下来的 JUDGE_FX_MS 里收缩，同时该道闪一下。
    markJudged(noteId, grade, lane) {
      judged.set(noteId, { grade, at: time });
      if (lane >= 0 && lane < LANE_COUNT) {
        laneHits[lane].material.color.copy(TONE[grade] || TONE.idle);
        laneHits[lane].material.opacity = 0.55;
        emitSparks(lane, TONE[grade] || TONE.idle, grade === 'miss' ? 6 : 16);
      }
    },
    dispose() {
      observer.disconnect();
      // 多材质 Mesh 的 material 是数组；共享材质只释放一次。
      for (const item of new Set(disposables.flat())) item?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
