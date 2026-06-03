# Design: Harden Agent fitness business boundary prompt

## 问题根因

现有默认 Agent LLM prompt 已经解决了“模型必须返回合法 `AgentAction`”和“空 `tools` 时不能调用工具”的结构化问题，但它没有告诉模型这个生产聊天助手的稳定业务身份。模型实际 system message 中缺少以下两类高层边界：

1. 产品职责边界：AI 健身助手，围绕动作推荐、训练目标/限制整理、训练原则解释和训练计划编排提供帮助。
2. 非医疗边界：不能提供医疗诊断、治疗建议、伤病判断或康复处方。

这属于 production prompt 规则变更，而不是业务 tool 接入，也不是 runtime / core contract 变更。

## 设计方向

### 1. 在默认 prompt 中加入产品级定位

新增一条中文 system prompt instruction，放在 `AgentAction` 输出合同之后、能力/工具规则之前。内容只描述稳定产品身份和服务方向：

- 是 AI 健身助手；
- 主要帮助用户理解和表达训练目标、训练限制、动作选择需求；
- 围绕动作推荐和训练计划编排提供文本帮助。

取舍：把这类定位放到 tool manifest 会太晚，因为空 `ToolRegistry` 阶段也需要回答能力边界。把具体动作库查询或计划保存流程写进默认 prompt 又会突破通用 prompt 合同。因此只写高层产品边界，不写任何具体 toolName 或执行流程。

### 2. 在默认 prompt 中加入非医疗边界

新增一条中文 system prompt instruction，要求模型不得提供医疗诊断、治疗建议、伤病判断或康复处方。用户要求医疗判断时，应说明该能力不在范围内，并只围绕非医疗训练信息继续澄清或回答。

取舍：服务端不能通过关键词判断“医疗意图”，否则会违反项目语义边界。正确做法是让 LLM 在结构化输出前看到稳定产品边界；服务端继续只校验 `AgentAction`、registry、资源、权限和投影合同。

### 3. 递增 prompt version 并补充测试

将 `agentLlmPromptVersion` 从 `agent-action-v2` 递增到 `agent-action-v3`，便于 trace、黑盒报告和回归测试区分模型实际看到的新旧 system prompt。测试增加：

- system prompt 包含 AI 健身助手、动作推荐、训练计划编排；
- system prompt 包含不提供医疗诊断、治疗建议、伤病判断、康复处方；
- system prompt 仍不包含具体业务 toolName；
- 默认请求参数不变。

## 边界

- 允许触碰：Agent LLM prompt 配置、prompt 配置测试、OpenSpec 文档、项目演变文档。
- 禁止触碰：`agent-core` runtime、`PlannerPort`、Executor、Policy Guard、ResourceStore、Response Renderer、`/api/chat` 外部事件协议、业务 tool 注册、数据库访问。
- 不涉及业务 tool 模型可见说明；后续真实动作推荐/计划编排 tool 接入时，应由各 tool manifest 和 resource contract 补齐具体模型可见说明。

## 风险与缓解

- [Risk] prompt 增加产品定位后模型过度承诺当前未注册的业务能力。→ Mitigation：保留并测试“不得承诺执行未注册工具、查询不可见事实或保存未接入结果”的原有规则。
- [Risk] 非医疗边界被误实现为服务端文本拦截。→ Mitigation：本 change 不修改服务端路由或 runtime，只改模型可见 prompt 合同和测试。
- [Risk] 默认 prompt 与之前“不写具体业务流程”的规则冲突。→ Mitigation：只写高层产品方向，不写 `searchExercises`、`generateRoutine`、保存 artifact 或动作库查询流程。
