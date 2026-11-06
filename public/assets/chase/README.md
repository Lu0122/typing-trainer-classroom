# 生死时速 · 海港追逐素材

游戏仍使用原有双人房、人机、3 秒倒计时、120 秒时限、正确字符推进、自动换段和服务端胜负判定。此次只重制视觉与布局。

## 图片

使用 Codex 内置 **ImageGen** 工具生成，工具模式为 `generate`。三张图片均为全新生成，未使用参考图片；头像使用透明背景，海港远景不透明。保留原始生成文件，并直接复制到下面的版本化路径。

| 文件 | 用途 |
| --- | --- |
| [harbor-blue-hour-v2.png](harbor-blue-hour-v2.png) | 海港夕照远景，3D 环道后方及 WebGL 降级背景 |
| [police-portrait-v2.png](police-portrait-v2.png) | 警察角色选择、实时状态与选手卡头像 |
| [thief-portrait-v2.png](thief-portrait-v2.png) | 小偷角色选择、实时状态与选手卡头像 |

这些图片随 Git 保存，无需外部素材服务。三维摩托车、骑手、环道、码头建筑、灯塔、植被、灯光和尾迹由项目内 Three.js 代码制作；路面与水纹在运行时创建，无外部模型依赖。

## 最终提示词

### harbor

```text
Use case: stylized-concept. Asset type: wide panoramic environment backdrop for an original 3D motorcycle police pursuit typing game. Scene: a lively coastal city harbour at blue hour, sunset apricot horizon, layered art deco waterfront buildings, distant port cranes and lighthouse, teal ocean reflecting warm tiny windows, atmospheric depth, polished hand-painted 3D animated film quality. Composition: landscape 16:9 panorama, horizon in upper third, distant city mainly across upper half and edges; lower center clear open teal water and mist so a real-time 3D road and vehicles can be placed in front. Rich believable materials and fine environment detail, calm readable composition, no close foreground road, no close vehicles, no people, no text, no logos, no UI, no watermark.
```

### police

```text
Use case: stylized-concept. Asset type: transparent character portrait for an original motorcycle police pursuit typing game. One friendly determined young adult police motorcycle rider, gender neutral animated film game character, cobalt blue uniform with reflective pale blue patches, white and blue motorcycle helmet with lifted visor, brown eyes, navy gloves, radio shoulder strap, small generic shield badge without lettering. High-end detailed polished stylized 3D render, readable appealing face, soft warm rim light and cool fill, chest-up three-quarter view facing slightly right, centered fully within image, no motorcycle, no frame, no text, no logos, no watermark. Genuinely transparent background.
```

### thief

```text
Use case: stylized-concept. Asset type: transparent character portrait for an original motorcycle police pursuit typing game. One mischievous confident young adult getaway motorcycle rider, gender neutral animated film game character, charcoal helmet with lifted amber visor, dark charcoal riding jacket with burnt orange shoulder stripes, small satchel strap, dark gloves, friendly game villain expression, clearly readable brown eyes and face. High-end detailed polished stylized 3D render, soft warm rim light and cool fill, chest-up three-quarter view facing slightly left, centered fully within image, no motorcycle, no weapon, no frame, no text, no logos, no watermark. Genuinely transparent background.
```

## 渲染与交互

- 默认采用追逐视角，从弯道外侧同时取景两名骑手，按间距与屏幕比例调整镜头。追逐、跟随与全景视角可循环切换；自动、流畅、精细画质按像素预算控制分辨率，自动画质在持续低帧率时进一步降低像素比例。
- 重复场景与摩托车静态部件合并为实例绘制。前进动画只平滑服务器确认的位置，停手后不会按显示速度虚构距离。
- 两名骑手使用同一赛道函数，跨圈保持连续。警察车头与小偷车尾分别锚定确认的位置，避免尚未追平时车辆先重叠；抓到时在同一接触点收尾，逃脱保留实际间距。
- 追逐视角用路面距离线与米数标出车头到车尾的间隔。距离不超过 12 米时提示接近，不超过 6 米时显示角色对应提示与轻微边缘警戒；减少动态效果偏好改为静态边缘色。倒计时与等待阶段不启用警戒。
- 大间距拉高镜头，避免岛内建筑遮挡；距离与领先圈数始终按累计位置计算，不把绕圈后的空间重合误当成接近。追逐视角隐藏镜头一侧的高路灯，避免遮住骑手。
- 比赛段落与输入框排列在场景下方，倒计时结束和自动换段保持输入焦点；输入法组合中不提前标红未提交的文本。
- 页面离开后释放帧循环、观察器、几何、材质、纹理与 WebGL 上下文。减少动态效果偏好关闭摆动、倾斜、灯光闪动与界面弹出动画。

## 验证（2026-10-03）

- `npm test`：177 项全部通过。新增动画测试覆盖停手冻结、确认位移插值、跨圈衔接、换房重置、接触点收尾，以及对手离开时保留位置。
- `npm run build`：通过。`src/chase.js`、接口与数据库规则未修改。
- 使用独立内存数据库试玩：验证人机输入、自动换段、双人房创建与邀请码加入、双方倒计时结束后自动聚焦、追上获胜及 120 秒逃脱；切换镜头和画质后仍可直接输入。
- 1280×720、320×568、812×375 检查目标段落、输入框与加入按钮，未出现横向溢出。桌面试玩观察约 75 FPS、73 次绘制调用，实际表现取决于设备和窗口大小；控制台无错误。
- 正式 D 盘项目的 3000 端口页面已加载新版本；试玩没有写入正式数据库。

## 追逐视角验证（2026-10-03）

- 新增摄像机测试覆盖环道八个位置、横竖屏比例、跨圈、近距离与长距离取景，检查两名骑手在视野和远近平面以内；还验证开局轮廓分离、接近时收紧、实际接触锚点和距离提示边界。
- 独立内存数据库的双人房试玩：双方显示相同的 5.2 米；警察端显示“就快追上”、小偷端显示“警察逼近”，距离线与警戒样式正常，三个视角切换后保留输入焦点，追上仍由原服务端判定。
- 1280×720 浏览器画面检查两名骑手、距离标注、目标段落与输入框；320×568 和 812×375 检查预览中两名骑手与距离标注，均无横向溢出。更多屏幕比例与间距通过几何投影测试验证，控制台无错误。
- `npm test`：181 项全部通过；`npm run build`：通过。服务端追逐规则保持不变，试玩使用内存数据库。
