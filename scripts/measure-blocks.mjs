// 量「方块在道里的实际占比」。
// 两张图都要量，因为效果图是验收基准：
//   · 效果图（用户给的参考）—— 方块的宽/高、以及它左右各留多少缝。
//   · 我们自己的截图 —— 同一口径量出来的值。
// 两边数字对齐，才算「按效果图弄好」。
//
// 做法：青绿色（方块）与深蓝（道面）差别极大，直接按颜色阈值分块。
// 对每一行扫出连续青色区间，再按 y 相邻合并成一块，得到每块的 y 跨度、x 跨度。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('用法: node scripts/measure-blocks.mjs <png> [...]');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
// 用 data: URL 起页再 drawImage 会被 file:// 的同源策略拦掉（img.onerror），
// 所以直接把图读成 base64 内联进去 —— 不依赖任何本地服务或文件权限。
await page.setContent('<html><body></body></html>');

for (const file of targets) {
  const b64 = fs.readFileSync(file).toString('base64');
  const ext = file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png';
  const src = `data:image/${ext};base64,${b64}`;
  const res = await page.evaluate(async (url) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('图片解码失败')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const px = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    // 方块是浅青绿：G 高、B 高、R 明显更低。道面是深蓝：三者都低。
    const isTile = (x, y) => { const [r, gg, b] = px(x, y); return gg > 185 && b > 165 && gg - r > 45; };

    const rows = [];
    for (let y = 0; y < c.height; y++) {
      let n = 0, first = -1, last = -1;
      for (let x = 0; x < c.width; x++) if (isTile(x, y)) { n++; if (first < 0) first = x; last = x; }
      if (n > 12) rows.push({ y, first, last, n });
    }
    // 按 y 相邻合并成块；顺带把「同一条道上、x 区间重叠」的相邻带并起来。
    const bands = [];
    for (const r of rows) {
      const prev = bands[bands.length - 1];
      if (prev && r.y - prev.y1 <= 2 && Math.min(prev.last, r.last) - Math.max(prev.first, r.first) > 0) {
        prev.y1 = r.y; prev.first = Math.min(prev.first, r.first); prev.last = Math.max(prev.last, r.last);
      } else bands.push({ y0: r.y, y1: r.y, first: r.first, last: r.last });
    }
    return { W: c.width, H: c.height, bands, sideTiles: bands.filter(b => b.last < c.width * 0.25 || b.first > c.width * 0.75) };
  }, src);

  console.log(`\n=== ${file}  (${res.W}×${res.H}) ===`);
  console.log('  方块数:', res.bands.length);
  for (const b of res.bands.slice(0, 14)) {
    console.log(`   y ${String(b.y0).padStart(4)}–${String(b.y1).padStart(4)}  高 ${String(b.y1 - b.y0 + 1).padStart(3)}px   x ${String(b.first).padStart(4)}–${String(b.last).padStart(4)}  宽 ${String(b.last - b.first + 1).padStart(3)}px  宽/高 ${((b.last - b.first + 1) / (b.y1 - b.y0 + 1)).toFixed(2)}`);
  }
}
await browser.close();
