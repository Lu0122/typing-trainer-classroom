# Header 基线（改造前后对照）

> 由 `scripts/measure-headers.mjs` 生成，用于改造前后对照。
> header 高度是元素实际渲染高度（含 padding/border）。

| 视口 | 页面 | 当前 header | 高度 | scrollHeight / innerHeight | 页面 |
| --- | --- | --- | --- | --- | --- |
| 1920x1080 | home | topbar | 104 | 1080 / 1080 | 正常 |
| 1920x1080 | games | lobby-topbar | 63 | 1080 / 1080 | 正常 |
| 1920x1080 | rhythm | arena-header | 72 | 1080 / 1080 | 正常 |
| 1920x1080 | race | arena-header | 64 | 1080 / 1080 | 正常 |
| 1920x1080 | battle | battle-header | 71 | 1080 / 1080 | 正常 |
| 1920x1080 | boss | boss-header | 60 | 1080 / 1080 | 正常 |
| 1920x1080 | chase | chase-topbar | 72 | 1080 / 1080 | 正常 |
| 1920x1080 | runner | runner-header | 72 | 1080 / 1080 | 正常 |
| 1920x1080 | bug | app-header compact | 56 | 1213 / 1080 | 溢出 |
| 1920x1080 | competition | competition-header | 68 | 1080 / 1080 | 正常 |
| 1366x768 | home | topbar | 104 | 768 / 768 | 正常 |
| 1366x768 | games | lobby-topbar | 63 | 768 / 768 | 正常 |
| 1366x768 | rhythm | arena-header | 72 | 768 / 768 | 正常 |
| 1366x768 | race | arena-header | 52 | 768 / 768 | 正常 |
| 1366x768 | battle | battle-header | 71 | 768 / 768 | 正常 |
| 1366x768 | boss | boss-header | 60 | 768 / 768 | 正常 |
| 1366x768 | chase | chase-topbar | 72 | 768 / 768 | 正常 |
| 1366x768 | runner | runner-header | 72 | 768 / 768 | 正常 |
| 1366x768 | bug | app-header compact | 56 | 1213 / 768 | 溢出 |
| 1366x768 | competition | competition-header | 68 | 768 / 768 | 正常 |

## 控制台错误

无
