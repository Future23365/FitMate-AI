# Agent Observation 决策提示移除

时间：2026-06-06 16:40:54 CST

## 背景问题

此前 `toModelObservation` 的定位是把 tool handler output 转成 Planner 下一轮可见的安全事实摘要，但实际实现中逐步混入了 `supportsOutputKinds`、`supportsSuccessfulVisibleOutputs`、`finalAnswerSupport`、`nextActionHints` 和 `routinePlanCompositionBoundary` 等字段。

这些字段会把“当前 tool 返回了哪些动作事实、覆盖了哪些 section、缺少哪些事实”包装成“能输出哪些 `visibleTrainingProposal.payload.kind`、是否能成功交付 `visibleOutputs`、下一步该选择什么 action”。这会干扰模型根据用户目标和 output contract 自主判断 `exercise_selection`、`routine` 或 `plan`。

## 调整思路

本次把模型可见 observation 拉回事实投影层：

- 正常成功 tool observation 只表达当前 run 的事实、事实等级、引用边界、section coverage、诊断和安全摘要。
- `searchExerciseResources` 只暴露动作事实和 section coverage，不判断输出 kind 或用户目标是否满足。
- `inspectVisibleTrainingProposals(read_recent)` 只暴露已导入训练事实、resource role、可复用动作、section coverage 和 `hasSchedule`。
- ok tool result index observation 只保留 `toolResultId`、`toolName`、`fulfillment`、`terminalUsedRef`、`modelFactsChannel`、`factLevel` 和 `factSource`。
- duplicate tool input 的 `repairContext` 只保留字段级错误、previous result fact、`reusableRef` 和恢复边界，不输出下一步 action 枚举。

服务端仍只做 schema、resource、grounding、权限、数据库事实和 terminal validator 校验，不新增关键词、phrasing、自然语言模板路由或具体业务 `toolName` 语义分支。

## 关键改动

- `visible-training-resource-coverage.ts` 从输出 kind 支持摘要改为纯 section coverage helper，输出 `sectionSummary`、`availableSections` 和 `missingSections`。
- `search-exercise-resources.tool.ts` 删除输出 kind、final answer 支撑度和 next action hints，仅保留查询事实、section coverage、group facts、filter semantics 和 diagnostics。
- `inspect-visible-training-proposals.tool.ts` 删除 `read_recent` / `list_recent` observation 中的输出 kind 和 next action hints，保留事实导入边界、`visible_training_proposal_fact` resource、`reusableExerciseItems`、`missingSections`、`hasSchedule` 和 `schedule`。
- `observation.ts` 和 `runtime.ts` 删除 ok tool result index 与 duplicate repair payload 中的 `finalAnswerSupport` / `nextActionHints`，改用 facts + ref + boundary。
- `agent-visible-output-contracts.ts`、validator 和相关测试同步改用 `missingSections` 这个纯事实字段。
- `resolveExerciseResourceMentions` 的 model observation 同步删除同类 next action hints，保持所有 production observation 一致。

## 验证结果

- `npm test`：73 个测试文件、495 个测试全部通过。
- `npm run typecheck`：通过。
- `openspec validate remove-tool-observation-decision-hints --strict`：通过。
- `openspec validate --specs --strict`：90 个 spec 全部通过。
- 最终 grep 确认生产模型可见 observation / `repairContext` 不再暴露旧决策字段；剩余命中只存在于历史文档、OpenSpec 待归档说明或测试中的负向断言。

## 剩余说明

旧的历史文档和已归档 OpenSpec change 中仍会保留当时的 `nextActionHints` / `supportsOutputKinds` 记录，这是历史事实，不代表当前生产合同。`remove-tool-observation-decision-hints` 归档后，base specs 才会落到新的正式合同。
