# Agent Loop Trace 可读化

记录时间：2026-06-01 20:14:16 CST

## 当前真实问题

Tool-first Agent 已经成为 `/api/chat` 主链，但 `/dev/ai-traces` 仍需要开发者从阶段列表和 Raw JSON 中手动拼接“模型看到了什么、为什么调用工具、工具返回了什么、下一轮模型是否看到了结果”。旧页面虽然已有 Agent phase / tool / resource 诊断，但缺少一条按 loop turn 串起来的因果链。

## 调整思路

本次不改变 Agent 决策、工具执行、权限、持久化或用户可见回复合同，只增强 trace 记录和调试展示：

- Agent runtime 每轮写入 `loopTurnId`、`modelCallId`、`toolCallId`、`toolResultId`、`visibleToolResultIds`、`usedToolResultIds` 和关键 resource id。
- LLM 请求、LLM 响应、解析结果、工具结果和 Response Writer 统一进入 `AgentLoopTraceViewModel`。
- 页面新增 Agent loop timeline 子组件，默认按 `LLM 输入 -> LLM 输出解析 -> tool 执行结果 -> 下一轮输入可见性 -> 最终收口` 展示。
- 保存全链路 log 复用同一份 view model；保存用户问答记录继续保持窄格式，并在 API 层兜底去除完整 prompt、tool payload 和卡片数据。

## 关键改动

- `lib/server/agent-orchestrator/runtime.ts` 补齐 Agent loop linkage metadata 和工具失败结果 trace。
- `lib/server/chat/chat-service.ts` 为 Agent decision model request / response 和 Response Writer 增加结构化 trace 摘要。
- `components/dev/agent-trace-view-model.ts` 新增 `agentLoop` 建模、断链诊断、旧 trace fallback 和可导出 timeline。
- `components/dev/agent-loop-trace-timeline.tsx` 承接 Agent loop 展示，减少主页面继续膨胀。
- `app/api/dev/ai-traces/route.ts` 对 prompt log 保存做窄格式归一化。
- `tests/fixtures/agent-traces.ts` 和相关测试覆盖完整 tool call、多轮 tool call、tool 失败、解析失败、孤立 tool result、Response Writer mismatch 和 legacy trace。

## 验证结果

- `openspec validate make-agent-loop-trace-readable --strict` 通过。
- `npm run test -- tests/ai-trace-viewer.test.ts tests/ai-trace-http.test.ts` 通过，15 个用例通过。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

## 结果

Agent trace 现在可以直接回答“这一轮 LLM 看到了什么、输出了什么、工具结果是否进入下一轮输入、最终回复依赖哪些结果”。页面仍保留阶段事件和 Raw JSON 入口，避免解释层遗漏低频字段。
