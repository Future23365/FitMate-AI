## Context

当前 Agent 生产链路的配置来源分散：

- Agent LLM prompt 和 `requestDefaults.maxTokens` 在 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`。
- DeepSeek adapter 自己持有 `timeoutMs` 默认值，并把 `maxTokens` 映射为 `max_tokens`。
- `/api/chat` 生产 Agent run 的 `maxSteps`、`maxPlannerCalls`、`maxToolCalls`、repair 和 timeout budget 在 `lib/server/chat/agent-text-chat-service.ts` 中内联。
- 业务 tool 的 `timeoutMs`、动作搜索返回数量、mention 解析数量和最近可见方案数量分散在 tool、repository 和 fact store 中。
- trace 文本预览和长文本 chunk 大小在 adapter 或日志导出相关模块中各自定义。

这些值都属于服务端行为边界。它们不是 secret，也不应该默认靠本地 `.env` 漂移。集中到 TS config 后，调参会进入代码 review 和测试，能避免生产、测试和本地环境无意间跑出不同 Agent 行为。

## Goals / Non-Goals

**Goals:**

- 在 `lib/server/config/` 下集中管理 Agent 相关 TS config。
- 将现有 Agent LLM prompt 配置迁移到同一 config 目录，保留现有 prompt version、构造函数和测试注入能力。
- 集中定义 LLM 请求参数、Agent runtime limits、业务 tool 可见事实数量、trace 文本裁剪参数。
- 每个配置项提供简短中文注释，说明参数用途、影响链路和调整风险。
- 生产链路从集中 config 读取这些值，避免同类限制继续散落在 adapter、chat service、tool 和 repository 中。
- 通过测试证明默认值、请求体映射、runtime 输入、tool 返回数量和 architecture boundary 没有回退到分散常量。

**Non-Goals:**

- 不新增环境变量覆盖 `maxTokens`、runtime budget 或 tool 返回数量。
- 不改变 `DEEPSEEK_API_KEY`、`DEEPSEEK_API_URL`、`DEEPSEEK_MODEL` 的现有环境变量边界。
- 不改变 `/api/chat` 请求/响应 API、NDJSON 事件格式或用户可见 UI。
- 不新增业务 tool、训练生成服务、保存能力或服务端自然语言分流。
- 不调整 prompt 业务语义内容；迁移 prompt 配置位置时保持模型可见合同含义不变。

## Decisions

### 1. 使用集中 TS config，不使用 env override

新增 `lib/server/config/`，以 TS 常量和类型导出服务端 Agent 配置。推荐拆分：

- `agent-runtime-config.ts`：导出 Agent 生产 runtime、LLM request、tool fact limit 和 trace limit 配置。
- `agent-llm-prompt-config.ts`：从现有 prompt 配置模块迁移过来，继续导出 `agentLlmPromptVersion`、`agentLlmPromptConfig`、`buildAgentActionSystemPrompt()`。
- `index.ts`：只在确有必要时导出稳定入口，避免一次性把所有配置暴露给无关消费者。

选择 TS config 的理由：

- 行为预算需要代码 review 和测试保护。
- 本项目当前阶段更重视可审阅的架构边界，而不是线上临时调参。
- env 适合 secret 和部署差异，不适合随意改变模型输出预算、repair 次数或 tool 可见事实量。

替代方案：新增 `AGENT_LLM_MAX_TOKENS` 等环境变量。暂不采用，因为会让本地、测试和生产行为漂移，并且难以从代码审查中发现边界变化。

### 2. 保持 provider 配置和 Agent 行为配置分层

`DEEPSEEK_API_KEY`、`DEEPSEEK_API_URL`、`DEEPSEEK_MODEL` 继续由生产 planner factory 从 env 读取。集中 TS config 只负责 provider 无关的行为预算和默认请求参数，例如 `temperature`、`maxTokens`、`timeoutMs`。

这样可以保持：

- secret 不进入代码仓库。
- Agent 行为边界进入版本化配置。
- DeepSeek adapter 仍只负责供应商请求映射，不拥有生产预算的默认来源。

### 3. 以配置对象表达分组边界

集中配置应按消费场景分组，而不是放成一串散乱数字：

- `llm`：`temperature`、`maxTokens`、`timeoutMs`。
- `runtime`：`maxSteps`、`maxPlannerCalls`、`maxToolCalls`、`maxInvalidActions`、`maxRepairAttempts`、`overallTimeoutMs`、`perToolTimeoutMs`。
- `tools.searchExerciseResources`：`maxReturnedPerSection`、tool timeout。
- `tools.resolveExerciseResourceMentions`：`maxMatches`、tool timeout。
- `tools.inspectVisibleTrainingProposals`：`recentFactListLimit`、fact store hard cap、tool timeout。
- `trace`：model trace preview length、long text chunk length。

每个配置项必须有中文注释。注释说明“为什么存在”和“影响哪个链路”，不要只复述变量名。

### 4. 允许保留 core 级安全 fallback，但生产路径必须来自集中配置

`agent-core` 可以保留内部测试或非生产调用所需的安全 fallback，但生产 `/api/chat` 的 `AgentRunInput.limits` 必须来自集中 config。测试应覆盖生产构造入口，证明 `agent-text-chat-service` 不再内联 runtime budget。

如果实现时决定让 `agent-core/runtime.ts` 直接消费集中配置，也必须保持 `agent-core` 不依赖 prompt、DeepSeek、业务 tool 或 `/api/chat` route。

### 5. tool 返回数量配置必须保留硬上限

集中配置可以表达默认返回数量，例如 `searchExerciseResources.maxReturnedPerSection = 12`。但 repository 或 tool 层仍应保留确定性 hard cap，防止未来误调导致模型输入 payload 暴涨。

这不是 env override，而是代码内的双层保护：

- config default 表达生产期望。
- hard cap 表达安全边界。

## Risks / Trade-offs

- [Risk] 过度集中导致无关模块都导入一个大 config 对象。  
  Mitigation: 按配置域拆分导出，消费者只导入自己需要的子配置。

- [Risk] prompt 配置迁移路径后旧 import 残留。  
  Mitigation: 用 `rg` 扫描旧路径，并增加 architecture boundary 测试。

- [Risk] 增大 `maxTokens` 后成本和延迟上升。  
  Mitigation: 在配置注释中说明成本风险，并保留 timeout、repair 和 runtime budget。

- [Risk] tool 返回数量集中后被误认为可以无限调大。  
  Mitigation: spec 要求 repository/tool 层保留 hard cap，并在测试中覆盖 `maxReturned`。

- [Risk] 只迁移配置位置但没有覆盖真实生产入口。  
  Mitigation: 覆盖 `DeepSeekModelAdapter` 请求体、`createAgentTextChatRunInput` limits、tool 查询返回数量和 trace 预览配置的测试。

## Migration Plan

1. 新增 `lib/server/config/`，定义集中 Agent 配置和注释。
2. 将现有 Agent LLM prompt 配置迁移到 `lib/server/config/agent-llm-prompt-config.ts`。
3. 更新 `DeepSeekModelAdapter`、`LlmPlanner` 测试和 prompt config 测试的 import。
4. 更新 `/api/chat` production run input，从 config 读取 runtime limits。
5. 更新业务 tool / repository / fact store 的默认返回数量和 timeout 来源。
6. 更新 trace 文本裁剪常量来源。
7. 删除或替换旧分散常量，保留必要 hard cap 并加注释。
8. 运行 OpenSpec validate、相关单测、typecheck、lint。

Rollback 策略：由于本 change 不改变数据库和 API 契约，回滚可以恢复旧 import 和旧常量；但实现时应避免同时修改 prompt 内容，降低回滚风险。

## Open Questions

- 是否把 `trace` 导出文件的 mapping 大小也纳入本次集中配置，还是仅纳入模型 adapter trace preview / chunk 参数。实现前应先确认具体生产消费者。
