// 一次性迁移工具：删掉 header 统一后遗留的死样式。
//
// 安全策略
// 1. 只在「模板里已经不存在这个类名」时才视为死类。
// 2. 逗号分组选择器里只要还有一段活着，整条规则保留（例如 `.account-pill,.admin-link`）。
// 3. 默认只报告不写入，加 --write 才真正修改。
import fs from 'node:fs';

const WRITE = process.argv.includes('--write');

const TARGETS = [
  {
    file: 'frontend/src/style.css',
    tokens: ['topbar', 'topbar-decoration', 'top-actions', 'account-pill', 'account-avatar-mini', 'account-pill-copy', 'brand-mark', 'brand'],
    hasTemplate: false
  },
  {
    file: 'frontend/src/GameLobby.vue',
    tokens: ['lobby-topbar', 'lobby-topbar-inner', 'lobby-brand', 'lobby-logo', 'lobby-brand-copy', 'lobby-nav', 'lobby-actions', 'lobby-bug-link', 'lobby-account', 'lobby-avatar', 'lobby-cta', 'cta-txt']
  },
  {
    file: 'frontend/src/arena.css',
    markup: 'frontend/src/ArenaGame.vue',
    tokens: ['arena-header', 'arena-back', 'arena-brand', 'arena-room-status', 'rhythm-topnav']
  },
  {
    file: 'frontend/src/boss.css',
    markup: 'frontend/src/BossGame.vue',
    tokens: ['boss-header', 'boss-back', 'boss-brand', 'boss-session', 'boss-phase', 'boss-status-dot']
  },
  {
    file: 'frontend/src/chase.css',
    markup: 'frontend/src/ChaseGame.vue',
    tokens: ['chase-topbar', 'chase-back', 'chase-title', 'chase-view-controls', 'chase-top-metrics', 'chase-room-id']
  },
  {
    file: 'frontend/src/runner.css',
    markup: 'frontend/src/RunnerGame.vue',
    tokens: ['runner-header', 'runner-back', 'runner-brand', 'runner-header-actions', 'runner-button', 'runner-icon-button', 'runner-quality-button', 'runner-ranking-button']
  },
  {
    file: 'frontend/src/battle.css',
    markup: 'frontend/src/BattleGame.vue',
    tokens: ['battle-header', 'battle-brand', 'battle-header-notice', 'battle-status', 'battle-back']
  }
];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function tokenUsedInMarkup(source, token) {
  // 逐个取出 class / :class 属性的值，按空白切成类名再比对。
  // 不能直接用「前后有空格」的正则：class="runner-button" 这种紧贴引号的会漏判。
  const pattern = /:?class="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(source))) {
    if (match[1].split(/\s+/).includes(token)) return true;
  }
  return false;
}

function selectorIsDead(selector, deadTokens) {
  return selector
    .split(',')
    .map((part) => part.trim())
    .every((part) => deadTokens.some((token) => new RegExp(`(^|[^-\\w])\\.${escape(token)}(?![\\w-])`).test(part)));
}

let totalRemoved = 0;
const skipped = [];

for (const target of TARGETS) {
  let source = fs.readFileSync(target.file, 'utf8');
  const markupSource = target.markup ? fs.readFileSync(target.markup, 'utf8') : source;
  const styleIndex = markupSource.indexOf('<style');
  const markup = target.hasTemplate === false ? '' : styleIndex < 0 ? markupSource : markupSource.slice(0, styleIndex);

  const deadTokens = target.tokens.filter((token) => {
    if (markup && tokenUsedInMarkup(markup, token)) {
      skipped.push(`${target.file}: .${token} 模板里还在用，保留`);
      return false;
    }
    return true;
  });

  let removed = 0;
  const next = source.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selector) => {
    const clean = selector.trim().replace(/\s+/g, ' ');
    if (!clean || clean.startsWith('@') || clean.startsWith('/*')) return rule;
    if (!selectorIsDead(clean, deadTokens)) {
      if (deadTokens.some((token) => new RegExp(`(^|[^-\\w])\\.${escape(token)}(?![\\w-])`).test(clean))) {
        skipped.push(`${target.file}: ${clean.slice(0, 90)} 混合了活类名，保留`);
      }
      return rule;
    }
    removed += 1;
    return '';
  });

  if (next !== source) {
    totalRemoved += removed;
    if (WRITE) fs.writeFileSync(target.file, next.replace(/\n{3,}/g, '\n\n'));
  }
  console.log(`${target.file.padEnd(34)} 删除 ${String(removed).padStart(3)} 条规则`);
}

console.log(`\n合计删除 ${totalRemoved} 条${WRITE ? '' : '（预演，未写入）'}`);
if (skipped.length) {
  console.log('\n保留项：');
  for (const item of skipped) console.log('  - ' + item);
}
