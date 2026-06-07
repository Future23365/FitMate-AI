## 1. 治理与范围确认

- [ ] 1.1 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁审查，确认没有把具体 trace、用户短句、`toolName` 或字段组合升格为通用生产规则。
- [ ] 1.2 使用 `agent-tool-change-governance` 确认本 change 已升级为 Agent core contract、已有 tool 合同、terminal output validator 和模型可见合同联合调整；不新增业务 tool、不修改 `/api/chat` 语义路由、不新增服务端自然语言分流。
- [ ] 1.3 使用 `agent-prompt-contract-governance` 检查模型实际可见输入入口，确认 action contract、output contract、tool manifest、schema summary、examples、repair feedback、observations 和 compressed tool results 不再要求模型操作内部引用 ID。
- [ ] 1.4 开始实现前运行 `git status --short`，确认无关改动不混入本 change。

## 2. Planner 可见 AgentAction 合同重构

- [ ] 2.1 更新 `tests/agent-core/planner-validator.test.ts` 或等价 core contract 测试，先写回归：`final_answer` / `ask_user` 不带 `usedRefs` 时不因已有 tool result 被拒绝，合法 `visibleOutputs[]` 仍由 terminal output validator 校验。
- [ ] 2.2 更新 `lib/server/agent-core/contracts.ts`，从 Planner 可见 `final_answer` / `ask_user` schema 中移除 `usedRefs`，从 Planner 可见 `tool_call` schema 中移除模型手写 `consumes` 或等价 resource 引用字段。
- [ ] 2.3 更新 `lib/server/agent-core/action-validator.ts`，移除“tool 执行后成功 `final_answer` 必须包含 current-run `usedRefs`”的模型输出要求；保留 toolName、tool input schema、visible output validator、policy 和 resource 内部边界。
- [ ] 2.4 如 runtime 仍需要消费资源，改为服务端内部通过 tool handler、ResourceStore 或受控业务上下文选择，不让 Planner 在 tool input 外手写 `resourceId` / `consumes`。
- [ ] 2.5 更新 `lib/server/agent-core/runtime.ts`、`observation.ts` 和 trace summary，使 terminal provenance 由服务端记录为内部字段，例如 `serverProvenance` 或 `internalGrounding`，不回写到模型 action。
- [ ] 2.6 更新 `tests/agent-core/runtime-hardening.test.ts`、`executor-runtime-renderer.test.ts`、`m1-runtime-e2e.test.ts` 或等价 runtime 测试，覆盖普通文本、`ask_user`、结构化 `visibleOutputs[]` 和 failure finalizer 的 server-owned provenance。

## 3. visibleTrainingProposal validator 调整

- [ ] 3.1 更新 `tests/visible-training-proposal-validator.test.ts`，将“数据库动作存在且 section 合法但缺少当前 run 来源”从拒绝用例改为通过用例，并断言保留 provenance diagnostic 或 metadata。
- [ ] 3.2 更新 `lib/server/visible-training-proposals/visible-training-proposal-validator.ts`，移除 `validateCurrentRunExerciseSources` 对新生成训练卡片的 hard fail，改为 non-blocking diagnostic。
- [ ] 3.3 保留数据库 hard 校验：`exerciseId` 存在、发布态/可展示、当前用户可访问、`allowedSections` 覆盖、payload schema、`prescription` 和 `schedule` 自洽。
- [ ] 3.4 更新 terminal output validation metadata / trace summary，使缺少当前 run 来源可以被诊断，但不会触发 `terminal_reference_invalid` 或 terminal failure finalizer。
- [ ] 3.5 覆盖历史方案复用场景，确认历史事实再次输出时仍通过当前数据库动作事实校验，不因历史曾展示过绕过发布态和 section 校验。

## 4. inspectVisibleTrainingProposals 单步历史事实读取

- [ ] 4.1 更新 `tests/agent-tools/inspect-visible-training-proposals.test.ts`，先写失败/成功回归：`list_recent` 一次返回可消费历史方案业务事实并由服务端内部登记 `visible_training_proposal_fact` resource。
- [ ] 4.2 修改 `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts` 的 input schema，删除模型可见 `operation = "read_recent"`、`ref`、顶层 `factRef`、顶层 `messageId`、`resourceId`、`toolResultId` 和其他内部引用输入分支。
- [ ] 4.3 调整 handler：`list_recent` 从当前 actor 和当前 conversation 读取历史已展示 `visibleTrainingProposal`，完成权限、status、kind、schemaVersion 和 payload 校验，并返回受控压缩业务事实。
- [ ] 4.4 调整 output / model observation：返回事实使用业务字段和用户可理解顺序，例如 `index` / `displayLabel`；模型可见结果不得暴露可复制 `factRef`、`messageId`、`resourceId` 或 `toolResultId`。
- [ ] 4.5 调整 `toResources` / fulfillment：`list_recent` 成功时由服务端内部登记当前 run 可消费 `visible_training_proposal_fact` resource；空结果、无效事实或失败结果不得登记 consumable resource。
- [ ] 4.6 调整 `toUserProjection` 和 trace projection，表达 `list_recent` 已读取历史业务事实、可用于复用/派生/替换/保留，但不代表已生成最终新方案。
- [ ] 4.7 用集中配置控制 `list_recent` 返回数量和压缩字段范围，避免在 tool handler 或业务文件中散落新的 `MAX_*`、`DEFAULT_*` 或 `LIMIT_*`。

