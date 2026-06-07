## 1. 治理与范围确认

- [ ] 1.1 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁审查，确认没有把具体 trace、用户短句、`toolName` 或字段组合升格为通用生产规则。
- [ ] 1.2 使用 `agent-tool-change-governance` 确认本 change 属于已有 Agent tool 合同调整和 terminal output validator 行为调整，不修改 orchestrator 主循环、`PlannerPort`、Executor 主流程、`Policy Guard`、`Resource Contract Validator`、`Response Renderer` 或 `/api/chat` 语义路由。
- [ ] 1.3 使用 `agent-prompt-contract-governance` 检查模型实际可见输入入口，确认 output contract、tool manifest、schema summary、examples、repair feedback 和 observations 的修改层级正确。
- [ ] 1.4 开始实现前运行 `git status --short`，确认无关改动不混入本 change。

## 2. visibleTrainingProposal validator 调整

- [ ] 2.1 更新 `tests/visible-training-proposal-validator.test.ts`，将“数据库动作存在且 section 合法但缺少当前 run 来源”从拒绝用例改为通过用例，并断言保留 provenance diagnostic 或 metadata。
- [ ] 2.2 更新 `lib/server/visible-training-proposals/visible-training-proposal-validator.ts`，移除 `validateCurrentRunExerciseSources` 对新生成训练卡片的 hard fail，改为 non-blocking diagnostic。
- [ ] 2.3 保留数据库 hard 校验：`exerciseId` 存在、发布态/可展示、当前用户可访问、`allowedSections` 覆盖、payload schema、`prescription` 和 `schedule` 自洽。
- [ ] 2.4 更新 terminal output validation metadata / trace summary，使缺少当前 run 来源可以被诊断，但不会触发 `terminal_reference_invalid` 或 terminal failure finalizer。
- [ ] 2.5 覆盖历史方案复用场景，确认历史事实再次输出时仍通过当前数据库动作事实校验，不因历史曾展示过绕过发布态和 section 校验。

## 3. inspectVisibleTrainingProposals 单步历史事实读取

- [ ] 3.1 更新 `tests/agent-tools/inspect-visible-training-proposals.test.ts`，先写失败/成功回归：`list_recent` 一次返回可消费历史方案事实并登记 `visible_training_proposal_fact` resource。
- [ ] 3.2 修改 `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts` 的 input schema，删除模型可见 `operation = "read_recent"`、`ref`、顶层 `factRef` 和顶层 `messageId` 输入分支。
- [ ] 3.3 调整 handler：`list_recent` 从当前 actor 和当前 conversation 读取历史已展示 `visibleTrainingProposal`，完成权限、status、kind、schemaVersion 和 payload 校验，并返回受控压缩事实。
- [ ] 3.4 调整 `toResources` / fulfillment：`list_recent` 成功时登记当前 run 可消费 `visible_training_proposal_fact` resource；空结果、无效事实或失败结果不得登记 consumable resource。
- [ ] 3.5 调整 `toModelObservation`、`toUserProjection` 和 trace projection，表达 `list_recent` 已导入历史事实、可用于复用/派生/替换/保留，但不代表已生成最终新方案。
- [ ] 3.6 用集中配置控制 `list_recent` 返回数量和压缩字段范围，避免在 tool handler 或业务文件中散落新的 `MAX_*`、`DEFAULT_*` 或 `LIMIT_*`。

## 4. 模型可见合同与 repair 同步

- [ ] 4.1 更新 `lib/server/config/agent-visible-output-contracts.ts`，移除“新卡片动作必须来自当前 run 可消费动作事实”的强规则，改为数据库事实 hard 校验 + current-run provenance diagnostic。
- [ ] 4.2 更新 `inspectVisibleTrainingProposals` 的 `description`、`whenToUse`、`whenNotToUse`、schema description 和 examples，删除 `read_recent` 规划说明和可复制 ref 相关指引。
- [ ] 4.3 更新 schema summary、manifest 快照或等价测试，确保模型可见内容不再包含 `operation = "read_recent"`、`read_recent.ref.value` 或“先 list 再 read”的固定流程。
- [ ] 4.4 更新 repair feedback / invalid action observation，移除要求模型通过 `read_recent` 或当前 run 动作来源修复新卡片的旧恢复路径。
- [ ] 4.5 确认通用 Agent prompt 不新增业务 `visibleTrainingProposal` / `inspectVisibleTrainingProposals` 语义特判，业务名只出现在 output contract、tool manifest、observation、resource contract 或测试样例中。

## 5. 回归测试与验证

- [ ] 5.1 运行 `npm test -- tests/visible-training-proposal-validator.test.ts`。
- [ ] 5.2 运行 `npm test -- tests/agent-tools/inspect-visible-training-proposals.test.ts`。
- [ ] 5.3 运行与生产聊天链路相关的窄测试，例如 `npm test -- tests/chat-service.test.ts`，覆盖新生成卡片 DB-only 通过、历史方案 `list_recent` 单步导入、无历史方案合法收口。
- [ ] 5.4 如修改 registry、manifest、schema summary 或 examples，运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [ ] 5.5 如修改 Agent runtime grounding、terminal validation 或 shared contracts，运行 `npm test -- tests/agent-core/planner-validator.test.ts` 和 `npm test -- tests/agent-core/architecture-boundary.test.ts`。
- [ ] 5.6 运行 `npm run typecheck`。
- [ ] 5.7 运行 `openspec validate relax-visible-proposal-grounding-and-inline-recent-facts --strict`。

## 6. 文档与最终检查

- [ ] 6.1 如实现阶段改变核心链路或实现逻辑，在 `docs/方案变更历史/` 新增一份上海时间精确到秒的方案变更记录。
- [ ] 6.2 如实现阶段影响后续开发的重要边界，在 `docs/项目演变历程.md` 末尾追加简要记录。
- [ ] 6.3 用 `rg` 检查生产模型可见合同中是否仍残留过时的 `read_recent` 强流程、`read_recent.ref.value` 恢复路径或“新卡片动作必须来自当前 run 来源”的 hard fail 表述。
- [ ] 6.4 最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
