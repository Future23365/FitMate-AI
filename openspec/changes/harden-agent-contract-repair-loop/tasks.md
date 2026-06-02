## 1. Feedback 合同与错误分类

- [ ] 1.1 新增 `AgentDecisionFeedback` 类型、稳定错误码集合和模型可见摘要结构。
- [ ] 1.2 梳理现有 `invalid_json`、`invalid_decision`、`schema_validation_failed`、`invalid_dependency`、`unregistered_resource_reference`、`tool_failed` 等错误到可恢复 / 不可恢复分类。
- [ ] 1.3 将结构化 feedback 写入本轮 `AgentToolResultRecord`，确保 dependency graph 能识别其只作为错误反馈而非业务资源 producer。
- [ ] 1.4 补充单测覆盖 feedback 结构、不可恢复 hard boundary 和模型可见摘要脱敏。

## 2. 工具元数据与依赖图

- [ ] 2.1 扩展 Agent tool definition，支持声明 `requires`、`produces`、`recoverableFailures` 和推荐修复路径。
- [ ] 2.2 为核心读工具、`generateRoutineDraft`、`validateRoutineDraft`、`evaluatePolicy`、`saveConversationArtifactRevision` 和 plan / patch 对应工具补齐元数据。
- [ ] 2.3 在工具执行前校验声明依赖，缺失可恢复依赖时返回 feedback，不再让底层工具处理明显不可执行输入。
- [ ] 2.4 补充 registry / runtime 单测，覆盖资源 producer 登记、缺失依赖 feedback 和不可恢复依赖失败。

## 3. Runtime 修复循环

- [ ] 3.1 将现有分散的 parse failure、保存前 final、保存后 final 和 tool failure 恢复逻辑收敛到统一 feedback 分支。
- [ ] 3.2 覆盖 `final_result` 结构可解析但引用未登记 `revisionId` 的场景，生成推荐 `saveConversationArtifactRevision` 的 feedback。
- [ ] 3.3 支持模型基于 feedback 进入下一轮并继续引用已登记 `draftId`、`validationId`、`policyDecisionId` 等资源。
- [ ] 3.4 保留严格失败兜底：不可恢复错误、预算耗尽、资源事实不唯一或权限边界失败必须终止。
- [ ] 3.5 补充 runtime 单测，覆盖 `revision_xxx`、缺依赖、修复后保存成功和不可恢复边界。

## 4. Final Result 服务端收口

- [ ] 4.1 调整 `final_result.generated` / `patched` 引用校验失败后的分类，区分可恢复缺失、伪造资源和不可恢复引用。
- [ ] 4.2 在保存成功且资源唯一时，从写工具结果投影合法 `AgentExecutionResult.generated` / `patched`。
- [ ] 4.3 保证投影字段只来自当前 run 已登记写工具结果，并继续通过 `validateFinalResultReferences`。
- [ ] 4.4 补充 Response Writer / chat-service 回归测试，覆盖保存成功后模型漏字段但最终卡片正常展示。

## 5. 预算、熔断与上下文压缩

- [ ] 5.1 为 repair turn、同类 feedback 次数和总 step 建立预算配置与默认值。
- [ ] 5.2 复用或扩展现有重复失败索引，对同一 `toolName + normalizedInput + failureCode` 执行熔断。
- [ ] 5.3 压缩模型可见重复 feedback 摘要，保留 failure code、repeat count、first/latest tool result id 和推荐替代路径。
- [ ] 5.4 补充 token/context 单测，覆盖重复 feedback 压缩、不同输入不合并和预算耗尽终止。

## 6. Trace、黑盒与文档

- [ ] 6.1 在 AiRunTrace 中记录 feedback code、retryable、推荐工具、关键资源、预算和熔断字段。
- [ ] 6.2 更新 `/dev/ai-traces` view model 或诊断摘要，使合同修复循环、最终投影来源和熔断原因可读。
- [ ] 6.3 更新手动 LLM 黑盒报告字段，记录 repair feedback、final result projection、revisionId producer 和重复失败熔断。
- [ ] 6.4 在 `docs/方案变更历史` 新增本次方案变更记录，并按需更新 `docs/项目演变历程.md`。

## 7. 验证

- [ ] 7.1 运行 Agent runtime / orchestrator 相关单测，覆盖本 change 新增修复循环场景。
- [ ] 7.2 运行 chat-service / Response Writer 相关测试，确认卡片投影和失败投影一致。
- [ ] 7.3 运行 `npm run typecheck`，确认新增合同类型不会破坏服务端 / 前端类型边界。
- [ ] 7.4 运行 `openspec validate harden-agent-contract-repair-loop --strict`。
- [ ] 7.5 根据需要运行不触发真实模型费用的黑盒 fixture / runner 子集，验证报告能读取修复证据。
