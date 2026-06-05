## Context

生产文本聊天当前通过 `AgentAction`、`LlmPlanner`、`ToolRegistry`、`searchExerciseResources` 和 `visibleTrainingProposal` 输出训练内容。上一轮 change 已说明 `exercise_selection`、`routine`、`plan` 三类结构能力，并把 `searchExerciseResources` 定位为发布态动作事实查询 tool。

新的失败 trace 暴露出更具体的问题：用户输入已经包含训练目标、居家无器械、每周频次和单次时长，模型也看到新版 prompt / manifest，但它只查询 `suitabilities = ["training"]`，随后在终态校验失败后退成了“当前只查询到主训练动作”的动作推荐。这说明模型可见合同仍缺少多天计划的生成路径，尤其缺少“从 `training` 动作事实继续补齐 `warmup` / `stretch`，再生成 `plan.schedule`”的首轮规划指令。

该问题应在模型第一次可见的 prompt / manifest / observation 合同层修复。`repair feedback` 可以后续复用同一规则，但不能作为主修路径；服务端也不能根据“每周”等用户原文关键词替模型改写 `payload.kind`。

## Goals / Non-Goals

**Goals:**

- 让默认 Agent LLM prompt 明确表达：多天、周期、频次、训练日 / 休息日安排这类训练输出结构应优先使用 `payload.kind = "plan"`，这是结构选择规则，不是固定词语触发。
- 让 prompt 给出 plan 组合顺序：确认目标和限制、查询 `training` 动作、补齐 `warmup` / `stretch` 动作、为三类动作绑定 `prescription`、最后输出 `schedule.assignments`。
- 让 `searchExerciseResources` 的模型可见说明表达：当最终目标是 `routine` 或 `plan` 且当前 run 缺少 `warmup` / `stretch` 动作事实时，应继续查询缺失 section，而不是把 `training` 动作改写成其他 section 或降级为 `exercise_selection`。
- 让 `visibleTrainingProposal` spec 明确：`plan` 复用同一套 `warmup` / `training` / `stretch` 编排，通过 `schedule.assignments` 表达周期安排；事实不足时优先补事实、澄清或失败收口。
- 用自动化测试覆盖模型可见合同，不用服务端单测伪造模型语义判断。

**Non-Goals:**

- 不新增 `generatePlanDraft`、`generateRoutineDraft` 或等价旧式训练生成 tool。
- 不修改 `/api/chat` route、`PlannerPort`、runtime loop、terminal validator、Response Renderer 或 ResourceStore 的职责。
- 不新增服务端关键词、正则、同义词表、短句模板或特定 phrasing 分流。
- 不让 `searchExerciseResources` 生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription` 或 `schedule`。
- 不把 `repair feedback` 作为本次主修点；除非实现中发现现有反馈直接覆盖 prompt 合同，否则不扩大到 repair 机制。

## Decisions

### 1. 在通用 prompt 中写结构生成路径，而不是写业务 tool 特判

默认 prompt 已经是模型第一轮决策一定能看到的合同入口。这里应补充 `visibleTrainingProposal` 的结构选择和组合顺序：`exercise_selection` 是动作选择，`routine` 是一次可执行编排，`plan` 是多天安排。对于 `plan`，prompt 需要说明生成顺序和禁止降级边界。

该说明不会写成“用户说每周就必须 plan”的关键词规则，而是写成“当用户目标需要周期、多天、频次、训练日 / 休息日安排或跨天计划时，优先使用 plan”。模型仍负责理解自然语言目标，服务端仍只校验模型声明的结构。

备选方案是只改 `repair feedback`。该方案被拒绝，因为失败发生前模型第一次 tool planning 就已经只查了 `training`，repair 只能补救终态错误，不能稳定改善首轮决策。

### 2. 在 `searchExerciseResources` manifest 中表达缺失 section 的继续查询边界

`searchExerciseResources` 是动作事实原料 tool，不应生成最终训练方案。但它的 manifest 应告诉模型：如果已经准备生成 `routine` 或 `plan`，当前只拿到 `training` 不等于任务完成；缺 `warmup` / `stretch` 时可以继续用 `suitabilities = ["warmup", "stretch"]` 查询候选。

这不是固定调用次数要求，也不是所有查询都必须查三类 section。只有当模型根据用户目标选择 `routine` / `plan` 时，才需要优先补齐缺失动作事实。

### 3. 把“不得降级”限定在结构目标已经需要 routine / plan 的场景

`exercise_selection` 仍然是合法结构。当用户只是要一批可选动作、动作库查询或普通动作事实回答时，模型不应被迫补 warmup / stretch。

需要禁止的是另一种情况：用户目标已经需要一次编排或多天计划，模型也有可用 tool 能补齐缺失事实，却因为当前只查到了 `training` 就输出 `exercise_selection`。这个边界应写入 prompt、manifest 和 spec，并通过测试验证模型可见输入包含该规则。

### 4. 测试验证模型可见合同和 ReplayPlanner 路径

自动化测试应覆盖：

- prompt 包含 `plan` 结构选择、生成顺序和禁止降级边界；
- prompt 仍明确这不是固定词语触发，服务端不按用户原文改写 kind；
- `searchExerciseResources` manifest / observation 表达 `routine` / `plan` 缺 section 时继续查询；
- ReplayPlanner 场景中，模型先查 `training`，再查 `warmup` / `stretch`，最终输出合法 `payload.kind = "plan"`；
- 架构扫描确认没有新增服务端关键词分流、旧式 draft tool 或 route / renderer 业务改写。

真实模型黑盒验证应作为实现后的补充验证；如果缺少模型 API key，需要在最终总结中说明未运行。

## Risks / Trade-offs

- [Risk] prompt 写得过强，可能让简单动作推荐也被模型误判为 plan。  
  Mitigation: 明确 `exercise_selection` 仍用于只需要一批可选训练动作的目标；禁止降级规则只适用于模型判断目标需要 `routine` 或 `plan` 的场景。

- [Risk] “多天、周期、频次”等描述被误读为关键词触发。  
  Mitigation: 在 prompt 和测试中保留“结构选择规则，不是固定词语触发；服务端不按用户原文改写 kind”的约束。

- [Risk] 模型仍可能在真实黑盒中选择保守回答。  
  Mitigation: 通过 prompt、manifest、observation 多处一致表达组合路径，并补充原始失败表达和等价表达的黑盒验证任务。

- [Risk] manifest 过度指挥 tool 顺序，削弱模型自主规划。  
  Mitigation: 只在 `routine` / `plan` 目标且缺少对应 section 事实时要求优先补事实；不要求所有请求固定调用三次或固定顺序。
