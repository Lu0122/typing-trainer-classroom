# Header 基线（改造前后对照）

> 由 `scripts/measure-headers.mjs` 生成，用于改造前后对照。
> header 高度是元素实际渲染高度（含 padding/border）。

| 视口 | 页面 | 当前 header | 高度 | scrollHeight / innerHeight | 页面 |
| --- | --- | --- | --- | --- | --- |
| 1920x1080 | home | app-header hero | 104 | 1080 / 1080 | 正常 |
| 1920x1080 | games | app-header compact | 56 | 1080 / 1080 | 正常 |
| 1920x1080 | rhythm | app-header compact | 56 | 1080 / 1080 | 正常 |
| 1920x1080 | race | app-header compact | 56 | 1080 / 1080 | 正常 |
| 1920x1080 | battle | app-header compact | 56 | 1080 / 1080 | 正常 |
| 1920x1080 | boss | app-header compact | 56 | 1080 / 1080 | 正常 |
| 1920x1080 | chase | app-header compact | 56 | 1080 / 1080 | 正常 |
| 1920x1080 | runner | app-header compact | 56 | 1080 / 1080 | 正常 |
| 1920x1080 | bug | app-header compact | 56 | 1213 / 1080 | 溢出 |
| 1920x1080 | competition | app-header compact | 56 | 1080 / 1080 | 正常 |
| 1440x900 | home | app-header hero | 104 | 900 / 900 | 正常 |
| 1440x900 | games | app-header compact | 56 | 900 / 900 | 正常 |
| 1440x900 | rhythm | app-header compact | 56 | 900 / 900 | 正常 |
| 1440x900 | race | app-header compact | 56 | 900 / 900 | 正常 |
| 1440x900 | battle | app-header compact | 56 | 900 / 900 | 正常 |
| 1440x900 | boss | app-header compact | 56 | 900 / 900 | 正常 |
| 1440x900 | chase | app-header compact | 56 | 900 / 900 | 正常 |
| 1440x900 | runner | app-header compact | 56 | 900 / 900 | 正常 |
| 1440x900 | bug | app-header compact | 56 | 1213 / 900 | 溢出 |
| 1440x900 | competition | app-header compact | 56 | 900 / 900 | 正常 |
| 1366x768 | home | app-header hero | 104 | 768 / 768 | 正常 |
| 1366x768 | games | app-header compact | 56 | 768 / 768 | 正常 |
| 1366x768 | rhythm | app-header compact | 56 | 768 / 768 | 正常 |
| 1366x768 | race | app-header compact | 56 | 768 / 768 | 正常 |
| 1366x768 | battle | app-header compact | 56 | 768 / 768 | 正常 |
| 1366x768 | boss | app-header compact | 56 | 768 / 768 | 正常 |
| 1366x768 | chase | app-header compact | 56 | 768 / 768 | 正常 |
| 1366x768 | runner | app-header compact | 56 | 768 / 768 | 正常 |
| 1366x768 | bug | app-header compact | 56 | 1213 / 768 | 溢出 |
| 1366x768 | competition | app-header compact | 56 | 768 / 768 | 正常 |
| 1280x720 | home | app-header hero | 104 | 720 / 720 | 正常 |
| 1280x720 | games | app-header compact | 56 | 720 / 720 | 正常 |
| 1280x720 | rhythm | app-header compact | 56 | 720 / 720 | 正常 |
| 1280x720 | race | app-header compact | 56 | 720 / 720 | 正常 |
| 1280x720 | battle | app-header compact | 56 | 720 / 720 | 正常 |
| 1280x720 | boss | app-header compact | 56 | 720 / 720 | 正常 |
| 1280x720 | chase | app-header compact | 56 | 720 / 720 | 正常 |
| 1280x720 | runner | app-header compact | 56 | 720 / 720 | 正常 |
| 1280x720 | bug | app-header compact | 56 | 1213 / 720 | 溢出 |
| 1280x720 | competition | app-header compact | 56 | 720 / 720 | 正常 |

## 控制台错误

无
