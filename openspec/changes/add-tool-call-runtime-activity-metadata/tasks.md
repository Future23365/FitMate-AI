## 1. 合同与治理检查

- [ ] 1.1 按 `agent-tool-change-governance` 确认本 change 只修改 LangChain tool wrapper、production tool catalog、runtime observer、response adapter、trace、prompt/schema description 和前端 activity 展示边界，不改写业务语义判断。
- [ ] 1.2 按 `agent-prompt-contract-governance` 对齐 `docs/llm-prompt-guidance.md`，确认 `runtimeMetadata.activitySummary` 的模型可见说明只表达字段用途、UI metadata 边界和非业务事实属性。
- [ ] 1.3 按 `agent-fix-abstraction-gate` 检查实现方案，不得把具体用户原话、具体 trace、具体业务 `toolName` 或字段组合升级成通用 runtime / prompt 规则。
- [ ] 1.4 在实现前确认当前生产主链仍是 LangChain Agent Runtime + DeepSeek native `tool_calls`，不得恢复旧 `AgentAction.activitySummary`、旧 `agent-core` 或旧 stream 事件协议。

## 2. Runtime Metadata Envelope

- [ ] 2.1 新增通用 `ToolCallRuntimeMetadata` / envelope 类型，至少支持可选 `runtimeMetadata.activitySummary`，并为导出类型添加简短中文意图注释。
- [ ] 2.2 在 LangChain business tool wrapper 中统一扩展 provider-visible input schema，使所有 `executionKind = "business"` 的 tool 暴露同一 `runtimeMetadata` 字段说明。
- [ ] 2.3 在 wrapper 执行业务 schema 校验和 handler 前提取并剥离 `runtimeMetadata`，保证 handler 只收到原业务 input。
- [ ] 2.4 对 `activitySummary` 做通用安全归一化：trim、去控制字符、长度限制、拒绝明显内部实现细节；非法摘要不阻断合法业务 tool。
- [ ] 2.5 为缺失或非法摘要提供 `runtimeActivity.defaultSummary` 或通用 fallback，fallback 不得基于用户原文、关键词、正则、同义词表或具体 phrasing 生成。
- [ ] 2.6 将 activity metadata 记录到独立 runtime / UI trace metadata，确保不进入 `toModelVisibleSummary`、`toTraceSummary` 业务摘要、`toUserProjection`、visible output 或 final grounding。

## 3. Tool Catalog 与模型可见合同迁移

- [ ] 3.1 在 production tool wrapper definition 中增加统一 `runtimeActivity.defaultSummary` 或等价静态 metadata，新增业务 tool 必须自动继承相同 runtime metadata envelope。
- [ ] 3.2 从 production tool catalog / 默认可用 tools 中移除或停用独立 `reportAgentActivity`，避免模型单独调用 activity-only tool。
- [ ] 3.3 删除或迁移 `maxActivityReports` 等独立 activity report 预算配置，保留必要的摘要长度、安全投影和去重边界到集中配置。
- [ ] 3.4 更新默认 system prompt、tool description 和 schema description，说明 `runtimeMetadata.activitySummary` 是业务 tool call 的当前请求 UI 状态摘要，不是调用理由、业务事实、tool output 或最终回答依据。
- [ ] 3.5 更新模型可见合同测试或快照，证明 prompt 不再鼓励单独调用 `reportAgentActivity`，且 runtime metadata 字段说明为中文、短句、非业务流程特判。

## 4. Runtime Observer 与 `/api/chat` Stream

- [ ] 4.1 在业务 tool handler 执行前由 wrapper / runtime observer 产生 request-local activity event，事件携带已归一化 `activitySummary`、安全 stage/status/sequence 和必要诊断字段。
- [ ] 4.2 更新 `/api/chat` NDJSON adapter，将 wrapper activity event 投影为 `agent_progress.activitySummary`，并保持 `agent_loop` 只表达真实 LangChain model/tool cycle。
- [ ] 4.3 保证 `agent_progress` 写入失败只作为非致命 UI 诊断，不重试 model、不改写 provider `tool_calls`、不改变 tool handler 结果或 finalizer 收口。
- [ ] 4.4 更新 trace 导出摘要，能区分业务 tool facts、runtime activity metadata、被丢弃摘要 reason 和 stream projection 结果。

## 5. 前端活动条展示稳定性

- [ ] 5.1 调整聊天活动条 reducer / state model，将 `loopTurn` 前缀、右侧活动文案、文案动画触发状态和生命周期清理状态分离。
- [ ] 5.2 当前缀变化但右侧文案未变化时，只更新 `#N` 前缀，不重新触发滚动、逐字替换、fade-in 或重复 `aria-live` 播报。
- [ ] 5.3 当收到新的合法 `agent_progress.activitySummary` 时，保持当前合法 `#N` 前缀并更新右侧文案，允许触发一次新文案动画。
- [ ] 5.4 对重复 fallback、重复摘要、过期 sequence、`done`、`error`、abort、timeout、会话切换和新建会话保持现有清理与降级规则。

## 6. 测试与验证

- [ ] 6.1 增加 LangChain tool wrapper 单测，覆盖 metadata 提取、剥离、合法摘要投影、缺失/非法摘要 fallback、handler input 隔离和业务 schema 失败。
- [ ] 6.2 增加 production catalog 测试，证明所有 `executionKind = "business"` tool 都暴露统一 `runtimeMetadata.activitySummary`，非业务 tool 不被错误扩展。
- [ ] 6.3 增加 runtime 预算 / 连续调用测试，证明 `runtimeMetadata` 不产生额外 provider tool call、ToolMessage、graph step、activity report 预算或业务 tool 连续计数打断。
- [ ] 6.4 增加 `/api/chat` stream 测试，覆盖 handler 前 `agent_progress.activitySummary`、`agent_loop` 独立递增、非安全摘要 fallback、stream 写入失败非致命和最终响应事实隔离。
- [ ] 6.5 增加前端 activity 测试，覆盖相同文案不因 `agent_loop` 递增而重新滚动、新摘要正常更新、重复 fallback 不刷屏、生命周期清理和可访问性播报边界。
- [ ] 6.6 增加架构或文本扫描测试，证明 runtime / adapter 没有针对 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`submitVisibleTrainingProposal` 或用户 phrasing 的语义分支。
- [ ] 6.7 运行 `openspec validate add-tool-call-runtime-activity-metadata --strict`、相关 `npm test` 或定向测试，并按影响范围运行 `npm run typecheck`。
