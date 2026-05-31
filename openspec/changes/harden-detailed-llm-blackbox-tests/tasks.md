## 1. Runner 真实性改造

- [x] 1.1 梳理当前 `manual-tests/llm/blackbox-runner.ts`、`app/api/chat/route.ts`、`features/chat/api/chat-client.ts` 和会话保存链路，确认详细 runner 与真实首页请求的差异。
- [x] 1.2 为完整/详细套件新增或重构 HTTP/API 形态 runner，每轮按真实首页字段发送 `conversationId`、`responseMessageId`、`latestUserMessage`、`conversationSummary` 和 `thinkingEnabled`。
- [x] 1.3 在 runner 中消费 `/api/chat` NDJSON stream，汇总 assistant 可见文本、卡片事件、conversation summary、traceId、responseMessageId 和 token usage。
- [x] 1.4 为详细 runner 增加测试专用鉴权/用户工具，确保 `/api/chat` 和会话保存链路使用同一 current user。
- [x] 1.5 为测试会话使用可识别的 `manual-llm-*` conversationId 或测试用户标识，确保报告能定位测试数据。
- [x] 1.6 在运行前执行 preflight，检查 `DEEPSEEK_API_KEY`、数据库连接、必要 migration、`ConversationArtifact` / `ArtifactIndex` 表和基础 seed 数据是否可用。

## 2. 会话保存与 artifact 链路

- [x] 2.1 在每个成功轮次后保存用户消息、assistant 消息、conversation summary、conversation context 和可见卡片 payload。
- [x] 2.2 确认保存链路会写入 `ConversationArtifact` 和 `ArtifactIndex`，并在报告中记录每轮是否产生可引用 artifact。
- [x] 2.3 移除或降低详细套件对手工伪造 `recentArtifactSummaries` 的依赖，让后续轮次通过真实数据库 artifact summary 继续。
- [x] 2.4 为“第一个动作怎么做”“把它变成训练”“第二天太累了”等引用类流程记录 artifact summary、payload 读取和 reference resolution 诊断摘要。
- [x] 2.5 验证不同流程用例之间使用互相隔离的新会话，且不会读取其他 `manual-llm-*` 会话或其他用户的 artifact。

## 3. 分级断言与报告结构

- [x] 3.1 扩展 fixture expectation 类型，支持卡片类型断言、语义目标断言、引用断言、禁用关键词、必含关键词、artifact payload 可读性和失败分级。
- [x] 3.2 扩展 `assertions.ts`，将非空回复、内部字段泄漏和卡片类型保留为基础断言，并新增引用成功、动作讲解成功、条件覆盖、排除动作和安全边界断言。
- [x] 3.3 将“没有安全读取到对应的动作详情”这类引用失败回复判定为语义断言失败，而不是仅因无训练卡片而通过。
- [x] 3.4 更新报告生成逻辑，分别输出卡片类型断言状态、语义断言状态、最终状态、失败等级和失败原因。
- [x] 3.5 报告补充运行命令、套件名、runner 类型、生成时间、模型、真实/跳过状态和最近一次运行语义。
- [x] 3.6 明确报告最终状态枚举：`passed`、`failed`、`skipped`、`needs_review`，并定义它们与 P0-P3 失败分级的映射。

## 4. 完整 fixture 覆盖补齐

- [x] 4.1 对照 `LLM完整测试.md` 和当前 `detailedBlackboxFlowCases`，列出已覆盖、缺失和暂不自动化的用例矩阵。
- [x] 4.2 补齐计划和上下文缺口：`P04`、`P07`、`C03`、`C05`、`C06`、`C08`。
- [x] 4.3 补齐引用修改缺口：`M03`、`M04`、`M05`、`M07`、`M08`。
- [x] 4.4 补齐安全和异常缺口：`S03`、`S05`、`S06`、`Q04`。
- [x] 4.5 更新 `docs/manual-llm-consistency-tests.md`，说明基础套件、完整/详细套件、未自动化人工验收项和新增语义断言边界。

## 5. token 预估校准

- [x] 5.1 读取最近基础报告和详细报告中的真实 `prompt_tokens`、`completion_tokens`、`total_tokens`，定义可解释的预估口径。
- [x] 5.2 更新 `scripts/run-manual-llm-tests.mjs`，让基础和详细套件的 token 预估基于 fixture 数量与最近真实运行结果校准。
- [x] 5.3 在报告中记录预计 token、真实 token、偏差摘要和是否因缺 key 跳过真实模型。
- [x] 5.4 在没有可用真实运行报告、最近报告是跳过报告或报告字段缺失时，使用 fixture 数量与保守均值 fallback，并在报告中标明估算来源。

## 6. 文档维护

- [x] 6.1 更新 `docs/方案变更历史`，记录详细 LLM 黑盒测试从轻量 runner 升级到真实请求、会话保存和 artifact 诊断链路的原因与边界。
- [x] 6.2 在 `docs/项目演变历程.md` 追加本次测试体系强化摘要。

## 7. 自动化验证

- [x] 7.1 增加不调用真实模型的本地测试，覆盖 suite 选择、报告路径、失败跳过、fixture 覆盖矩阵和分级断言策略。
- [x] 7.2 增加不调用真实模型的 artifact 诊断报告单测，验证引用类轮次能记录 summary、payload 和 reference resolution 状态。
- [x] 7.3 增加不调用真实模型的 preflight 单测，覆盖缺 key、缺数据库、缺 artifact 表、报告缺失和 fallback token 估算路径。
- [x] 7.4 运行 `npm run test -- tests/manual-llm-flow-policy.test.ts` 以及新增相关测试。
- [x] 7.5 运行 `npm run typecheck`。
- [x] 7.6 运行 `openspec validate harden-detailed-llm-blackbox-tests --strict`。
- [x] 7.7 在缺少 `DEEPSEEK_API_KEY` 时运行详细套件跳过路径，确认不会使用 mock、旧快照或非真实模型结果。
- [ ] 7.8 在用户明确确认 token 成本后运行真实 `npm run test:llm` 和 `npm run test --detail`，刷新基础与详细报告并记录失败排查摘要。
