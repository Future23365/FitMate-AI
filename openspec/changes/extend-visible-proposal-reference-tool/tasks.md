## 1. 现状审计与边界确认

- [x] 1.1 运行 `git status --short`，确认实现前工作区状态，并隔离无关改动。
- [x] 1.2 读取 `codex_logs/ai_trace_log.js` 和 `codex_logs/ai_trace_texts.jsonl`，还原本次失败中模型实际看到的 system prompt、user payload、tool manifest、observations、toolResults 和 repair feedback。
- [x] 1.3 读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 不触碰禁止模块、不新增 `/api/chat` 关键词分流、不修改 Agent runtime 主循环。
- [x] 1.4 读取 `readRecentVisibleTrainingProposal` 的 input schema、output schema、handler、policy metadata、resourceContract、model observation、user projection、trace summary 和现有 tests，确认重命名为 `inspectVisibleTrainingProposals` 的完整产生方和消费方。
- [x] 1.5 读取 `searchExerciseResources` 的 manifest、schema description、examples、model observation 和 tests，确认只需要收紧职责说明，不把引用事实查询塞进动作查询 tool。
- [x] 1.6 读取 `VisibleOutputEnvelopeSchema`、`FinalAnswerActionSchema`、terminal output validator、repair feedback 和 prompt config，确认 `visibleOutputs[].schemaVersion` 的真实服务端合同和模型可见表达差异。
- [x] 1.7 列出至少两个与“换一批”同类的省略 / 指代 / 上下文断裂表达，作为测试类别样例，避免只修单句 phrasing。

## 2. 重命名并扩展 `inspectVisibleTrainingProposals` 合同

- [x] 2.1 将 `readRecentVisibleTrainingProposal` delete-only 重命名为 `inspectVisibleTrainingProposals`，同步 tool bundle、registry、manifest、schema summary、examples、observations、trace/replay、fixtures 和 tests，不保留旧 toolName alias。
- [x] 2.2 将 `inspectVisibleTrainingProposals` input schema 调整为显式 `operation = "list_recent" | "read_recent"`，并用 discriminated union 或等价强类型结构区分两个 operation 的字段。
- [x] 2.3 实现 `list_recent`：查询当前 actor 和当前 conversation 可访问的最近 `visibleTrainingProposal` 事实索引，使用服务端固定上限，不暴露分页参数给模型。
- [x] 2.4 `list_recent` 输出 `status = "succeeded"`、`operation = "list_recent"` 和 `facts[]`，每个 fact 摘要包含 `factRef`、`messageId`、`proposalKind`、`status`、`visibleOutputSchemaVersion`、`factSchemaVersion`、section 摘要和可复用训练动作数量。
- [x] 2.5 确保 `list_recent` 不返回完整 payload、完整 prescription、完整 schedule、完整 handler output、未展示候选或跨用户数据。
- [x] 2.6 确保 `list_recent` 空结果是成功事实查询，能支撑 `final_answer` / `ask_user` 解释或澄清，但不产出 consumable resource，不支撑训练方案生成。
- [x] 2.7 调整 `read_recent`：只接受当前 run 可见的真实 `factRef` 或 `messageId`，校验 actor、conversation、status、kind、schemaVersion 和 payload 后再返回成功。
- [x] 2.8 `read_recent` 成功后登记当前 run 的 `visible_training_proposal_fact` consumable resource，并在 observation 中说明该事实已导入当前 run，后续不要重复读取同一引用。
- [x] 2.9 `read_recent` / `list_recent` 的不存在、跨用户、跨会话、状态不可读、schemaVersion 不兼容、payload 无效、不唯一和 store 异常必须返回结构化失败 output，不退化为通用 `handler_error`。
- [x] 2.10 更新 tool 的业务意图注释，说明该 tool 是当前会话可见训练方案事实的只读 inspect 入口，通过 `list_recent` / `read_recent` 查询事实，不做语义分流。

## 3. 模型可见合同与 projection

- [x] 3.1 更新 `inspectVisibleTrainingProposals` 的 `description`、`whenToUse`、`whenNotToUse`、schema description 和 examples，使用中文说明 `list_recent` / `read_recent` 的使用条件和边界。
- [x] 3.2 examples 先展示 `operation = "list_recent"`，再展示从 `list_recent` result 复制真实引用执行 `operation = "read_recent"`；不得包含可被照抄的占位 `factRef`。
- [x] 3.3 更新 `list_recent` / `read_recent` 的 `toModelObservation` 和 compressed tool result 摘要，确保 `list_recent` 只投影轻量索引，`read_recent` 才投影已导入当前 run 的可消费事实摘要。
- [x] 3.4 在模型可见说明中表达：省略表达、指代不明或上下文引用场景由模型基于上下文和 tool result 自主判断，不写“换一批”“再来一组”“不要这个”等固定短语强制 tool 调用规则。
- [x] 3.5 更新 `searchExerciseResources` manifest，使其说明当前会话是否存在可引用 `visibleTrainingProposal` 应通过 `inspectVisibleTrainingProposals(operation = "list_recent")` 查询，复用具体方案应通过 `operation = "read_recent"` 导入。
- [x] 3.6 确保 `searchExerciseResources` 输出不包含 `factRef`、`messageId`、完整 `visibleTrainingProposal.payload` 或当前会话事实列表。
- [x] 3.7 确保所有新增或修改的模型可见描述性自然语言默认使用中文，`toolName`、字段名、枚举值、resource type、schema id 保持英文原样。

