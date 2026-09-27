# 极速淘汰赛参考图对照验收

## Evidence

- Source visual truth: `C:\Users\PC\AppData\Local\Temp\codex-clipboard-9e02a445-7168-4684-b769-6cf42818c7c7.png`
- Implementation capture: `E:\lulu\广西厚溥\梧州职业学院\25级梧职\2026-2027第一学期开班\打字游戏\output\playwright\elimination-reference.png`
- Viewport: 1680 x 940 CSS px, deviceScaleFactor 1.
- State: empty waiting room; source is a populated in-progress match, so player tokens and ranking rows are represented by live data when players join.

## Comparison history

### Iteration 1

Findings:

- P1 layout mismatch: the old dark Boss layout did not match the light two-column safety-zone composition.
- P1 information mismatch: the old UI communicated HP and team damage rather than survival, elimination timing, and rankings.
- P2 state visibility: active and eliminated player state was only visible in a right-side list.

Fixes:

- Rebuilt the page as a light left-stage/right-information layout.
- Added a circular safe-zone map, elimination countdown, survivor count, ranking/metrics card, bottom input panel, and elimination report.
- Added in-map active and eliminated player tokens with self highlighting.

Post-fix evidence:

- The implementation capture matches the source layout proportions: broad 16:9 left arena, compact right column, lower left input card, lower right report card.
- The source's populated state cannot be reproduced without adding real players; the capture uses the valid empty-room state and the same live components populate after join.

### Iteration 2

Findings:

- P1 game-stage mismatch: the first safe-zone build lacked the source's left self card and right-side in-arena status/legend blocks.
- P1 state-density mismatch: it did not make the live versus eliminated distinction readable at a glance inside the arena.

Fixes:

- Added the self survival card, safety-zone countdown/status block, legend, and radial live/eliminated player tokens.
- Captured a live one-player state after joining, so the central map, self highlight, score row, countdown, and event report all have real runtime data.

Post-fix evidence:

- Implementation capture: `output/playwright/elimination-reference-v2.png` at 1680 x 940 CSS px.
- Browser console errors: none.

### Iteration 3

Findings:

- P1 arena scale mismatch: the safety zone was materially smaller than the reference and the stage lacked the reference's dense ring of player markers.
- P2 vertical rhythm: enlarging the map initially pushed the input panel below the reference viewport and left the rule strip in the middle of the arena.

Fixes:

- Enlarged the three safety-zone rings, added two rings of capacity/player markers, expanded the self card, added the quote and round details, and restored four personal metrics.
- Locked the arena to 488px, absolutely positioned the map inside it, and anchored the rule strip to the bottom edge.

Post-fix evidence:

- Final implementation capture: `output/playwright/elimination-reference-final.png` at 1680 x 940 CSS px.
- Browser console errors: none.

## Fidelity surfaces

- Typography: bold Chinese display heading, compact uppercase support label, and tabular timer/score treatment match the source hierarchy.
- Spacing and layout rhythm: 40px page gutters, header divider, 1fr/402px main grid, rounded cards, and 16px gaps follow the source composition.
- Colors and visual tokens: pale blue page field, navy arena, teal safe zone, orange countdown, blue input focus, and white information cards mirror the source palette.
- Image quality and assets: user avatars use live uploaded avatar images; absent avatars use initials so no placeholder bitmap is introduced.
- Copy and content: game language is consistently about survival, safety zone, elimination, score, rank, and spectator state.

## Final result

passed
