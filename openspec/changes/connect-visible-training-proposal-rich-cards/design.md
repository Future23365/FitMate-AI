## Context

当前生产聊天主链已经通过 `final_answer.visibleOutputs[]` 输出 `visibleTrainingProposal`，并由服务端 validator / renderer / fact bridge 保证结构化训练事实、用户可见事件和跨轮引用一致。前端 `features/chat/components/chat-page.tsx` 目前把 `visible_output` 渲染成轻量 `VisibleTrainingProposalPanel`，只能展示基础动作列表和处方摘要。这个面板是为了新链路验证临时写出的极简 UI，不是目标产品样式；实现本 change 时不得把它继续作为用户可见训练卡片的一部分。

项目里已有三张用户体验更完整的训练富卡片：`ExerciseRecommendationCard`、`WorkoutRoutineDraftCard` 和 `WorkoutPlanDraftCard`。这些卡片已经覆盖动作详情入口、图片、保存 routine、导入 plan、历史回放补详情等交互。新链路要复用它们的样式和既有非 AI 建议交互，但不能把旧卡片 state 重新变成新事实源，也不能要求模型为了前端展示输出旧 draft 结构。

## Goals / Non-Goals

**Goals:**

- 从 `message.visibleOutputs` 中的 `visibleTrainingProposal` 渲染旧三张训练富卡片。
- 以 `ExerciseRecommendationCard`、`WorkoutRoutineDraftCard` 和 `WorkoutPlanDraftCard` 的既有视觉与交互为唯一目标样式。
- 删除或停用 `VisibleTrainingProposalPanel` 的用户可见路径，确保新消息不再显示轻量面板里的任何信息。
- 保持 `visibleTrainingProposal.payload` 是唯一训练事实源，旧卡片 props 只是前端派生视图。
- 复用旧卡片已有的动作详情、保存和导入交互。
- 为后续推荐按钮 / AI 建议回复能力保留清晰扩展边界，但本 change 不实现、不绑定、不展示新推荐按钮。
- 保留旧历史消息中 `bubblePlans`、`bubbleRoutines`、`exerciseRecommendations` 的兼容展示。
- 用自动化测试证明三种 `kind` 的转换、旧状态兼容和 AI 输出合同不变。

**Non-Goals:**

- 不修改 `AgentAction`、`FinalAnswerActionSchema`、`visibleOutputs[]` envelope 或 `visibleTrainingProposal.payload`。
- 不新增、重命名或扩展 `searchExerciseResources`、`inspectVisibleTrainingProposals` 等 Agent tool。
- 不把 `visibleTrainingProposal` 写进 `agent-core` 顶层业务字段。
- 不恢复旧 `assistant_action`、旧 `/api/ai/*` 生成接口或旧动作推荐事实桥。
- 不让模型输出 `WorkoutRoutineDraft`、`WorkoutPlanDraft` 或 `ExerciseRecommendationCard` 结构。
- 不保留轻量 `VisibleTrainingProposalPanel` 作为 fallback UI，也不新增第四种训练卡片样式。
- 不新增 AI 层建议回复生成能力，不修改 `assistantSuggestions` / `assistant_suggestions` 合同，不把新 `visibleTrainingProposal` 富卡片路径绑定到推荐按钮。

## Decisions

### 1. 前端 adapter 消费 `visibleTrainingProposal`

新增前端 adapter，例如 `features/chat/lib/visible-training-proposal-cards.ts`。adapter 接收 `ChatVisibleOutput`、assistant 文本和可选动作详情缓存，返回三类派生视图之一：

- `exercise_selection` -> `ExerciseRecommendationCard`
- `routine` -> `WorkoutRoutineDraft`
- `plan` -> `WorkoutPlanDraft`

选择这个方案，是因为 `visibleTrainingProposal` 已经是跨轮事实桥和最终渲染的共同事实源。把旧卡片结构塞回模型输出会制造第二套事实合同，后续刷新、引用和计划扩展都会重新出现“用户看到的内容”和“模型读取的事实”不一致的问题。

备选方案是修改服务端 renderer，让它直接输出旧三张卡片事件。这个方案能减少前端转换，但会把 UI 组件数据结构推回服务端 renderer，并扩大后端对前端卡片字段的耦合。当前更合适的边界是：服务端继续输出稳定事实和轻量展示摘要，前端 adapter 负责 UI 视图模型。

### 2. 旧三张卡片是唯一用户可见样式

`VisibleTrainingProposalPanel` 不应继续承担用户可见训练卡片职责。实现时应删除该组件，或至少保证 `visibleTrainingProposal` 新消息不会再进入它的渲染路径。轻量面板里的标题、分段 mini list、处方 chip、`exercise_selection` / `routine` / `plan` 技术枚举 badge 都不应继续出现在用户界面。

