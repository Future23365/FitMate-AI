# Change: Harden Agent fitness business boundary prompt

## 背景

当前生产 `/api/chat` 已接入新 `agent-core` 文本聊天链路，默认 Agent LLM prompt 也已经改为中文 `AgentAction` 合同。但该 prompt 只说明 JSON 输出、空 `tools`、基础问答、能力边界和 repair 行为，没有明确项目的产品级业务边界：这是一个 AI 健身助手，核心方向是围绕动作推荐、训练目标梳理和训练计划编排提供帮助，同时不得提供医疗诊断或治疗建议。

这个缺口会让模型在回答“你能做什么”“我哪里疼怎么办”“帮我看这个伤病能不能练”等问题时，只能依赖通用聊天能力自我归纳，容易把产品方向说得过宽，或把医疗/康复判断误说成可提供服务。

## 目标

- 在默认 Agent LLM prompt 中补齐稳定产品定位：AI 健身助手，服务重点是动作推荐、训练信息整理和训练计划编排。
- 明确非医疗边界：不提供医疗诊断、治疗建议、伤病判断或康复处方。
- 保持 tool-first 能力边界：prompt 只能声明高层产品职责，不承诺已执行未注册 tool、不描述具体业务 tool 流程、不新增服务端语义分流。
- 增加 prompt 配置测试，锁定业务边界和非医疗边界进入模型实际 system message。

## 非目标

- 不注册动作推荐、训练生成、动作库查询、保存 artifact、用户记忆或数据库业务 tool。
- 不修改 `/api/chat` 外部请求 schema、NDJSON 事件合同、Response Renderer 或 Agent runtime。
- 不新增关键词、正则、同义词表、短句模板或服务端规则去判断医疗意图或训练意图。
- 不把 `searchExercises`、`generateRoutine`、保存计划等具体业务 toolName 或执行流程写入默认 prompt。

## 影响范围

- `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`
- `tests/agent-core/agent-llm-prompt-config.test.ts`
- OpenSpec change 文档与相关规格 delta
- 方案变更历史与项目演变记录
