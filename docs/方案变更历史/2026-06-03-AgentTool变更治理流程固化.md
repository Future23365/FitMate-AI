# Agent Tool 变更治理流程固化

时间：2026-06-03 16:19:54 CST

## 当前真实问题

Agent Tool Orchestrator 已经完成 M0 / M1 / M2 的通用内核、安全资源闭环和上线硬化，但“后续新增业务 tool 或修复 Agent tool bug 应该怎么开始”主要依赖架构文档和人工记忆。这个状态容易让后续实现绕过 `ToolRegistry`、`Policy Guard`、`ResourceStore`、projection 或 `/api/chat` 生产入口边界，把单个业务问题修成 core 特判、关键词分流或隐藏业务编排。

## 原方案为什么不合适

只把规则写在 `docs/agent-tool-orchestrator-design.md` 第 24-26 节可以解释架构边界，但不能保证每次相关任务都会先读、先分类、先声明允许和禁止模块。只靠人工 review 也无法稳定发现 core 被业务 tool 污染、生产聊天入口重新出现关键词分流、tool output 默认进入模型或用户事件等问题。

## 调整思路

本次不修改生产 runtime，也不新增真实业务 tool，而是把治理入口、OpenSpec 文档要求和自动化验证一起固化。后续 Agent tool change 先用项目级 Skill 做 preflight，再在 OpenSpec 文档中写清任务分类、允许模块、禁止模块和验证计划，最后由架构扫描与 contract tests 兜底发现越界实现。

## 关键改动

- 新增 `.codex/skills/agent-tool-change-governance/SKILL.md`，触发后要求读取架构文档第 24-26 节，执行 OpenSpec / Git / 任务分类 preflight。
- 在 `docs/agent-tool-orchestrator-design.md` 追加 Agent tool 变更治理流程，提供新增业务 tool、bug 修复和后续 `tasks.md` 验证 checklist。
- 扩展 `tests/agent-core/architecture-boundary.test.ts`，扫描 Agent core 和 `/api/chat` 生产入口是否出现业务 toolName 分支、业务服务导入、模型 adapter 依赖或关键词分流。
- 扩展 `tests/agent-core/contract-test-helper.ts` 与 `contract-helper.test.ts`，让 helper 覆盖 schema、policy、resourceContract、handler 错误归一化、模型投影、用户事件和 trace 摘要。
- 新增 `tests/agent-core/tool-governance-regression.test.ts`，显式回归 write/high-risk confirmation、diagnostic grounding 和完整 tool output 防泄漏。

## 验证结果

- `openspec validate codify-agent-tool-change-governance --strict` 通过。
- `npm test -- tests/agent-core/architecture-boundary.test.ts tests/agent-core/contract-helper.test.ts tests/agent-core/tool-governance-regression.test.ts` 通过，3 个测试文件、15 个用例通过。
- `npm run typecheck` 通过。
- `npm test` 通过，53 个测试文件通过，264 个用例通过，1 个用例按原有条件跳过。
