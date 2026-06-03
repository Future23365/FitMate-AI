# 旧 Agent Core 运行时删除

记录时间：2026-06-03 10:55:56 +0800

## 问题背景

旧聊天 AI/Agent 运行时已经从可演进基础变成系统负担。`/api/chat`、旧 Agent core、tool registry、Prompt、模型调用、Response Writer、AI trace、activity 事件、手动 LLM runner 和黑盒 fixture 互相绑定，任何一段继续存在都会让后续开发误以为旧流程仍是当前生产事实。

更大的问题是旧链路同时承担自然语言理解、工具选择、资源恢复、卡片投影、summary 更新和调试报告，边界过宽。继续局部打补丁会保留大量兼容层，也会让新的 AI 编排设计被旧合同牵制。

## 调整思路

本次按 delete-only 边界处理旧运行时：删除旧 AI/Agent 执行能力，不为 UI、测试、trace 或其他 open changes 保留兼容 adapter。页面壳、历史会话、历史 trace 查看器和非 AI 公共领域服务继续保留。

`/api/chat` 保留 HTTP 边界，但只做鉴权、请求体验证、历史 hydration 和明确的 `chat_ai_disabled` 响应，不再触发模型调用、tool calling、artifact 生成、summary 更新或旧 NDJSON 事件。

## 关键改动

- 删除 `lib/server/agent-orchestrator/**`、`lib/server/ai/**`、旧 Agent activity 模块、旧 Response Writer 和旧 Agent stream 事件依赖。
- 删除 `manual-tests/llm/**`、旧手动 LLM runner、旧 Vitest LLM 配置和旧 Agent core 测试 fixture。
- 重写 `/api/chat` 和 `lib/server/chat/chat-service.ts`，保留非 AI 请求归一化与历史 hydration，返回禁用响应。
- 将 AI trace 页面改为历史 trace / Raw JSON 查看器，不再依赖旧 Agent timeline view model。
- 增加架构级扫描测试和公共领域服务导入测试，防止旧运行时入口、合同和 runner 回流。
- 更新 README、聊天链路文档和手动 LLM 文档，明确旧运行时和旧命令已删除。

## 结果

当前生产代码不再依赖旧 `AgentOrchestrator`、旧 Agent tool registry、旧模型 provider、旧 Prompt module、旧 Response Writer、旧手动 LLM runner 或旧 Agent stream 合同。后续重新接入 AI 聊天能力时，需要用新的 OpenSpec change 重新定义模型输入、tool calling、模型输出、trace 和前端事件协议。
