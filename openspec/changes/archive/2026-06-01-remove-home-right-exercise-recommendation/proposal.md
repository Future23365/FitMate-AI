## Why

首页右侧栏当前包含一个静态“动作推荐”占位模块，但真实动作推荐已经在聊天消息气泡中生成和操作。保留这个占位会让用户误以为右侧也有独立推荐入口，增加首页信息噪音。

## What Changes

- 移除首页右侧栏中的“动作推荐”模块及其空状态占位。
- 保留右侧栏的今日训练概览、本周计划和训练小贴士。
- 保留聊天消息气泡内的动作推荐卡片、换一批、加入编排和不喜欢等交互。

## Capabilities

### New Capabilities
- `home-right-sidebar`: 约束首页右侧栏展示内容，确保不再展示独立的动作推荐占位模块。

### Modified Capabilities

## Impact

- 影响 `features/chat/components/chat-page.tsx` 中 `HomeRightSidebar` 的渲染结构。
- 不影响 `/api/ai/exercise-recommendations`、聊天服务端编排、动作推荐卡片 schema 或聊天气泡内推荐交互。
