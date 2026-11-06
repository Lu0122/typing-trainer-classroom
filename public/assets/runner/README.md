# 遗迹逃亡素材

本目录的两张 PNG 使用 Codex 内置 ImageGen 生成，随仓库保存，无需运行时调用图片服务。角色、障碍、藤蔓、棕榈、粒子及水面使用项目内的 Three.js / Canvas 原创制作。

| 文件 | 用途 |
| --- | --- |
| `jungle-valley-v2.png` | 丛林峡谷、远处遗迹、瀑布、晨光与薄雾的背景；前景由实时 3D 场景叠加 |
| `moss-sandstone-v2.png` | 可重复的风化砂岩与苔藓纹理，用于桥面、石门、石柱及岩台 |

## 最终生成提示词

丛林背景的制作要求整理：

> Use case: stylized-concept. Asset type: landscape background for an original jungle ruins adventure game. High-end hand-painted cinematic jungle valley, layered lush tropical trees framing the edges, distant golden sandstone temple towers, waterfalls, golden morning sun rays and turquoise mist. Cream-colored sky and cliffs in the upper half. Keep the lower center unobstructed, filled with deep teal mist so the actual 3D bridge and running character can be composited in front. Rich environmental detail and atmospheric depth, polished adventure game art. No foreground road or bridge, no character, no UI, no text, no logo, no watermark. Avoid simplistic faceted shapes.

石材纹理：

> Use case: stylized-concept. Asset type: seamless albedo texture for actual 3D meshes in an original jungle ruins adventure game. Generate ONE square tileable texture viewed perfectly orthographically from above, entire image evenly covered with small ancient golden sandstone paving blocks of varied sizes, hand-painted realistic game art, rich fine stone grain, softened eroded corners, subtle hairline cracks, thin dark recesses between masonry blocks, sporadic delicate emerald lichen and moss growing mainly in the recesses (about 15 percent green, majority warm neutral light sandstone). Flat diffuse illumination baked only with subtle contact occlusion in the cracks, no directional cast shadows, no perspective, no objects, no UI, no text, no border, no watermark. Seamless on all four edges, clean production PBR albedo texture, high-end stylized adventure game surface, readable fine material detail without noisy contrast. The paving should be evenly scaled and have many small blocks across the square, not a single giant wall stone.

原始生成文件保留在 Codex 的 `generated_images` 目录中；应用只引用本目录内的副本。水面、叶脉、苔藓和地面软阴影使用 Canvas 纹理，无外部素材链接。
