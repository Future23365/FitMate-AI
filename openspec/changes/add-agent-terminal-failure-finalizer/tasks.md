## 1. 边界审查

- [ ] 1.1 复核本 change 为 `agent-tool-change-governance` 下的 Production 接入变更，并包含 `agent-prompt-contract-governance` 的 secondary 模型可见合同检查。
- [ ] 1.2 检查当前 Git 工作区，确认无关 diff 不进入本 change。
- [ ] 1.3 读取当前 `/api/chat` production adapter、terminal failure projection、`LlmPlanner` / `DeepSeekModelAdapter`、response renderer、trace 写入和前端 chat client 错误消费代码。
- [ ] 1.4 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁审查，确认没有把具体用户短句、具体业务 `toolName`、字段组合或 trace case 升格为通用生产规则。
- [ ] 1.5 明确允许触碰模块：production chat adapter、finalizer service / adapter、`lib/server/config/`、trace、chat service tests、prompt/model input tests 和前端错误消费测试。
- [ ] 1.6 明确禁止触碰模块：不放宽 validator，不绕过 ResourceStore / Policy Guard / Response Renderer，不注册隐藏业务 tool，不恢复旧链路，不新增用户原文关键词 / phrasing / 具体业务 `toolName` 分支。

## 2. 配置、Prompt 和 Schema

- [ ] 2.1 在集中配置模块中新增 terminal failure finalizer 配置，覆盖 `enabled`、`maxCallsPerRun`、`timeoutMs`、`maxTokens`、`temperature` 和 `maxSuggestedQuestions`。
- [ ] 2.2 为 finalizer 配置对象和核心配置项添加简短中文意图注释，说明成本、延迟、输出长度和用户体验影响。
- [ ] 2.3 新增 finalizer prompt 配置和 `promptVersion`，确保描述性自然语言默认中文，技术标识保持英文原样。
- [ ] 2.4 编写 finalizer system prompt：明确主 Agent 已耗尽内部修复机会、本轮未满足需求、不得输出 `AgentAction` / tool call / `visibleOutputs` / NDJSON / 保存承诺，只能生成失败解释和建议问题。
- [ ] 2.5 定义 `TerminalFailureFinalizerInput` 或等价输入结构，只包含脱敏用户目标摘要、失败类别、稳定错误 code、未满足要求、被阻断输出和 verified facts 摘要。
- [ ] 2.6 定义 `TerminalFailureFinalizerOutput` 或等价输出 schema，只允许非空 `content` 和最多 3 条 `suggestedQuestions`。
- [ ] 2.7 增加 prompt / model input snapshot 或等价测试，断言 finalizer 不接收 tool manifest、不包含完整 `PlannerInput`、不暴露完整 tool output 或敏感字段。

## 3. Finalizer 服务与 Provider Gate

- [ ] 3.1 实现 provider availability gate，基于模型配置、adapter diagnostics、HTTP status、quota/rate limit/auth/network/timeout 和当前请求剩余时间判断是否允许 finalizer。
- [ ] 3.2 将 provider HTTP / quota / rate limit / auth / network / adapter exception 归一为稳定诊断 code，避免被误判成内部 repair 失败。
- [ ] 3.3 实现 finalizer input builder，只消费 runtime status、terminal error code、validation details、budget events、verified facts 和脱敏摘要。
- [ ] 3.4 实现 finalizer model call service 或 adapter，最多调用一次，不提供 tool manifest，不进入主 Agent repair loop。
- [ ] 3.5 实现 finalizer output validation；输出非法、超时、配置关闭或 provider gate 拒绝时降级为确定性 fallback，不做第二轮 repair。
- [ ] 3.6 增加 provider gate 和 finalizer service 单元测试，覆盖内部校验失败允许 finalizer、provider 不可用拒绝 finalizer、finalizer 输出无效降级。

## 4. Production Chat Stream 接入

