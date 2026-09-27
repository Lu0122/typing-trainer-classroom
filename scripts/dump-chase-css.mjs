// 抽取 chase.css 中指定选择器所在的完整规则（该文件被压成超长单行，便于人工核对）。
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../frontend/src/chase.css', import.meta.url), 'utf8');
const wanted = process.argv.slice(2);
const rules = css.match(/[^{}]+\{[^{}]*\}/g) || [];
for (const rule of rules) {
  if (wanted.some(sel => rule.split('{')[0].includes(sel))) console.log(rule.trim(), '\n');
}
