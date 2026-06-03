# Agent 健身业务边界 Prompt 完善

时间：2026-06-03 19:00:29 CST

## 当前问题

生产 `/api/chat` 的 Agent LLM prompt 已经能约束模型返回合法 `AgentAction`，但缺少项目级产品定位。模型实际 system message 没有明确说明这是 AI 健身助手，也没有把“动作推荐、训练计划编排”和“非医疗建议”这两个稳定边界写清楚。

## 调整思路

本次只调整模型可见 prompt 合同，不修改服务端 runtime，不新增关键词分流，也不注册业务 tool。Prompt 只补高层产品边界：助手服务于健身训练场景，围绕动作推荐和训练计划编排提供帮助；同时明确不提供医疗诊断、治疗建议、伤病判断或康复处方。

## 关键改动

- `agent-llm-prompt-config.ts` 增加 AI 健身助手业务定位。
- `agent-llm-prompt-config.ts` 增加非医疗能力边界。
- `agentLlmPromptVersion` 从 `agent-action-v2` 升级为 `agent-action-v3`。
- Prompt 配置单测锁定新边界进入 system message，并继续禁止具体业务 toolName 混入默认 prompt。

## 为什么这样做

把业务大方向放进通用 prompt，可以让空 `ToolRegistry` 阶段也稳定回答能力边界；把具体动作库、训练生成和保存流程继续留给后续业务 tool manifest，可以避免默认 prompt 承诺当前没有接入的执行能力。
