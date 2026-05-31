## 1. 测试入口与执行器

- [ ] 1.1 梳理现有 `manual-tests/llm` 结构，删除或替换直接调用内部 prompt 分支的 fixture 形态。
- [ ] 1.2 新增首页聊天黑盒执行器，按聊天页面请求形态组织 `conversationId`、`latestUserMessage`、`messages`、`conversationSummary` 和 `conversationContext`。
- [ ] 1.3 让执行器复用真实服务端聊天编排链路，消费 stream 并汇总 assistant 用户可见文本、stream metadata、action summary 和卡片类型。
- [ ] 1.4 为 stream 解析、请求失败、空回复和配置缺失建立统一错误对象，便于报告记录失败原因。

## 2. 多轮流程用例

- [ ] 2.1 根据根目录 `测试情况预览.md` 建立流程用例 fixture，第一版覆盖动作推荐、刷新推荐、推荐升级 routine、信息不足追问、routine 调整、长期 plan 补齐、计划语义区分、非健身切回健身、最近卡片引用。
- [ ] 2.2 为每个流程用例声明 3 个 turn、每轮用户输入、期望卡片类型、是否允许追问、是否应禁止训练卡片。
- [ ] 2.3 实现会话生命周期策略：每个流程用例新建会话，同一流程内沿用上轮消息、summary、conversationContext 和 artifact，不同流程之间隔离。
- [ ] 2.4 实现首轮失败后停止该流程后续轮次，并将跳过原因传给报告。

## 3. 用户可见断言

- [ ] 3.1 实现用户可见文本断言：回复必须非空，且不得泄漏内部 trigger、JSON fenced block、raw payload 或后台流程字样。
- [ ] 3.2 实现卡片类型断言：按预期验证 `exercise_recommendation`、`workout_routine`、`workout_plan` 是否出现。
- [ ] 3.3 实现非卡片轮次断言：追问、解释、建议问答或非健身回复不得推送训练卡片。
- [ ] 3.4 保持第一版流程断言克制，不校验动作 ID、训练组数、训练时长精确值或计划细节准确性。

## 4. token 预估与报告

- [ ] 4.1 更新 `scripts/run-manual-llm-tests.mjs` 的用例数量、预计输入 token、预计输出 token 和命令行摘要。
- [ ] 4.2 新增或调整最新报告文件，例如 `docs/manual-llm-blackbox-flow-latest-report.md`，每次运行结束都写入最新结果。
- [ ] 4.3 报告必须包含运行时间、模型、流程用例数、轮次数、通过数、失败数、跳过数、预计 token 消耗和真实 token 汇总。
- [ ] 4.4 报告必须按流程和轮次记录用户输入、期望结果、实际用户可见回复摘要、实际卡片类型和验证状态。
- [ ] 4.5 失败用例必须记录 `conversationId`、轮次序号、失败原因、responseMessageId 或 trace id、请求/stream 错误摘要和 assistant 回复摘要。

## 5. 文档与验证

- [ ] 5.1 如报告路径或手动 LLM 测试语义改变，更新相关 README 或 docs 说明。
- [ ] 5.2 运行 `npm run typecheck`，确认测试执行器和 fixture 类型正确。
- [ ] 5.3 运行 `npm run test`，确认默认测试仍不会执行真实 LLM 黑盒流程。
- [ ] 5.4 在具备 `DEEPSEEK_API_KEY` 时运行 `npm run test:llm`，验证真实黑盒流程、token 预估和报告生成。
- [ ] 5.5 如果因缺少模型配置或网络限制无法运行 `npm run test:llm`，必须记录未运行原因，并至少验证缺配置时命令输出清晰跳过摘要。
- [ ] 5.6 运行 `openspec validate blackbox-chat-llm-flow-tests --strict`，确认 proposal、specs 和 tasks 通过 OpenSpec 校验。
