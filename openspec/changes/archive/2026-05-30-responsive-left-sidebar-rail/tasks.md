## 1. 布局基础

- [x] 1.1 在全局样式中新增左侧侧边栏占位变量、rail 宽度变量和窄桌面 media query。
- [x] 1.2 将普通应用页面中硬编码的 `260px` 左侧偏移改为共享布局变量。

## 2. 侧边栏交互

- [x] 2.1 调整桌面 `AppSidebar` 结构和 class，使宽屏保持完整侧边栏，窄桌面收缩为图标 rail。
- [x] 2.2 为 rail 增加 hover 与 focus-within 展开样式，并在收缩态隐藏文字、历史列表等非图标内容。

## 3. 验证

- [x] 3.1 运行 `openspec validate responsive-left-sidebar-rail --strict`。
- [x] 3.2 运行与 TypeScript/React 改动相关的静态检查。
