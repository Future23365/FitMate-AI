## 1. Feedback 合同与错误分类

- [x] 1.1 新增 `AgentDecisionFeedback` 类型、稳定错误码集合和模型可见摘要结构。
- [x] 1.2 梳理现有 `invalid_json`、`invalid_decision`、`schema_validation_failed`、`invalid_dependency`、`unregistered_resource_reference`、`tool_failed` 等错误到可恢复 / 不可恢复分类，并明确 `AgentToolError.retryable` 不能单独决定是否进入 repair loop。
- [x] 1.3 将结构化 feedback 写入本轮 `AgentToolResultRecord`，确保 dependency graph 能识别其只作为错误反馈而非业务资源 producer。
- [x] 1.4 确认 runtime 只消费 tool 已返回的结构化失败、`ToolResult.satisfied`、diagnostics 和已登记资源，不在本 change 中新增或重写 tool 能力合同。
- [x] 1.5 补充单测覆盖 feedback 结构、不可恢复 hard boundary、模型可见摘要脱敏，以及同一错误码在不同上下文下的分类差异。

## 2. Runtime 修复循环

- [x] 2.1 将现有分散的 parse failure、保存前 final、保存后 final 和 tool failure 恢复逻辑收敛到统一 feedback 分支。
- [x] 2.2 覆盖 `final_result` 结构可解析但引用未登记 `revisionId` 的场景，生成推荐 `saveConversationArtifactRevision` 的 feedback。
- [x] 2.3 支持模型基于 feedback 进入下一轮并继续引用已登记 `draftId`、`validationId`、`policyDecisionId` 等资源。
- [x] 2.4 对失败 tool result 和 `satisfied=false` 的 tool result 只做登记、摘要压缩和下一轮可见性处理，不把它们登记为可消费成功资源。
- [x] 2.5 保留严格失败兜底：不可恢复错误、预算耗尽、资源事实不唯一、权限边界失败或 Policy hard boundary 必须终止。
- [x] 2.6 补充 runtime 单测，覆盖 `revision_xxx`、缺依赖、失败 tool result 转反馈、修复后保存成功和不可恢复边界。
- [x] 2.7 迁移或删除 `createRecoverablePrematureFinalResultFeedback`、保存后 generated 补齐、重复失败索引和工具依赖失败中的窄口径恢复 helper，避免新旧恢复机制并存。

## 3. Final Result 服务端收口

- [x] 3.1 调整 `final_result.generated` / `patched` 引用校验失败后的分类，区分可恢复缺失、伪造资源和不可恢复引用。
- [x] 3.2 在保存成功且资源唯一时，从写工具结果投影合法 `AgentExecutionResult.generated` / `patched`。
- [x] 3.3 保证投影字段只来自当前 run 已登记写工具结果，并继续通过 `validateFinalResultReferences`。
- [x] 3.4 补充 Response Writer / chat-service 回归测试，覆盖保存成功后模型漏字段但最终卡片正常展示。
- [x] 3.5 补充 `completed_operation` 收口：`operationResultId`、`policyDecisionId`、`confirmationId` 和可见字段必须来自当前 run 已登记写工具结果。
- [x] 3.6 补充 `patched` 投影：`patchResult` 来自 patch 工具结果，artifact / revision / validation / policy 来自保存、校验和策略结果。
- [x] 3.7 补充多候选事实无法唯一确定的失败或 feedback 测试，禁止 runtime 替模型猜测 draft、patch、save 或 operation 结果。

## 4. 预算、熔断与上下文压缩

- [x] 4.1 为 repair turn、同类 feedback 次数和总 step 建立预算配置与默认值。
- [x] 4.2 复用或扩展现有重复失败索引，对同一 `toolName + normalizedInput + failureCode` 执行熔断。
- [x] 4.3 压缩模型可见重复 feedback 摘要，保留 failure code、repeat count、first/latest tool result id 和推荐替代路径。
- [x] 4.4 补充 token/context 单测，覆盖重复 feedback 压缩、不同输入不合并和预算耗尽终止。
- [x] 4.5 在模型请求预算与 trace metadata 中记录 `repairTurnCount`、剩余 repair 预算和压缩前后 feedback 数量。

## 5. Prompt 合同与模型输入

- [x] 5.1 更新 `agent_tool_decision` prompt module，说明模型必须优先消费 `AgentDecisionFeedback` 的错误码、可用资源、缺失资源、推荐工具、推荐输入和 hard boundary。
- [x] 5.2 更新 `agent_tool_execution` prompt module，说明工具失败只能基于结构化 tool result、feedback、dependency graph 和已登记资源修复，`retryable: true` 不是盲目重试依据。
- [x] 5.3 更新 `agent_final_result` prompt module，强化 generated、patched、completed_operation 只能引用当前 run 已登记 tool result，且多候选事实不能猜测。
- [x] 5.4 补充 prompt 单测，确认 prompt 不引入关键词分流、同义词匹配、权限判断、Policy 判断或基于自由文本补造资源 id。
- [x] 5.5 补充模型输入构造测试，确认 feedback 摘要在下一轮可见且被压缩，完整 raw decision / raw payload 不进入模型上下文。
- [x] 5.6 补充 runtime 回归测试，确认 prompt 已更新时仍不会跳过 Schema、资源 producer、用户隔离、Policy、预算和 final result 引用校验。

## 6. Trace、黑盒与文档

- [x] 6.1 在 AiRunTrace 中记录 feedback code、retryable、推荐工具、关键资源、预算和熔断字段。
- [x] 6.2 更新 `/dev/ai-traces` view model 或诊断摘要，使合同修复循环、最终投影来源和熔断原因可读。
- [x] 6.3 更新手动 LLM 黑盒报告字段，至少记录 `repairFeedbackCodes`、`repairTurnCount`、`finalProjectionSourceToolResultId`、`unregisteredResourceReferences`、`fusedFailureCount` 和 `repairBudgetExhaustedReason`。
- [x] 6.4 在 `docs/方案变更历史` 新增本次方案变更记录，并按需更新 `docs/项目演变历程.md`。
- [x] 6.5 补充 trace viewer / 黑盒 fixture 测试，区分 recovered、fused、unrecoverable 和 projected 四类结果。

## 7. 验证

- [x] 7.1 运行 Agent runtime / orchestrator 相关单测，覆盖本 change 新增修复循环场景。
- [x] 7.2 运行 chat-service / Response Writer 相关测试，确认卡片投影和失败投影一致。
- [x] 7.3 运行 prompt / token-budget 相关测试，确认 prompt module 和模型可见 feedback 摘要符合本 change。
- [x] 7.4 运行 `npm run typecheck`，确认新增合同类型不会破坏服务端 / 前端类型边界。
- [x] 7.5 运行 `openspec validate harden-agent-contract-repair-loop --strict`。
- [x] 7.6 根据需要运行不触发真实模型费用的黑盒 fixture / runner 子集，验证报告能读取修复证据。
