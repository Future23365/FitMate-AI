# Agent 输出合同从 System Prompt 解耦

时间：2026-06-06 12:48:19 CST

## 当前问题

生产 Agent 的默认 `system prompt` 同时承载了通用 `AgentAction` 合同、结构化训练输出规则、`routine` / `plan` section coverage、`prescription`、`schedule` 和失败恢复边界。继续把业务输出实例塞进通用 prompt，会让模型输入越来越密，也让后续维护者难以判断规则应该属于通用 prompt、业务 output contract、tool manifest、observation、repair feedback 还是 validator。

## 调整思路

本次把模型可见合同分为两层：

- 通用 `system prompt` 只表达跨业务能力的 `AgentAction`、tool loop、grounding、policy / resource / validator、安全和不可执行能力边界。
- 业务结构化输出能力进入集中 `outputContracts` registry，并与 `tools`、`observations`、`toolResults` 同级进入 Planner user payload。

这样模型仍能看到结构化训练输出能力，但这些业务细则不再污染通用 prompt，也不成为服务端语义分流入口。

## 关键改动

- 新增 `AgentVisibleOutputContract` 集中配置，当前注册 `visibleTrainingProposal`，包含 `outputType`、`schemaVersion = "1"`、`schemaSummary`、`groundingRequirements`、`validatorBoundary` 和示例骨架。
- `DeepSeekModelAdapter` 在 user payload 中加入 `outputContracts`，trace 只记录 output type、schema version 和数量摘要。
- 默认 `AgentAction` system prompt 移除 `visibleTrainingProposal` 完整 payload 规则、`payload.kind` 选择细则、section coverage、`prescription`、`schedule` 和业务 examples，只保留遵守 `outputContracts[]` 的通用要求。
- terminal grounding 与 repair feedback 收紧为：`failed`、diagnostic、不可消费 resource 或 `satisfied=false` 结果不能支撑成功 `final_answer`；`ok=true` 且 `satisfied=true` 的 0 条结果仍可支撑普通文本解释。
- 架构扫描补充 `outputContracts` 配置边界，确认没有新增用户原文关键词、正则、短句模板、具体 `toolName` 或业务 outputType 服务端分流。

## 验证

已补充并通过相关测试：prompt config、output contract、DeepSeek adapter payload、terminal grounding、runtime repair feedback、architecture boundary、chat service 和 terminal failure finalizer。

后续完整验证继续通过 OpenSpec、`npm test` 和 `npm run typecheck` 覆盖。