选择这个方案，是因为产品目标不是增加一张“新极简卡片”，而是把后端新结构接回已有三种成熟卡片。保留轻量面板作为 fallback 会让 UI 风格继续分叉，也容易让技术字段以“兜底文案”的形式泄漏给用户。

### 3. `payload` 管事实，`content` 和详情接口管展示

adapter 必须从 `visibleTrainingProposal.payload.exerciseItems` 读取 `exerciseId`、`section`、`order`、`prescription` 和 `schedule`。`visible_output.content.sections[].items[].exercise` 只作为展示详情摘要使用，不能反向改写动作事实。

当旧卡片需要更完整的动作详情时，前端可以按 `exerciseId` 复用已有 `/api/exercises/:id` 补齐机制或统一详情加载 helper。缺失详情时使用稳定兜底文案，不能因为详情未加载就丢弃已校验的训练事实。

备选方案是扩展 AI payload，加入 `title`、`goal`、`nameZh`、`categoryZh`、`levelZh` 等展示字段。这个方案会增加模型输出负担，也会让展示字段进入跨轮事实源；本 change 明确不采用。

### 4. 新消息优先 `visibleOutputs`，旧状态只做历史兼容

聊天气泡渲染顺序应优先处理当前 assistant message 的 `visibleOutputs`。如果消息没有可渲染的 `visibleTrainingProposal`，才继续使用已有 `bubblePlans`、`bubbleRoutines` 和 `bubbleExerciseRecommendations` 兼容旧历史。

实现时不应在收到 `visible_output` 事件后同步写入 `bubblePlans`、`bubbleRoutines` 或 `bubbleExerciseRecommendations`。这些旧 state 的存在只是为了旧数据回放，不再承担新 Agent 消息的事实存储。

### 5. plan 适配复用同一套 routine

`visibleTrainingProposal.kind = "plan"` 的合同是“同一套 `warmup` / `training` / `stretch` 编排 + `schedule.assignments`”。adapter 转换为 `WorkoutPlanDraft` 时，训练日应复用同一套 section；休息日生成空 `sections` 和稳定恢复提示。不得要求模型输出每天不同的完整动作编排，也不得在 adapter 中凭自然语言生成新的动作。

### 6. 推荐按钮能力只预留不接入

`ExerciseRecommendationCard` 当前具备接收 `assistantSuggestions` 并在底部渲染按钮的能力，但 AI 层结构化建议回复还没有完整接入。本 change 的目标是把 `visibleTrainingProposal` 接到旧三张卡片样式，不负责生成、绑定或展示新的推荐按钮。

实现时，新 `visibleTrainingProposal` 富卡片路径不应把当前 message 的 `assistantSuggestions` 传给卡片，也不应恢复旧的固定“换一批”或“编成训练”按钮。后续可以通过独立 change 重新设计 AI 层建议回复、按钮来源、按钮位置和 targetOperation 语义。

## Risks / Trade-offs

- [Risk] 旧卡片必填字段多于 `visibleTrainingProposal` 展示摘要，导致首屏字段不完整。→ Mitigation：adapter 为展示字段提供稳定兜底，并按 `exerciseId` 补齐动作详情；训练事实不因展示详情缺失而丢失。
- [Risk] 新旧两套渲染同时显示，造成重复卡片。→ Mitigation：同一 assistant message 存在可渲染 `visibleTrainingProposal` 时，不再渲染对应旧 `bubble*` 卡片。
- [Risk] 轻量面板作为 fallback 残留，继续出现技术字段或第四种卡片样式。→ Mitigation：spec 和 tasks 明确要求删除或停用用户可见 `VisibleTrainingProposalPanel` 路径，测试断言 `exercise_selection` / `routine` / `plan` 技术枚举不会作为卡片 UI 显示。
- [Risk] 当前 change 被误解为要补 AI 推荐按钮生成。→ Mitigation：spec 和 tasks 明确推荐按钮 / AI 建议回复只预留，不在本次绑定或渲染。
- [Risk] `plan` 被错误展开成多套不同 routine。→ Mitigation：spec 和 tests 明确要求训练日复用同一套 `exerciseItems`，只根据 `schedule.assignments` 区分训练日和休息日。
- [Risk] 为了旧 UI 便利重新修改 AI 输出结构。→ Mitigation：测试断言 `visibleOutputs[]`、`visibleTrainingProposal.payload`、生产 tool registry 和事实桥合同不变。

## Migration Plan

1. 新增 adapter 和单测，先覆盖三种 `kind` 到旧卡片 props 的纯转换。
2. 将聊天气泡 `VisibleTrainingProposalPanel` 替换为富卡片 renderer；删除或停用轻量 panel 的用户可见路径，不保留为 fallback。
3. 保持 `visibleOutputs` 持久化不变，并保留旧 `bubble*` 历史兼容读取。
4. 运行相关前端渲染测试、聊天事件消费测试和 `npm run typecheck`。

## Open Questions

无。当前范围已限定为前端富卡片适配，不改变 AI 输出、tool 或事实桥合同。
