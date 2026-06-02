## Why

当前 `searchExercises(candidateUse="routine")` 仍容易把主训练的 `bodyRegions`、`targetMuscles`、`equipment`、`levels` 等 hard filters 当成整套 routine 的全局约束。最新日志中，模型只声明了 `training` 的 `sectionCoverage`，服务端没有触发 warmup / stretch 无器械补齐，最终因 `candidate_set_missing_warmup` 阻断生成。

这次 change 需要把 routine 候选生成改成服务端 section-aware 分池：LLM 仍只调用一次动作搜索工具，但服务端必须默认把热身和拉伸筛成无器械或自重、且适合对应 section 的动作，除非用户明确要求热身或拉伸也使用指定器械。

## What Changes

- 将 `searchExercises(candidateUse="routine")` 的执行语义改为服务端内部分池：`trainingPool`、`warmupPool`、`stretchPool`。
- `trainingPool` 继续使用用户主训练目标、肌群、器械、难度、强度和风险边界。
- `warmupPool` 默认只使用适合 `warmup` 的无器械或自重动作，并保留发布态、风险排除、基础安全和可选身体区域弱关联。
- `stretchPool` 默认只使用适合 `stretch` 的无器械或自重动作，并保留发布态、风险排除、基础安全和可选身体区域弱关联。
- 当模型漏写 `warmup` / `stretch` 的 `sectionCoverage` 时，routine 搜索必须在服务端补全三段式覆盖要求，不得把该遗漏转成用户澄清。
- `candidateSetEvidence` 必须记录 section pool 证据，让 `generateRoutineDraft` 按本轮候选事实分段，而不是重新用全局动作元数据猜测。
- 只有用户明确要求热身、主训练、拉伸全程同器械，或明确指定热身 / 拉伸器械时，系统才可以把该器械 hard constraint 应用于对应非 training section。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-exercise-facet-contract`: 明确 routine 动作搜索由一次 LLM 工具调用触发，但服务端必须内部分成 `warmup`、`training`、`stretch` 候选池，并记录 section pool evidence。
- `chat-routine-composition`: 明确聊天 routine 生成必须默认使用无器械或自重 warmup / stretch 候选，不得因为模型漏写 section 覆盖或全局主训练 filters 阻断生成。

## Impact

- 影响 `lib/server/exercises/exercise-service.ts` 的 routine 候选搜索、结果要求归一化、section-aware pool 构造和 diagnostics。
- 影响 `lib/server/agent-orchestrator/readonly-tools.ts` 的 `searchExercises` 输出 evidence、recoveryOptions 和工具说明。
- 影响 `lib/server/agent-orchestrator/workout-tools.ts` 中 `generateRoutineDraft` 对 section pool evidence 的消费。
- 影响 `lib/server/ai/prompt-config.ts` 中 routine 搜索和恢复路径提示，减少模型把主训练 filters 压到 warmup / stretch 的概率。
- 影响 `tests/exercise-service.test.ts`、`tests/agent-orchestrator.test.ts`、`tests/readonly-tools.test.ts` 或手动 LLM flow 期望。
- 不修改 Prisma Schema、数据库迁移、前端外部 API、动作库原始数据或权限边界。
