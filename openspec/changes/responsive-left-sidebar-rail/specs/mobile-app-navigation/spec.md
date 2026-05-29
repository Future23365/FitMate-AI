## ADDED Requirements

### Requirement: Responsive desktop sidebar rail
系统 SHALL 在普通应用页面根据桌面视口宽度切换左侧主侧边栏占位：宽度充足时展示完整侧边栏，宽度不足时展示图标 rail，并允许用户临时展开完整侧边栏。

#### Scenario: User opens a normal app page on a wide desktop viewport
- **WHEN** 用户在宽度充足的桌面视口打开首页、训练日历、动作编排、动作库或设置页
- **THEN** 系统显示现有完整左侧侧边栏
- **AND** 页面内容保留现有完整左侧侧边栏占位

#### Scenario: User opens a normal app page on a narrower desktop viewport
- **WHEN** 用户在较窄桌面视口打开首页、训练日历、动作编排、动作库或设置页
- **THEN** 系统将左侧侧边栏收缩为仅展示核心图标的 rail
- **AND** 页面内容只保留 rail 宽度的左侧占位

#### Scenario: User hovers or focuses the sidebar rail
- **WHEN** 用户将鼠标移动到收缩后的左侧 rail 上，或通过键盘 focus 到 rail 内元素
- **THEN** 系统向右展开完整侧边栏
- **AND** 展开的侧边栏作为浮层附在页面上，不重新挤压页面内容

#### Scenario: User leaves the expanded sidebar rail
- **WHEN** 用户鼠标离开收缩侧边栏，且 rail 内元素失去键盘 focus
- **THEN** 系统恢复图标 rail 展示
- **AND** 页面内容仍保持 rail 宽度的左侧占位

#### Scenario: User opens an independent layout page
- **WHEN** 用户打开 `/dev` 或 `/training`
- **THEN** 系统不显示桌面主侧边栏
- **AND** 系统不应用左侧主侧边栏占位
