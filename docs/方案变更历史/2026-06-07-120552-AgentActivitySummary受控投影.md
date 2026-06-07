# 2026-06-07 12:05:52 CST Agent activitySummary 受控投影

## 背景

聊天活动条原本只展示服务端固定 `AgentProgressStage` 文案，能表达当前处在上下文准备、查询动作库、校验结果等粗粒度阶段，但不能表达模型在本轮 `AgentAction` 中准备推进的用户目标。如果直接展示模型 raw response、`reasoning_content` 或让 LLM 生成 NDJSON event，会把执行合同、provider 原文或内部调试内容暴露给用户，也会破坏 `/api/chat` 只投影服务端白名单事件的边界。

## 调整思路

本次把 `activitySummary` 作为 `tool_call`、`final_answer`、`ask_user` 三类 `AgentAction` 的共同可选字段。模型只在受控 action JSON 中提供一句短中文活动摘要；服务端只做 schema 校验、展示安全 sanitizer、trace 安全摘要和当前请求内 `agent_progress` 投影；前端只做二次校验和活动条展示，不持久化、不重放、不反向影响 `loopTurn`。

## 关键改动

- `AgentAction` schema 新增可选 `activitySummary`，非字符串或超过硬结构上限会进入确定性 schema repair，缺失不会触发 repair。
- 默认 `agent-llm-prompt-config` 升级到 `agent-action-v24-activity-summary`，system prompt 只补短规则，字段用途和边界放在 `protocol.actionContract`。
- 新增共享 `sanitizeAgentActivitySummary`，统一限制空白、过长、非中文、控制字符和内部技术标识。
- runtime `planner_action` trace 只记录安全摘要或拒绝原因，不记录被拒绝的原文。
- `/api/chat` 只从已校验 action 的安全 trace 投影 `agent_progress.activitySummary`，`agent_loop` 仍然只表达真实 runtime loop 轮次。
- 前端 NDJSON parser、activity reducer 和 `AgentActivityIndicator` 优先展示安全摘要；非法摘要忽略并继续使用 stage fallback。

## 边界

- `activitySummary` 不进入 `ChatMessage`、聊天历史、conversation summary、conversation context、visible output、artifact payload、跨 run fact bridge 或 replay summary。
- 服务端不根据 `activitySummary` 或用户原文选择 `toolName`、改写 action、生成最终回答、决定权限、确认、grounding 或结构化输出。
- 旧 `tool_call.rationale` 不承担用户可见活动摘要职责。

## 验证

已补 AgentAction schema / prompt config、runtime trace、chat service stream、frontend NDJSON parser、activity reducer / component、history persistence 和架构边界测试。相关自动化测试覆盖摘要合法投影、非法摘要 fallback、`agent_loop` 与摘要时序、终态事件不携带摘要，以及摘要不参与服务端语义分流。
