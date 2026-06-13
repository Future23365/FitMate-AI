## Context

当前生产 `/api/chat` 使用 LangChain Agent Runtime、DeepSeek native `tool_calls` 和结构化终态工具。一次可执行训练 `routine` 已经通过 `visibleTrainingProposal.payload.kind = "routine"` 表达，并由 `submitVisibleTrainingProposal` 触发服务端 validator 和用户可见投影。

当前缺口不是数据库动作事实缺失，也不是 response adapter 丢失按钮，而是模型可见合同没有稳定表达“完整单次训练 routine 默认包含 `warmup`、`training`、`stretch`”。因此模型可能只围绕用户主目标生成 `training` 动作处方，并在最终卡片中遗漏热身和拉伸。

现有 `agent-llm-prompt-configuration` 已要求默认 system prompt 不能承载 `routine / plan` section coverage 细则，所以本 change 不把三段编排细则写成通用 system prompt 的固定 workflow，而是放入 `submitVisibleTrainingProposal` 的 tool description / schema description，以及 accepted 后的模型可见 summary。

## Goals / Non-Goals

**Goals:**

- 让模型可见合同表达完整 `routine` 默认由 `warmup`、`training`、`stretch` 三段组成。
- 明确“核心、胸部、下肢、全身”等用户主目标应落在 `training` 段，不替代 section 枚举。
- 让 `searchExerciseResources` 的说明支持模型为完整 routine 查询多 section 动作事实，但不把 section 缺口变成固定继续调用流程。
- 让 `submitVisibleTrainingProposal` accepted summary 暴露当前已校验输出的 section 覆盖事实，支持最终回答和 `suggestedQuestions` 的 grounded 推理。
- 通过最窄相关测试验证 prompt/tool description/model-visible summary 不引入服务端语义分流或固定 tool workflow。

**Non-Goals:**

- 不修改 LangChain runtime 主循环、model factory provider payload、production response adapter、`/api/chat` route 或前端 suggested questions 协议。
- 不新增服务端关键词、正则、同义词表、短句模板或基于 `toolName` 的语义分流。
- 不强制所有用户请求都生成完整三段 routine；用户明确只要主训练、动作列表、解释文本或事实不足时仍允许合法收口。
- 不改变数据库 schema、Prisma migration、动作元数据生成规则或训练保存链路。

## Decisions

### 1. 将完整 routine 规则放在业务输出 tool 合同层

`payload.kind = "routine"` 的完整组成属于业务输出结构语义，不适合写成通用 system prompt 中的详细 section coverage 规则。实现上优先更新 `submitVisibleTrainingProposal` 的 description 和 `payload` schema description，表达：

- 完整单次训练 `routine` 默认包含 `warmup`、`training`、`stretch`。
- `training` section 承载用户主训练目标。
- 用户明确要求只安排部分范围，或当前事实不足且无法继续补齐时，可以交付部分范围，但正文和建议提问需要诚实表达边界。

备选方案是在 `prompt.ts` 中加入完整三段规则。该方案会和现有 prompt 分层 spec 产生冲突，且容易把业务输出细则混入通用 prompt，因此不采用。

### 2. 查询 tool 只表达事实能力，不指挥下一步

`searchExerciseResources` 需要告诉模型可以用 `suitabilities` 查询 `warmup`、`training`、`stretch` 的动作事实，也需要解释 `groups.<section>` 与 `exerciseItems[*].section` 的对应关系。但它不能说“缺少某个 section 就必须继续查询”。

实现上只调整 description / schema description 的能力边界，保持 handler、repository、filter policy 和输出结构不变。

### 3. accepted summary 暴露已校验输出覆盖事实

最终回答阶段应看到已通过 validator 的可见训练结果覆盖了哪些 section。实现上在 `submitVisibleTrainingProposal` accepted 的 `toModelVisibleSummary` 和 trace summary 中加入：

- `sectionSummary`
- `availableSections`
- `missingSections`

这些字段来自已校验 payload 的 `exerciseItems[*].section`，只描述事实，不提供 `nextActionHints`、`recommendedNextStep` 或业务目标满足度字段。

### 4. suggestedQuestions 只作为自然下一步，不作为主修复

主修复是让模型生成完整 routine。`suggestedQuestions` 只在模型基于当前事实交付部分范围时，提供用户可点击的继续补齐入口。服务端不从正文或按钮文案推断下一轮能力，也不在 response adapter 中硬编码建议按钮。

## Risks / Trade-offs

- [Risk] 模型可能过度为动作推荐也查询热身和拉伸。→ Mitigation：tool description 和测试区分 `exercise_selection` 与 `routine`，只在可执行编排目标默认三段。
- [Risk] 三段规则写得过硬导致用户明确只要主训练时被违背。→ Mitigation：合同保留“用户明确只要部分范围”与“事实不足时诚实收口”的出口。
- [Risk] accepted summary 新增字段被误读为下一步指令。→ Mitigation：字段只命名为覆盖事实，不新增 `nextActionHints`、`recommendedNextStep` 或固定 workflow 文案，并运行 model-visible contract gate 测试。
- [Risk] prompt 分层回归。→ Mitigation：默认 system prompt 不写具体业务 toolName 触发条件，不写“缺 section 必须调用某工具”的规则。
