## Context

本次问题来自当前生产 LangChain Agent Runtime 的真实 trace：模型第一次查询动作候选已经获得 `warmup`、`training`、`stretch` 三类候选事实，但后续仍持续请求同一个动作查询 tool。Runtime 的重复 input 拦截和当前 request tool 可用性拦截都已经生效；缺口在于两者没有形成稳定终止状态，并且动作查询成功结果没有给模型足够清晰的“候选事实覆盖边界”。

当前生产主链是 `runLangChainAgentRuntime` + DeepSeek native `tool_calls`。修复必须保留服务端确定性边界：runtime 只校验 schema、tool 可用性、预算和 trace，不根据用户原文、关键词或业务 phrasing 改写模型意图。

## Goals / Non-Goals

**Goals:**

- 让连续业务 tool 达到上限后，provider 继续调用已移除 tool 的场景进入 terminal loop failure，而不是普通 `unknown_tool` 循环反馈。
- 让 `searchExerciseResources` 的模型可见成功摘要表达候选事实覆盖哪些 section、哪些 section 缺失、该结果是否来自成功查询，以及重复同参查询不会产生新增事实。
- 用回归测试覆盖原始失败类型和等价工具循环类型，证明 handler 不会重复执行，Agent 不会继续空转到 provider timeout。

**Non-Goals:**

- 不新增服务端自然语言意图识别、关键词路由、同义词表或用户短句模板。
- 不在 runtime 中新增具体业务 `toolName` 的语义分支。
- 不让 `searchExerciseResources` 生成 routine、plan、训练卡片、处方、日程或最终结构化输出。
- 不把缺少某 section 表达成“必须继续调用某个 tool”的固定 workflow。

## Decisions

### 1. 用通用 exhausted-tool 状态替代普通 `unknown_tool`

当 `createBusinessToolAvailabilityMiddleware` 因连续业务 tool 上限从 request tools 中移除某个 tool 时，runtime 记录当前 request 的可用工具集合和被移除工具的通用 exhaustion metadata，例如 `toolName`、`limit`、`consecutiveCount`。

后续如果 provider 仍返回该已移除 tool 的 `tool_call`，`createCurrentRequestToolAvailabilityExecutionCoordinator` 不再返回普通 `unknown_tool`，而是返回现有 `tool_consecutive_call_limit_exceeded` 形态的失败 execution。这样现有 `createTerminalToolLoopFailureMiddleware` 和 failure 汇总可以识别并终止主 Agent loop。

取舍：这仍会记录具体 `toolName`，但它只是执行对象标识和 trace metadata，不作为语义分流条件；判断依据是通用 runtime exhaustion state，而不是用户原文或某个业务 tool 的含义。

### 2. 真正未知或未暴露的 tool 仍保持 `unknown_tool`

不是所有当前 request 未暴露 tool 都应视为连续 loop。若 tool 未在 exhaustion metadata 中，仍返回 `unknown_tool` 并拒绝 handler。这保留 DeepSeek 请求未注册 tool 或未暴露 tool 时的安全边界。

取舍：`unknown_tool` 仍然可能出现在非连续循环的异常 provider 输出中；这类情况不应被误归因为连续业务 tool 上限。

### 3. `searchExerciseResources` 只补候选事实完成度，不补业务编排指令

`searchExerciseResources` 的模型可见 summary 增加稳定事实摘要：

- `factLevel = "candidate"`
- `coverage.sectionsWithCandidates`
- `coverage.sectionsWithoutCandidates`
- `coverage.hasCandidates`
- `coverage.allRequestedSectionsHaveCandidates`
- `repeatQueryBoundary`：同一 run 中等价 input 重复查询不会产生新增候选事实，应基于当前可见候选事实继续推理、澄清或合法失败收口

这些字段只表达查询事实覆盖，不表达用户目标已满足，不表达下一步必须调用哪个 tool，也不承诺该结果可以直接成为最终计划。

取舍：模型仍需要自主决定是提交结构化终态、澄清还是失败收口；服务端不替模型生成计划。

### 4. 测试覆盖抽象问题类型，而不是 trace 个例

测试使用原始问题类别：连续业务 tool 上限后的已移除 tool 调用、成功动作查询候选覆盖摘要、重复同参查询反馈。具体用户原话和 trace 只作为回归样例，不写入生产规则。

抽象层级门禁结论：

1. 抽象问题类型：连续 tool loop 终止缺口、候选事实覆盖边界缺失。
2. 通用合同修复：runtime 根据通用 exhaustion state 归一 terminal failure；tool result summary 表达事实覆盖和重复查询边界。
3. 业务 tool 局部说明：`searchExerciseResources` 只说明动作候选事实覆盖，不能支撑最终训练方案生成本身。
4. 回归测试样例：可包含“每周 4 天核心训练计划”这类输入和同等语义变体，但测试不得反向决定生产规则。
5. 服务端语义分流检查：不新增关键词规则、自然语言模板路由、phrasing 特判或具体 toolName 语义分支。

## Risks / Trade-offs

- [Risk] provider 继续返回已移除 tool 时，runtime 会更快失败，可能少给模型一次自我修正机会。 → Mitigation: 只对已达到连续上限的业务 tool 触发 terminal failure；普通 schema repair、空结果和非重复工具仍保留现有可恢复路径。
- [Risk] 候选覆盖字段被模型误读成最终结构化输出可直接成功。 → Mitigation: summary 文案明确它是查询事实，不是 `visibleTrainingProposal`、routine、plan、处方或日程。
- [Risk] 新增 summary 字段影响 model-visible contract gate。 → Mitigation: 更新门禁白名单和测试，确保不恢复 `satisfied`、`fulfillment`、下一步 workflow 指令或内部 diagnostics。

## Migration Plan

1. 先增加 OpenSpec delta 和测试，锁定 runtime terminal loop 与候选覆盖 summary 的期望行为。
2. 修改 runtime 的当前 request tool availability state，使连续上限移除和真正未知 tool 分开处理。
3. 修改 `searchExerciseResources` 模型可见 summary 和 description。
4. 运行最窄 runtime/tool/model-visible contract 测试和 `npm run typecheck`。
5. 若出现异常，可回退本 change 的 runtime state 和 summary shape；不涉及数据库迁移或 API 契约迁移。

## Open Questions

无。
