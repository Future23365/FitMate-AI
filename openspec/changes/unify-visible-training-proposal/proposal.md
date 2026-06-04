## Why

当前动作推荐链路里，模型会在正文里直接写出动作，同时服务端又从 `tool_result`、未来卡片 payload 或旧事实桥保存跨轮事实；这会让“用户实际看到的内容”和“事实桥记住的内容”存在分叉风险。后续还要支持动作编排和多天计划，如果继续把动作推荐、编排、计划拆成彼此独立的结构，会让同一批核心动作在不同业务块之间重复、丢失关系或被模型改写。

本 change 要把本轮 AI 最终推送给用户的训练内容收敛为一份结构化事实：`visibleTrainingProposal`。同时，为避免把健身业务字段硬编码进 `agent-core`，`visibleTrainingProposal` SHALL 通过通用 `final_answer.visibleOutputs[]` 承载。用户看到的动作、编排和计划都从这份结构渲染，跨轮事实桥也保存同一份结构，从而保证“展示给用户的内容”和“下一轮可引用的事实”一致。

## What Changes

- **BREAKING（AI 输出合同）**：`final_answer` SHALL 新增通用 `visibleOutputs[]`，用于承载用户可见结构化输出；训练推送类输出 SHALL 使用 `outputType = "visibleTrainingProposal"`，正文 `content` 只负责解释和说明，不再作为动作事实来源。
- `agent-core` SHALL 只理解 `visibleOutputs[]` 的通用 envelope，不读取 `visibleTrainingProposal` 的健身业务语义，不基于 `outputType` 写业务分支。
- `visibleTrainingProposal` payload SHALL 包含 `kind = "exercise_recommendation" | "routine" | "plan"`，服务端按模型声明的 `kind` 校验结构边界；服务端 MUST NOT 根据用户自然语言关键词替模型判断 kind。
- `visibleTrainingProposal.exerciseItems` SHALL 作为动作事实源，动作项包含 `exerciseId`、`section`、`order`，并在 `routine` / `plan` 中包含 `prescription`。
- `exercise_recommendation` 只允许 `section = "training"` 的 `exerciseItems`，且不需要输出 `prescription`，不允许输出 `schedule`。
- `routine` 必须保留已确定的 `training` 动作，并补充 `warmup`、`stretch` 动作；所有动作项必须包含 `prescription`。
- `plan` 必须在当前同一套 `routine` 编排上增加 `schedule`，用 `assignments` 表达哪些周期日训练、哪些周期日休息；模型 MUST NOT 一次生成每天不同的多套完整编排。
- `prescription` SHALL 对齐现有训练执行字段，使用 `mode`、`sets`、`target`、`setRestSeconds`、`transitionRestSeconds`，不得引入独立处方数组、按 index join 的处方表或正文处方事实源。
- `schedule.assignments` SHALL 使用从 1 开始的 `cycleDayIndex`，必须覆盖 `1..cycleLengthDays` 且不能重复；`type` 首版只允许 `training` / `rest`。
- `exerciseId` SHALL 使用动作库当前主键，例如 `Power_Stairs`；模型可见候选中也必须使用 `exerciseId` 字段名，避免模型从候选 `id` 映射到输出 `exerciseId` 时出错。
- Response Renderer SHALL 通过通用 visible output renderer registry 从已校验 `visibleTrainingProposal` 渲染用户可见动作、编排和计划；不得在 `agent-core` 默认 renderer 中写 `visibleTrainingProposal` 业务特判。
- 跨轮事实桥 SHALL 在确认本轮回答已对用户可见后保存同一份 `visibleTrainingProposal` payload；不得从 `searchExerciseResources` 的 `tool_result`、handler output、model observation 或 user projection 直接保存最终训练方案事实。
- **DELETE-ONLY（旧事实桥）**：实现 SHALL 删除旧动作推荐事实桥主路径及模型可见说明，不保留兼容读取，不迁移旧 payload，不再使用 `exercise_recommendation_displayed`、`exercise_recommendation_fact`、`readRecentExerciseRecommendationFact`、`recentExerciseRecommendationFacts`、`displayedExerciseIds`、`displayedExercises` 等旧命名承载或投影新合同。
- 新事实桥 SHALL 使用可见训练方案语义命名，例如 `visible_training_proposal_displayed`、`visible_training_proposal_fact`、`readRecentVisibleTrainingProposal`、`recentVisibleTrainingProposals`。
- `searchExerciseResources` SHALL 保持只读动作事实查询 tool，不拆分成多个 tool；其输入 SHALL 支持 `suitabilities` 多值筛选，例如 `["warmup", "stretch"]`。
- `searchExerciseResources` 在查询多个 `suitabilities` 时 SHALL 按用途分组返回候选，例如 `{ warmup: [...], stretch: [...] }`；每个模型可见候选必须暴露 `exerciseId` 和必要安全摘要。
- 模型调用流程 SHALL 遵循“先确定主训练证据，再围绕主训练补热身/拉伸，再在同一编排上补计划”的原则：
  - 用户只要推荐动作：只需要 `training` 候选证据，不应额外查询 `warmup` / `stretch`。
  - 用户直接要一套编排：先建立 `training` 主训练证据，再查询或选择 `warmup` / `stretch` 候选。
  - 用户已有上一轮训练方案并要求“编排一下”：复用事实桥里的 `training` 动作，只补充 `warmup` / `stretch`，除非用户明确要求替换主训练。
  - 用户要计划：如果已有完整编排，只生成或调整 `schedule`；如果没有编排，先走编排流程。