- [ ] 4.1 在 production terminal failure projection 中接入 finalizer gate，确保只对内部可分类 failure 尝试 finalizer。
- [ ] 4.2 finalizer 成功时输出 `content`、可选 `suggested_questions` 和 `done`；不得输出 `error` 作为该失败的主用户结果。
- [ ] 4.3 finalizer 失败或不可用时继续使用确定性中文 fallback，保证 stream 仍以 `done` 或等价事件结束。
- [ ] 4.4 确认被拒绝的 `visibleOutputs[]` 不渲染、不保存、不写入 visible training proposal fact store。
- [ ] 4.5 更新前端 chat client / controller 测试，覆盖 finalizer `content` / `suggested_questions` 正常结束 loading，HTTP / stream / NDJSON 失败仍走本地安全错误。
- [ ] 4.6 更新 chat service tests，覆盖 `repair_limit_exceeded` + visible output validation failure 进入 finalizer、provider failure 不进入 finalizer、finalizer 输出无效降级。

## 5. Trace、导出和报告

- [ ] 5.1 在 AiTrace 中记录 finalizer trigger、provider availability gate、promptVersion、模型、token usage、输出校验和 projection type。
- [ ] 5.2 记录 finalizer skipped / degraded reason，例如 `provider_unavailable`、`provider_quota_exhausted`、`model_config_missing`、`finalizer_disabled`、`remaining_time_insufficient`、`finalizer_output_invalid`。
- [ ] 5.3 更新 `/dev/ai-traces` 导出或 trace summary，使 finalizer request / response 可通过脱敏摘要或 `contentRef` 排查。
- [ ] 5.4 更新 trace tests，断言 finalizer 回复不会被记录为主 Agent `final_answer_success`，并保留主 Agent 原始 failure code。
- [ ] 5.5 更新手动 LLM runner / report contract，区分 `main_agent_completed`、`terminal_failure_finalizer`、`deterministic_fallback` 和 provider unavailable。
- [ ] 5.6 确认 trace 写入失败仍为非致命，不改变用户可见响应或 finalizer 判定结果。

## 6. 架构与回归测试

- [ ] 6.1 增加 architecture boundary scan，确认 `/api/chat`、Agent runtime、validator、renderer 和 finalizer 相关模块没有新增用户原文关键词、正则、同义词、phrasing 特判或具体业务 `toolName` 语义分支。
- [ ] 6.2 增加 finalizer prompt 合同测试，确认描述性自然语言为中文，`toolName`、字段名、enum、action type、resource type、schema id 等技术标识保持英文原样。
- [ ] 6.3 增加 output schema 测试，覆盖 `content` 为空、`suggestedQuestions` 超限、输出 `visibleOutputs`、输出 `tool_call`、声称已完成等非法结果。
- [ ] 6.4 增加 production stream 回归测试，确认 finalizer 输出不会产生训练卡片、confirmation、旧事件或旧 trigger。
- [ ] 6.5 增加 provider unavailable 回归测试，确认 429 / quota / rate limit / auth / network / config 缺失时不调用 finalizer。
- [ ] 6.6 如实现修改 TypeScript、API、Schema、AI 编排或共享业务逻辑，运行相关最窄自动化测试和 `npm run typecheck`。
- [ ] 6.7 默认 `npm run test` 必须 token-safe，不得真实调用 finalizer LLM；真实模型验证只能通过显式手动 LLM 命令。

## 7. OpenSpec 和收尾

- [ ] 7.1 运行 `openspec validate add-agent-terminal-failure-finalizer --strict`。
- [ ] 7.2 实现阶段如修改核心链路或架构，在 `docs/方案变更历史/` 新增上海时间到秒的方案变更记录。
- [ ] 7.3 实现阶段如修改核心链路，在 `docs/项目演变历程.md` 末尾追加简要演变记录。
- [ ] 7.4 最终 diff 检查：确认没有无关格式化、无关依赖升级、无关业务 tool 重写、高风险删除或旧链路恢复。
- [ ] 7.5 最终总结改了什么、为什么优于仅靠前端错误兜底、如何验证、是否存在未运行真实 LLM 的剩余风险。
