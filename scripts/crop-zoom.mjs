// 把一张截图里的指定区域裁剪并放大，用来逐像素核对字形方向。
// 用法：node scripts/crop-zoom.mjs <输入png> <输出png> <x> <y> <w> <h> [放大倍数]
// 直接用 playwright 的 chromium 做画布缩放，不额外装图像库。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [input, output, x, y, w, h, scaleArg] = process.argv.slice(2);
const scale = Number(scaleArg || 3);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

const dataUrl = 'data:image/png;base64,' + fs.readFileSync(input).toString('base64');
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: Number(w) * scale, height: Number(h) * scale } });
await page.setContent(`<style>html,body{margin:0;background:#000}canvas{display:block;image-rendering:pixelated}</style>
  <canvas id="c" width="${Number(w) * scale}" height="${Number(h) * scale}"></canvas>
  <script>
    window.done = new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const ctx = document.getElementById('c').getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, ${Number(x)}, ${Number(y)}, ${Number(w)}, ${Number(h)}, 0, 0, ${Number(w) * scale}, ${Number(h) * scale});
        res(true);
      };
      img.src = ${JSON.stringify(dataUrl)};
    });
  </script>`);
await page.evaluate(() => window.done);
fs.mkdirSync(path.dirname(output), { recursive: true });
await page.locator('#c').screenshot({ path: output });
console.log(`已裁剪 ${input} [${x},${y},${w},${h}] ×${scale} → ${output}`);
await browser.close();
