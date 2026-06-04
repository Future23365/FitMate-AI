## 1. 范围确认与现状复现

- [ ] 1.1 读取 `codex_logs/ai_trace_log.js` 和当前 model input，确认 `visibleTrainingProposal` 来源耦合在真实链路中的表现和影响。
- [ ] 1.2 复核 `visible-training-proposal-validator.ts`、`visible-training-proposal-renderer.ts`、`visible-training-proposal-fact-store.ts` 和 `agent-llm-prompt-config.ts` 中所有 `searchExerciseResources` / `inspectVisibleTrainingProposals` / `visible_training_proposal_fact` 来源规则。
- [ ] 1.3 明确 implementation 采用 async terminal output validator 还是生产装配层 final output validation service，并在实现前记录取舍。

## 2. 数据库动作事实校验

- [ ] 2.1 新增或调整服务端只读动作事实校验服务，按最终 `visibleTrainingProposal.exerciseItems[*].exerciseId` 批量读取数据库。
- [ ] 2.2 校验动作存在、`isPublished = true`、`allowedSections` 覆盖输出 `section`，并返回有限 canonical 动作摘要。
- [ ] 2.3 覆盖数据库未配置、动作不存在、动作未发布、section 不合法、重复 `exerciseId` 和正常批量成功路径的结构化错误。
- [ ] 2.4 确保校验服务不读取用户自然语言原文，不使用关键词、正则、同义词表或短句模板。

## 3. 终态输出校验解耦

- [ ] 3.1 调整 `visibleTrainingProposal` validator，删除基于具体 `toolResult.toolName` 收集合法动作来源的分支。
- [ ] 3.2 让 `visibleTrainingProposal` validator 使用数据库事实校验服务或其注入上下文完成动作来源校验。
- [ ] 3.3 更新错误信息，删除“必须来自 satisfied searchExerciseResources 或 visible_training_proposal_fact”这类具体 tool 绑定文案。
- [ ] 3.4 保留 payload schema 对 `kind`、`exerciseItems`、`prescription`、`schedule` 和 `section` 的结构校验。
- [ ] 3.5 确保校验失败时不会进入 Response Renderer、fact bridge 或聊天历史结构化输出保存。

## 4. Renderer 与事实桥详情来源

- [ ] 4.1 调整 `visibleTrainingProposal` renderer，使用已校验 canonical 动作摘要或同一数据库事实服务补齐卡片详情。
- [ ] 4.2 删除 renderer 中基于 `searchExerciseResources` / `inspectVisibleTrainingProposals` tool result 输出形态收集展示详情的分支。
- [ ] 4.3 调整 `visible_training_proposal_fact` 保存 / 读取流程，确保历史事实复用前仍会复核当前数据库动作状态。
- [ ] 4.4 确认 trace / user projection 只输出有限摘要，不泄漏完整数据库对象、内部 service 对象或跨用户 payload。

## 5. 模型可见合同同步

- [ ] 5.1 使用 `agent-prompt-contract-governance` 检查本次模型实际可见 input，包括 system prompt、tool manifest、schema summary、examples、observations 和 compressed tool results。
- [ ] 5.2 更新 `agent-llm-prompt-config.ts` 中 `visibleTrainingProposal.exerciseItems[*].exerciseId` 的来源说明，避免继续声明只能来自 satisfied `searchExerciseResources` 或 `visible_training_proposal_fact`。
- [ ] 5.3 如调整 tool manifest、schema description、examples 或 observation，确保描述性自然语言使用中文，`toolName`、字段名、枚举值和 resource type 保持英文原样。
- [ ] 5.4 补充或更新 prompt / model input 相关测试，证明模型可见合同不再引导模型把最终训练方案合法性绑定到具体 toolName。

## 6. 测试与架构扫描

- [ ] 6.1 更新 `tests/visible-training-proposal-validator.test.ts`，覆盖数据库校验成功、动作不存在、未发布、section 不合法，以及无需 `searchExerciseResources` tool result 也可校验合法数据库动作。
- [ ] 6.2 更新 renderer / fact bridge 测试，证明卡片详情来自数据库校验摘要而不是具体 tool result。
- [ ] 6.3 更新 `tests/agent-core/architecture-boundary.test.ts`，扫描 `visible-training-proposal-validator.ts`、renderer 和 terminal output core 中不得出现具体业务 toolName 白名单。
- [ ] 6.4 更新 `tests/chat-service.test.ts` 或等价生产聊天测试，覆盖 `final_answer.visibleOutputs[]` 在渲染前完成数据库动作事实校验。
- [ ] 6.5 如修改 terminal output validator 接口或 action validation 流程，补充 `tests/agent-core/contract-helper.test.ts` 或对应 runtime safety tests。

## 7. 文档与验证

- [ ] 7.1 运行 `openspec validate decouple-visible-training-proposal-validation --strict`。
- [ ] 7.2 运行 `npm test -- tests/visible-training-proposal-validator.test.ts`。
- [ ] 7.3 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`。
- [ ] 7.4 按实际触碰范围运行 renderer、chat-service、contract-helper 或 runtime safety 相关测试。
- [ ] 7.5 修改 TypeScript、Schema、AI 编排或共享业务逻辑后运行 `npm run typecheck`。
- [ ] 7.6 如果实现改动属于核心链路调整，在 `docs/方案变更历史/` 新增上海时间文档，并在 `docs/项目演变历程.md` 末尾追加简要记录。
- [ ] 7.7 完成实现后检查最终 diff，确认没有修改 `/api/chat` 业务关键词分流、没有新增服务端自然语言语义判断、没有无关重构。
