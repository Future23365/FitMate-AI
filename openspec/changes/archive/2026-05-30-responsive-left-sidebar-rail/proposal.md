## Why

当前普通应用页面的左侧侧边栏固定占用 `260px`，并且项目采用 PC-only 断点基线，导致三列布局在较窄桌面宽度下仍然保留完整左侧占位，压缩中间工作区并出现显示异常。需要在保持宽屏现状的前提下，让左侧侧边栏在空间不足时自动收缩为图标 rail。

## What Changes

- 普通应用页面在宽度充足时继续展示现有 `260px` 左侧侧边栏和内容偏移。
- 普通应用页面在较窄桌面宽度下将左侧侧边栏收缩为仅展示核心图标的 rail，并同步缩小页面左侧占位。
- 用户 hover 或键盘 focus 到收缩侧边栏时，侧边栏向右展开为完整宽度，并以浮层形式附在页面上，不重新挤压中间内容。
- `/dev` 和 `/training` 等独立布局页面继续不显示主应用侧边栏。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `mobile-app-navigation`: 调整普通应用页面在窄桌面宽度下的主侧边栏展示要求，从固定完整侧边栏扩展为响应式图标 rail 与 hover 展开。

## Impact

- 影响 `components/app/app-sidebar.tsx` 的桌面侧边栏结构与响应式 class。
- 影响普通应用页面的左侧内容偏移：聊天页、训练日历、动作编排、动作库、设置页。
- 影响 `app/globals.css` 中全局 layout 变量和侧边栏响应式样式。
- 不涉及 API、数据库、AI 编排、权限或依赖变更。
