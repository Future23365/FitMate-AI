## 1. Runner 真实性改造

- [ ] 1.1 梳理当前 `manual-tests/llm/blackbox-runner.ts`、`app/api/chat/route.ts`、`features/chat/api/chat-client.ts` 和会话保存链路，确认详细 runner 与真实首页请求的差异。
- [ ] 1.2 为完整/详细套件新增或重构 HTTP/API 形态 runner，每轮按真实首页字段发送 `conversationId`、`responseMessageId`、`latestUserMessage`、`conversationSummary` 和 `thinkingEnabled`。
- [ ] 1.3 在 runner 中消费 `/api/chat` NDJSON stream，汇总 assistant 可见文本、卡片事件、conversation summary、traceId、responseMessageId 和 token usage。
- [ ] 1.4 为测试会话使用可识别的 `manual-llm-*` conversationId 或测试用户标识，确保报告能定位测试数据。

## 2. 会话保存与 artifact 链路

- [ ] 2.1 在每个成功轮次后保存用户消息、assistant 消息、conversation summary、conversation context 和可见卡片 payload。
- [ ] 2.2 确认保存链路会写入 `ConversationArtifact` 和 `ArtifactIndex`，并在报告中记录每轮是否产生可引用 artifact。
- [ ] 2.3 移除或降低详细套件对手工伪造 `recentArtifactSummaries` 的依赖，让后续轮次通过真实数据库 artifact summary 继续。
- [ ] 2.4 为“第一个动作怎么做”“把它变成训练”“第二天太累了”等引用类流程记录 artifact summary、payload 读取和 reference resolution 诊断摘要。

## 3. 分级断言与报告结构

- [ ] 3.1 扩展 fixture expectation 类型，支持卡片类型断言、语义目标断言、引用断言、禁用关键词、必含关键词、artifact payload 可读性和失败分级。
- [ ] 3.2 扩展 `assertions.ts`，将非空回复、内部字段泄漏和卡片类型保留为基础断言，并新增引用成功、动作讲解成功、条件覆盖、排除动作和安全边界断言。
- [ ] 3.3 将“没有安全读取到对应的动作详情”这类引用失败回复判定为语义断言失败，而不是仅因无训练卡片而通过。
- [ ] 3.4 更新报告生成逻辑，分别输出卡片类型断言状态、语义断言状态、最终状态、失败等级和失败原因。
- [ ] 3.5 报告补充运行命令、套件名、runner 类型、生成时间、模型、真实/跳过状态和最近一次运行语义。

## 4. 完整 fixture 覆盖补齐

- [ ] 4.1 对照 `LLM完整测试.md` 和当前 `detailedBlackboxFlowCases`，列出已覆盖、缺失和暂不自动化的用例矩阵。
- [ ] 4.2 补齐计划和上下文缺口：`P04`、`P07`、`C03`、`C05`、`C06`、`C08`。
- [ ] 4.3 补齐引用修改缺口：`M03`、`M04`、`M05`、`M07`、`M08`。
- [ ] 4.4 补齐安全和异常缺口：`S03`、`S05`、`S06`、`Q04`。
- [ ] 4.5 更新 `docs/manual-llm-consistency-tests.md`，说明基础套件、完整/详细套件、未自动化人工验收项和新增语义断言边界。

## 5. token 预估校准

- [ ] 5.1 读取最近基础报告和详细报告中的真实 `prompt_tokens`、`completion_tokens`、`total_tokens`，定义可解释的预估口径。
- [ ] 5.2 更新 `scripts/run-manual-llm-tests.mjs`，让基础和详细套件的 token 预估基于 fixture 数量与最近真实运行结果校准。
- [ ] 5.3 在报告中记录预计 token、真实 token、偏差摘要和是否因缺 key 跳过真实模型。

## 6. 自动化验证

- [ ] 6.1 增加不调用真实模型的本地测试，覆盖 suite 选择、报告路径、失败跳过、fixture 覆盖矩阵和分级断言策略。
- [ ] 6.2 增加不调用真实模型的 artifact 诊断报告单测，验证引用类轮次能记录 summary、payload 和 reference resolution 状态。
- [ ] 6.3 运行 `npm run test -- tests/manual-llm-flow-policy.test.ts` 以及新增相关测试。
- [ ] 6.4 运行 `npm run typecheck`。
- [ ] 6.5 运行 `openspec validate harden-detailed-llm-blackbox-tests --strict`。
- [ ] 6.6 在缺少 `DEEPSEEK_API_KEY` 时运行详细套件跳过路径，确认不会使用 mock、旧快照或非真实模型结果。
- [ ] 6.7 在用户明确确认 token 成本后运行真实 `npm run test:llm` 和 `npm run test --detail`，刷新基础与详细报告并记录失败排查摘要。
