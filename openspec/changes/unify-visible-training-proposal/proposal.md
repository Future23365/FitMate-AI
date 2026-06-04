## Why

当前动作推荐链路里，模型会在正文里直接写出动作，同时服务端又从 tool result 或未来卡片 payload 保存跨轮事实；这会让“用户实际看到的内容”和“事实桥记住的内容”存在分叉风险。后续还要支持动作编排和多天计划，如果继续把动作推荐、编排、计划拆成彼此独立的结构，会让同一批核心动作在不同业务块之间重复、丢失关系或被模型改写。

本 change 要把本轮 AI 最终推送给用户的训练内容收敛为一份结构化事实：`visibleTrainingProposal`。用户看到的动作、编排和计划都从这份结构渲染，跨轮事实桥也保存同一份结构，从而保证“展示给用户的内容”和“下一轮可引用的事实”一致。

## What Changes

- **BREAKING（AI 输出合同）**：训练推送类 `final_answer` SHALL 增加并使用 `visibleTrainingProposal` 作为本轮用户可见训练方案的唯一结构化事实源；正文只负责解释和说明，不再作为动作事实来源。
- `visibleTrainingProposal.exerciseItems` SHALL 作为动作事实源，动作项包含 `exerciseId`、`section`、`order`，并在生成编排时按需包含 `prescription`。
- 只推荐动作时，模型 SHALL 只输出 `section = "training"` 的 `exerciseItems`，且不需要输出 `prescription`。
- 生成编排时，模型 SHALL 保留已确定的 `training` 动作，并补充 `warmup`、`stretch` 动作和每个动作的 `prescription`。
- 生成计划时，模型 SHALL 在当前同一套编排上增加 `schedule`，用 `assignments` 表达哪些天训练、哪些天休息；模型 MUST NOT 一次生成每天不同的多套完整编排。
- `exerciseId` SHALL 使用动作库当前主键，例如 `Power_Stairs`；模型可读其语义，服务端也能用同一值校验并读取动作详情。
- Response Renderer SHALL 从 `visibleTrainingProposal` 渲染用户可见动作、编排和计划；跨轮事实桥 SHALL 在确认本轮回答已对用户可见后保存同一份 `visibleTrainingProposal`。
- `searchExerciseResources` SHALL 保持只读动作事实查询 tool，不拆分成多个 tool；其输入 SHALL 支持 `suitabilities` 多值筛选，例如 `["warmup", "stretch"]`。
- `searchExerciseResources` 在查询 `warmup` / `stretch` 时 SHOULD 按用途分组返回候选，例如 `{ warmup: [...], stretch: [...] }`，帮助模型围绕已确定主训练补足结构。
- 模型调用流程 SHALL 遵循“先确定主训练，再围绕主训练补热身/拉伸”的原则：
  - 用户只要推荐动作：调用 1 次 `searchExerciseResources`，只查 `training`。
  - 用户直接要一套编排：调用 2 次，先查 `training`，再基于已确定主训练查 `warmup` / `stretch`。
  - 用户已有上一轮动作并要求“编排一下”：复用事实桥里的 `training` 动作，只再查 1 次 `warmup` / `stretch`。
  - 用户要计划：如果已有编排，只生成 `schedule`；如果没有编排，先走编排流程。
- Prompt / model input SHALL 使用中文描述新的训练推送合同，引导模型根据用户自然语言目标判断用户要一批动作、编排还是计划；禁止写成关键词、正则或固定短句式分流规则。
- 服务端 SHALL 只校验结构、`exerciseId` 来源、当前 run grounding、权限、数据库存在性和投影边界；服务端 MUST NOT 用关键词或规则替模型做“动作 / 编排 / 计划”的语义判断。

## Capabilities

### New Capabilities
- `visible-training-proposal`: 定义 `final_answer.visibleTrainingProposal` 输出合同、动作项与处方结构、计划 `schedule` 层、Response Renderer 渲染、跨轮事实桥保存和下一轮引用规则。

### Modified Capabilities
- `agent-exercise-facet-contract`: 扩展 `searchExerciseResources` 的模型可见查询合同，支持 `suitabilities` 多值查询和 `warmup` / `stretch` 分组返回，同时保持 tool 只读事实查询职责。

## Impact

- Agent 输出合同：`AgentAction` / `final_answer` schema、terminal action validation、final grounding 校验。
- 模型可见输入：system / developer prompt、tool manifest、schema summary、examples、observations、compressed tool results 和 repair feedback。
- Tool 合同：`searchExerciseResources` input schema、output schema、resource projection、trace summary 和 tool-level tests。
- Response Renderer：从 `visibleTrainingProposal` 输出用户可见 NDJSON 事件和后续卡片渲染数据。
- 跨轮事实桥：在本轮回答确认可见后保存 `visibleTrainingProposal`，下一轮向模型投影最近可见训练方案摘要。
- 动作详情解析：服务端按 `exerciseId` 从数据库读取动作名称、图片、肌群、器械等展示详情。
- 前端聊天消费：后续训练卡片从结构化事件读取动作、编排和计划数据；正文不再承担事实渲染职责。
- 测试：OpenSpec strict validate、tool contract tests、prompt/model input 描述语言测试、final grounding / renderer / fact bridge tests、相关 TypeScript typecheck。
