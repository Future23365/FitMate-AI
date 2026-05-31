## Context

首页聊天页通过 `HomeRightSidebar` 展示右侧辅助信息。当前右侧栏的“动作推荐”模块只是静态空状态，占位文案提示用户开始对话获取推荐；真实动作推荐已经由聊天消息气泡中的 `ExerciseRecommendationCard` 承载，并包含换一批、加入编排和反馈交互。

## Goals / Non-Goals

**Goals:**
- 删除首页右侧栏的独立“动作推荐”占位模块。
- 保留右侧栏其他辅助信息，避免首页右侧突然变空或破坏布局。
- 保留聊天气泡内真实动作推荐能力。

**Non-Goals:**
- 不调整聊天意图识别、动作推荐 API、模型 prompt 或推荐候选筛选。
- 不改变 `ExerciseRecommendationCard` 在聊天消息中的展示和交互。
- 不重做首页整体布局。

## Decisions

1. 只从 `HomeRightSidebar` 中移除“动作推荐” section。

   这个方案直接解决右侧栏信息噪音，不影响聊天推荐主链。备选方案是把右侧栏推荐模块改成真实推荐列表，但这会引入状态同步、刷新语义和推荐来源冲突，超出本次“删掉模块”的需求。

2. 保留 `ResponsiveRightSidebar` 和现有右侧栏布局变量。

   这样可以保持 header 和 main 的右侧偏移不变，避免把一个局部内容删除扩大成首页布局重构。

## Risks / Trade-offs

- [Risk] 删除一个 section 后右侧栏纵向内容减少，底部小贴士可能更靠上。→ Mitigation: 保留 `mt-auto` 小贴士布局，让右侧栏仍有清晰的顶部信息和底部提示层级。
- [Risk] 用户仍需要动作推荐入口。→ Mitigation: 聊天气泡内的推荐卡片和快捷提示仍保留，推荐主链不受影响。
