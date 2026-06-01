## 1. 服务端会话 hydration

- [x] 1.1 梳理现有会话保存读取链路，确认 `/api/chat/conversations/[id]`、本地匿名用户和 artifact service 可复用的读取入口。
- [x] 1.2 在 `/api/chat` 请求准备阶段按 `conversationId + current user` 读取已保存会话，恢复历史 `messages`、`conversationContext`、训练卡片和 `recommendationIntents`。
- [x] 1.3 将服务端读取结果合并进 `PreparedAiChatRequest` 或等价结构，明确记录 hydration source。
- [x] 1.4 保留客户端 `messages` / `conversationContext` 作为 schema 校验后的 fallback，并确保已保存会话优先。
- [x] 1.5 确认 recent artifact summaries 始终从当前用户、当前会话的服务端数据读取，不接受 runner 或客户端手工注入。

## 2. 长期计划 action gate 修复

- [x] 2.1 调整长期计划补齐归一化逻辑，使 F05 第 3 轮在 hydrated context 中触发 `workout_plan`。
- [x] 2.2 调整已有 plan 后的短指令处理，使“改成每周6练”保持 plan 语义并触发 `workout_plan`。
- [x] 2.3 保持笼统长期计划和只补周频/时长的中间轮继续追问，不生成空泛 plan。
- [x] 2.4 在 trace 中记录 plan gate 使用的关键结构化事实，例如 `weeklyFrequency`、`sessionMinutes`、recent artifact kind 和 hydration source。

## 3. 引用讲解诊断与黑盒报告

- [x] 3.1 为确定性 `exercise_explanation` 回复补充可消费的引用解析诊断事件或 `done` metadata。
- [x] 3.2 调整 `manual-tests/llm/blackbox-runner.ts`，统一采集 `assistant_action` 和确定性诊断事件中的 reference resolution。
- [x] 3.3 调整语义断言，确保 F15 不因缺少 `assistant_action` 被误判，但真实 payload 读取失败仍标记失败。
- [x] 3.4 更新报告输出，记录确定性引用讲解的 artifactId、artifactKind、payload 读取状态和 reference 状态。

## 4. token 估算校准

- [x] 4.1 调整手动 LLM runner 的 token 估算读取逻辑，优先使用最近真实运行报告。
- [x] 4.2 忽略跳过报告、字段缺失报告和 `total_tokens=0` 的非真实成本基线。
- [x] 4.3 在基础和详细报告中明确写出估算来源、真实均值或 fallback 口径。

## 5. 自动化测试

- [x] 5.1 补充服务端 hydration 单测，验证已保存会话优先于最新消息构造的空上下文。
- [x] 5.2 补充 F05 回归测试，覆盖三轮长期计划补齐后触发 `workout_plan`。
- [x] 5.3 补充 F06 回归测试，覆盖已有 plan 后“改成每周6练”保持 `workout_plan`。
- [x] 5.4 补充 F15 诊断回归测试，覆盖确定性动作讲解 resolved 状态写入报告。
- [x] 5.5 补充 token 估算单测，覆盖真实报告校准、跳过报告忽略和 fallback。

## 6. 文档与验证

- [x] 6.1 更新 `docs/方案变更历史`，记录本次从 summary 依赖转向服务端 hydrated context 的原因和边界。
- [x] 6.2 更新 `docs/项目演变历程.md`，追加本次核心链路修复摘要。
- [x] 6.3 运行 `npm run test -- tests/chat-service.test.ts tests/manual-llm-flow-policy.test.ts`。
- [x] 6.4 按影响范围运行 `npm run typecheck`。
- [x] 6.5 运行 `openspec validate hydrate-chat-history-context --strict`。
- [x] 6.6 如用户确认真实模型 token 成本，再运行 `npm run test:llm` 刷新基础黑盒报告；否则在实现总结中说明未运行。