- Prompt / model input SHALL 使用中文描述新的 `visibleOutputs[]` 和 `visibleTrainingProposal` 合同，引导模型根据用户自然语言目标判断用户要一批动作、编排还是计划；禁止写成关键词、正则或固定短句式分流规则。
- 服务端 SHALL 只校验结构、`exerciseId` 来源、当前 run grounding、权限、数据库存在性、动作 section 边界、投影边界和可见事实保存边界；服务端 MUST NOT 用关键词或规则替模型做“动作 / 编排 / 计划”的语义判断。

## Capabilities

### New Capabilities
- `visible-training-proposal`: 定义 `final_answer.visibleOutputs[]` 通用 envelope、`outputType = "visibleTrainingProposal"` 训练方案 payload、动作项与处方结构、计划 `schedule` 层、visible output validator / renderer registry、跨轮事实桥保存和下一轮引用规则。

### Modified Capabilities
- `agent-exercise-facet-contract`: 扩展 `searchExerciseResources` 的模型可见查询合同，支持 `suitabilities` 多值查询和 `warmup` / `stretch` 分组返回，同时保持 tool 只读事实查询职责，并把模型可见候选 id 字段统一为 `exerciseId`。

## Impact

- Agent 输出合同：`AgentAction` / `final_answer.visibleOutputs[]` 通用 schema、terminal output validation、final grounding 校验。
- 模型可见输入：system / developer prompt、tool manifest、schema summary、examples、observations、compressed tool results 和 repair feedback。
- Tool 合同：`searchExerciseResources` input schema、output schema、model observation、user projection、trace summary 和 tool-level tests。
- Visible output validator / renderer registry：按 `outputType` 调用业务 validator 和 renderer，`agent-core` 不写健身业务分支。
- 跨轮事实桥：删除旧动作推荐事实桥主路径，在本轮回答确认可见后保存 `visibleTrainingProposal`，下一轮向模型投影最近可见训练方案摘要。
- 动作详情解析：服务端按 `exerciseId` 从数据库读取动作名称、图片、肌群、器械等展示详情，并校验动作仍存在且属于当前可见事实边界。
- 前端聊天消费：后续训练卡片从结构化 `visible_output` 事件或等价结构读取动作、编排和计划数据；正文不再承担事实渲染职责。
- 测试：OpenSpec strict validate、tool contract tests、prompt/model input 描述语言测试、terminal output validation / renderer / fact bridge tests、旧字段残留检查、相关 TypeScript typecheck。