## 5. 模型可见合同与 repair 同步

- [ ] 5.1 更新 `lib/server/config/agent-llm-prompt-config.ts` 和 action contract builder，移除 `usedRefs`、`resourceId`、`toolResultId`、`factRef`、`messageId` 作为模型输出或修复字段的说明。
- [ ] 5.2 更新 `lib/server/config/agent-visible-output-contracts.ts`，移除“新卡片动作必须来自当前 run 可消费动作事实”的强规则，改为数据库事实 hard 校验 + current-run provenance diagnostic。
- [ ] 5.3 更新 `inspectVisibleTrainingProposals` 的 `description`、`whenToUse`、`whenNotToUse`、schema description 和 examples，删除 `read_recent` 规划说明和可复制 ref 相关指引。
- [ ] 5.4 更新 schema summary、manifest 快照或等价测试，确保模型可见内容不再包含 `operation = "read_recent"`、`read_recent.ref.value`、`usedRefs` 输出要求、`resourceId` / `toolResultId` / `factRef` / `messageId` 复制说明，或“先 list 再 read”的固定流程。
- [ ] 5.5 更新 repair feedback / invalid action observation，遇到旧 `usedRefs`、`usedToolResultIds`、`usedResourceRefs`、`resourceId`、`toolResultId`、`factRef` 或 `messageId` 字段时，引导模型删除旧字段或改用业务结构，而不是补正确内部 ID。
- [ ] 5.6 更新 `lib/server/chat/terminal-failure-finalizer.ts` 的 failure summary / blocked outputs 投影，避免 finalizer prompt 要求模型输出或理解主 Agent 内部引用 ID。
- [ ] 5.7 确认通用 Agent prompt 不新增业务 `visibleTrainingProposal` / `inspectVisibleTrainingProposals` 语义特判，业务名只出现在 output contract、tool manifest、observation、resource contract 或测试样例中。

## 6. 回归测试与验证

- [ ] 6.1 运行 `npm test -- tests/agent-core/planner-validator.test.ts`。
- [ ] 6.2 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [ ] 6.3 运行 `npm test -- tests/visible-training-proposal-validator.test.ts`。
- [ ] 6.4 运行 `npm test -- tests/agent-tools/inspect-visible-training-proposals.test.ts`。
- [ ] 6.5 运行与生产聊天链路相关的窄测试，例如 `npm test -- tests/chat-service.test.ts`，覆盖不带 `usedRefs` 的普通回答、新生成卡片 DB-only 通过、历史方案 `list_recent` 单步导入、无历史方案合法收口。
- [ ] 6.6 如修改 runtime、ResourceStore、trace、response rendering 或 shared contracts，运行 `npm test -- tests/agent-core/architecture-boundary.test.ts` 和相关 runtime safety tests。
- [ ] 6.7 运行 `npm run typecheck`。
- [ ] 6.8 运行 `openspec validate relax-visible-proposal-grounding-and-inline-recent-facts --strict`。

## 7. 文档与最终检查

- [ ] 7.1 如实现阶段改变核心链路或实现逻辑，在 `docs/方案变更历史/` 新增一份上海时间精确到秒的方案变更记录。
- [ ] 7.2 如实现阶段影响后续开发的重要边界，在 `docs/项目演变历程.md` 末尾追加简要记录。
- [ ] 7.3 用 `rg` 检查生产模型可见合同中是否仍残留过时的 `read_recent` 强流程、`read_recent.ref.value` 恢复路径或“新卡片动作必须来自当前 run 来源”的 hard fail 表述。
- [ ] 7.4 用 `rg` 检查生产模型可见合同中是否仍要求模型输出或修复 `usedRefs`、`usedToolResultIds`、`usedResourceRefs`、`resourceId`、`toolResultId`、`factRef` 或 `messageId`。
- [ ] 7.5 最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
