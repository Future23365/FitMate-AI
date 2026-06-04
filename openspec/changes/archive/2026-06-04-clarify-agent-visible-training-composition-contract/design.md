## Context

生产 `/api/chat` 当前通过 `AgentAction`、`ToolRegistry`、`LlmPlanner` 和 Response Renderer 执行文本聊天。`searchExerciseResources` 已作为低风险只读动作库事实查询 tool 接入生产，`visibleTrainingProposal` 已作为 `final_answer.visibleOutputs[]` 中的训练方案输出合同，支持 `exercise_selection`、`routine` 和 `plan` 三类 payload。

最近 trace 显示模型在用户提出包含训练目标、器械限制、每周频率和单次时长的复杂目标时，只查询了 `training` 动作并输出 `exercise_selection`。根因不是缺少旧式 `generatePlanDraft` / `generateRoutineDraft` tool，而是模型可见说明没有足够清晰地区分“动作事实原料”“最终训练结构”和“模型自主组合边界”。如果修复方式改成服务端关键词分流或 prompt 固定短语映射，会削弱模型推理能力，并违反 Agent tool 架构边界。

## Goals / Non-Goals

**Goals:**

- 让模型可见合同清楚表达：`searchExerciseResources` 查询动作事实，`visibleTrainingProposal` 表达最终训练结构，二者可以由模型自主组合。
- 让 `searchExerciseResources` 的 manifest、examples 和 observation 说明返回的 `groups.<section>.exercises[*].exerciseId` 可作为 `visibleTrainingProposal.exerciseItems` 的受控事实来源。
- 让 `visibleTrainingProposal` 的模型可见说明描述结构能力、字段要求和事实边界，而不是固定自然语言短语到 `payload.kind` 的映射。
- 保持服务端只做结构、权限、数据库事实、grounding 和渲染校验，不根据用户原文替模型选择 `payload.kind` 或 tool 调用顺序。
- 用自动化测试覆盖 prompt、manifest、observation 和 ReplayPlanner 组合路径，确保没有新增服务端关键词路由或旧式 draft tool。

**Non-Goals:**

- 不新增 `generatePlanDraft`、`generateRoutineDraft` 或等价旧式 draft 生成 tool。
- 不新增 `purpose`、`queryIntent`、`candidateUse`、`resultRequirements` 等让服务端替模型承载高层语义的 tool 输入字段。
- 不修改 `/api/chat` 主链路、`PlannerPort`、Executor、`Policy Guard`、`ResourceStore`、`Resource Contract Validator` 或 Response Renderer。
- 不让 `searchExerciseResources` 生成最终训练方案、处方、日程、保存结果或用户记忆。
- 不把用户自然语言中的“每周”“今天”“推荐”等词写成固定 `payload.kind` 选择规则。

## Decisions

### 1. 用 affordance 合同替代 intent 固化

修改 prompt 和 tool manifest 时，只说明工具和输出结构的能力边界：

- `searchExerciseResources` 能查询发布态动作事实。
- `suitabilities` 能表达 `warmup`、`training`、`stretch` 分组事实。
- `visibleTrainingProposal.payload.kind` 能表达动作选择、一次编排或带 schedule 的计划结构。
- 当前 run 可见、且 `satisfied=true` 的动作事实可以作为 `exerciseItems[*].exerciseId` 来源。

不写“某类自然语言表达必须选择某个 kind”。这样保留模型自主推理，同时让模型有足够事实和结构信息做决策。

备选方案是给 prompt 写硬性意图映射，例如“每周频率必须 plan”。该方案被拒绝，因为它会把模型语义理解压成固定短语规则，遇到同类但不同表述时容易退化。

### 2. `searchExerciseResources` 只提供事实原料，不生成最终方案

`searchExerciseResources` manifest 和 observation 将明确：

- tool result 是动作事实原料，不是最终训练方案。
- tool result 中实际返回的 section 由 `groups` 决定。
- 如果模型选择输出的结构需要未返回的 section、`prescription` 或 `schedule`，这些字段不能从 tool result 伪造；模型应基于当前可见事实自主决定继续调用 tool、澄清或输出当前事实可支撑的结构。

这不是固定下一步工具调用，而是说明事实缺口和可消费边界。

### 3. 终态 validator 不读取用户原文

`visibleTrainingProposal` validator 继续只校验 payload schema、动作 ID、发布态和 section 合法性。它不会判断用户是不是“应该”得到 `plan` 或 `routine`。如果模型输出合法 `exercise_selection`，服务端不会因用户原文改写成 `plan`；修复重点在模型可见合同，而不是 validator 语义分流。

### 4. 测试验证合同，不验证黑盒模型固定选择

自动化测试不应断言“某句话必须输出 plan”。测试重点是：

- prompt 和 manifest 不包含固定自然语言短语映射。
- 模型可见说明包含工具 affordance、事实来源和最终结构边界。
- observation 表达可用事实和缺口，不把 tool result 伪装成最终训练方案。
- ReplayPlanner 能模拟模型自主组合多次 tool result 并输出合法 `visibleTrainingProposal.payload.kind = "plan"`。

真实模型是否稳定选择更完整结构，应通过后续黑盒日志或手工 LLM 测试验证，而不是用服务端单测替代模型推理。

## Risks / Trade-offs

- [Risk] prompt / manifest 只是增强模型可见合同，无法 100% 保证每个真实模型输出都选择最完整结构。  
  Mitigation: 增加黑盒验证任务，使用等价表达检查模型是否能根据工具 affordance 自主组合。

- [Risk] 如果 observation 文案过度强调“不是最终方案”，模型可能再次误解为不能使用这些动作事实。  
  Mitigation: 使用正向表述：“这是动作事实来源，可用于 `exerciseItems`；最终结构必须由 `visibleOutputs` 表达。”

- [Risk] 如果 manifest 文案过度示例化，模型可能把示例当成固定流程。  
  Mitigation: examples 只展示 schema 合法输入和 tool 能力，不写自然语言触发条件，不写固定调用顺序。

- [Risk] 放松固定分阶段流程后，模型可能在复杂场景输出事实不足的结构。  
  Mitigation: validator 继续拒绝结构不完整、动作 ID 不受控或 section 不合法的 `visibleTrainingProposal`，runtime 进入 repair、澄清或失败收口。
