# 2026-06-01 17:44:46 +0800 Tool-first Agent 主链收尾

## 背景

旧聊天主链长期以 intent-first 方式运行：先让模型输出 `ResolvedChatIntent` / `assistant_action`，再由服务端基于候选、引用解析、只读 tool loop 和确定性分支决定是否推送卡片。这个方式在多轮短指令里容易让服务端语义规则覆盖模型理解，例如“`不用哑铃了，换一个`”可能被旧关键词、summary 或 ReferenceResolver-first 路径误导。

## 调整思路

本次收尾把 `/api/chat` 生产入口固定到 Tool-first `AgentOrchestrator`。执行事实由 `ContextPackage`、Agent tools、tool results、dependency graph 和 `AgentExecutionResult` 串联；旧 `assistant_action` / resolved intent 只作为兼容派生事件，不能再反向触发生成、Patch 或写入。

## 关键改动

- `/api/chat` 入口不再保留运行时开关或旧 intent-first 分支，直接进入 AgentOrchestrator。
- 黑盒 runner 从 `AgentExecutionResult`、artifact/patch 事件和 done metadata 推导稳定卡片类型，并记录 Agent status、tool、candidateSetId、validationId、revisionId 和 legacy path skip。
- manual LLM fixture 保留原业务 flow，并新增“哑铃上肢 routine 后排除哑铃”的多轮场景，用 Agent 执行证据验证旧路径未参与。
- 架构文档和聊天推送文档改为描述 Tool-first Agent 主链，明确旧 `conversationSummary`、旧 prompt module、只读-only tool loop 和 `assistant_action` 主触发路径已经废弃。

## 结果

黑盒报告可以分层展示用户可见闭环、Agent 执行证据、语义质量和人工复核项。后续排查不再只看旧 `assistant_action` 是否存在，而是优先看 `AgentExecutionResult`、tool dependency graph 与真实 artifact / patch 事件是否一致。
