# Agent Tool 安全资源闭环 M1 偏差修复

时间：2026-06-03 13:59:04 CST

## 原问题

M1 已经完成 `ResourceStore`、Resource Contract、`Policy Guard` 和 confirmation 的基础闭环，但复核架构文档后发现三个实现偏差：

- confirmation resume 在校验通过后立刻把 pending action 标记为 `consumed`，早于实际 tool handler 成功执行。
- fixture producer / diagnostic resource 仍从 Planner 输入间接携带 resource id，且 `ResourceStore.register` 会覆盖同 id 资源。
- `confirmation: "dynamic"` 只是按固定 risk shortcut 判断，没有真正通过结构化 input/context/resource 进入动态策略。

## 调整思路

本次不扩大 M1 范围，不接 production `/api/chat`，也不引入真实业务 tool。修复集中在 core 安全合同：

- pending action 只在校验阶段保持 `pending`，执行成功后才 `consumed`。
- `ResourceStore` 负责生成缺省 resource id，并拒绝当前 run 内重复 resource id。
- dynamic confirmation 改为可注入 evaluator，默认保守确认，evaluator 只能读取结构化 action/tool/actor。

## 关键改动

- `confirmation-store.ts` 新增成功后消费入口，`resumeConfirmedAction` 只在 tool result 成功后标记 consumed。
- `resource-store.ts` 新增受控 resource id 生成，并拒绝重复登记。
- M1 fixture producer / diagnostic tool 不再从 Planner 输入透传 resource id。
- `policy-guard.ts` 增加 dynamic confirmation evaluator，支持结构化动态升级或放行。
- 回归测试覆盖 resume 失败后 pending 可重试、重复 resource id 拒绝、受控 resource id 生成、dynamic evaluator 行为。

## 验证结果

- `npm test -- tests/agent-core`：8 个测试文件、37 个测试通过。
- `npm run typecheck`：通过。
- `openspec validate add-agent-tool-safety-resource-closure-m1 --strict`：通过。