## 4. `schemaVersion` 字符串合同修复

- [x] 4.1 更新 Agent system prompt，使 `visibleTrainingProposal` 的 visible output 示例和说明统一使用 `schemaVersion = "1"`。
- [x] 4.2 更新 schema summary、examples、repair feedback、observations 和 compressed tool results，避免把 `visibleOutputs[].schemaVersion` 表达成数字 `1`。
- [x] 4.3 在 `inspectVisibleTrainingProposals` 的模型可见摘要中区分 `visibleOutputSchemaVersion = "1"` 和 `factSchemaVersion = 1`，避免模型把内部事实版本复制到 visible output envelope。
- [x] 4.4 保持 `VisibleOutputEnvelopeSchema` 对 `schemaVersion` 的字符串校验，不新增数字兼容层或自动转换层。
- [x] 4.5 更新结构化 repair feedback，使 `visibleOutputs[].schemaVersion` 为数字 `1` 时明确提示模型改为字符串 `"1"`。

## 5. Tool 与 runtime 回归测试

- [x] 5.1 新增或更新 `tests/agent-tools/inspect-visible-training-proposals.test.ts`，直接覆盖 `list_recent` 成功、`list_recent` 空结果、`list_recent` 权限隔离、`read_recent` 成功、`read_recent` 无效引用、`read_recent` 跨用户、`read_recent` 跨会话、schemaVersion 不兼容、payload 无效和 store 异常结构化归一。
- [x] 5.2 覆盖 `list_recent` 不产出 consumable resource，`read_recent` 成功才产出 `visible_training_proposal_fact` consumable resource。
- [x] 5.3 覆盖 `read_recent` 成功 observation 说明“已导入当前 run，不要重复读取同一引用”。
- [x] 5.4 覆盖 `inspectVisibleTrainingProposals` manifest 包含 `operation = "list_recent"` 和 `operation = "read_recent"` 的中文说明，不包含 `readRecentVisibleTrainingProposal`、可复制占位 `factRef`，且不把固定自然语言短语表达成强制调用条件。
- [x] 5.5 更新 `tests/agent-core/tool-registry-manifest.test.ts`，覆盖 `list_recent` / `read_recent` schema、中文模型可见说明、`searchExerciseResources` 职责边界和 schemaVersion 字符串说明，并断言 production manifest 不再注册旧 `readRecentVisibleTrainingProposal`。
- [x] 5.6 更新 `tests/agent-core/agent-llm-prompt-config.test.ts`，覆盖 prompt 中 `visibleOutputs[].schemaVersion` 使用字符串 `"1"`，且不出现引导模型输出数字版本的说明。
- [x] 5.7 更新 `tests/agent-core/planner-validator.test.ts` 或 terminal output validator tests，覆盖 `schemaVersion: 1` 被拒绝并产生明确 repair feedback，`schemaVersion: "1"` 可继续进入业务 validator。
- [x] 5.8 更新 `tests/chat-service.test.ts` 或等价生产聊天 replay tests，覆盖无可见训练方案时省略 / 指代表达可以 `list_recent` 后合法收口。
- [x] 5.9 更新 `tests/chat-service.test.ts` 或等价生产聊天 replay tests，覆盖有 `visibleTrainingProposal` 时模型可 `list_recent` / `read_recent` 后再选择是否调用 `searchExerciseResources`。
- [x] 5.10 更新 `tests/chat-service.test.ts` 或等价生产聊天 replay tests，覆盖用户明确提出新动作查询目标时仍可直接调用 `searchExerciseResources`，不被强制先 `list_recent`。
- [x] 5.11 更新 `tests/agent-core/architecture-boundary.test.ts`，证明 `/api/chat`、agent-core、handler 和 renderer 没有新增关键词、正则、同义词表、固定短语路由或业务 `toolName` 特判。

## 6. 验证与文档收口

- [x] 6.1 运行 `npm test -- tests/agent-tools/inspect-visible-training-proposals.test.ts`。
- [x] 6.2 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 6.3 运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts`。
- [x] 6.4 运行 `npm test -- tests/agent-core/planner-validator.test.ts` 或对应 terminal output validator 测试。
- [x] 6.5 运行与 production chat replay 相关的最窄测试，例如 `npm test -- tests/chat-service.test.ts`。
- [x] 6.6 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`。
- [x] 6.7 修改 TypeScript、schema、AI 编排或共享业务逻辑后运行 `npm run typecheck`。
- [x] 6.8 如果实现改变核心链路或架构边界，按项目规则在 `docs/方案变更历史/` 新增方案变更记录，并在 `docs/项目演变历程.md` 追加摘要。
- [x] 6.9 运行 `openspec validate extend-visible-proposal-reference-tool --strict`。
- [x] 6.10 最终检查 diff，确认未混入无关代码、未新增独立 list tool、未新增服务端语义分流、未放宽数字 `schemaVersion` 兼容，且旧 `readRecentVisibleTrainingProposal` 只出现在迁移说明或删除断言中。
