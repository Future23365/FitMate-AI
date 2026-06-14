# 2026-06-14 18:04:03 CST Exercise 执行条件 Taxonomy 回填与 Agent 查询合同迁移

## 背景

`add-exercise-execution-taxonomy` 已经为 `Exercise` 建立 execution taxonomy 字段和 unknown-safe 默认值，但字段刚落库时不包含真实动作分类数据。如果继续让 `searchExerciseResources` 通过旧 `equipment` / `homeRequirement` 输入表达器械、支撑物、场地和低门槛约束，模型仍会面对旧字段语义交叉的问题。

## 原方案为什么不够清晰

字段落库只解决了稳定落点，没有解决两个后续问题：

- 数据库中已有动作需要有可校验的 execution taxonomy 事实，否则 taxonomy 查询会大量命中 unknown 或空 tag。
- Agent tool 的模型可见合同必须切换到新字段，否则模型仍会使用旧 `equipment` / `homeRequirement` 作为执行条件筛选入口。

如果只在 handler 内兼容旧字段，短期看起来改动更小，但会保留两套含义相近却边界不同的筛选体系，让模型和测试都继续承担旧语义歧义。

## 调整思路

本次把数据补齐和 Agent 查询合同拆成两个职责：

- 数据补齐通过 `data/exercise-execution-taxonomy.backfill.jsonl` 和 `scripts/backfill-exercise-execution-taxonomy.mjs` 完成，脚本只写入通过共享 taxonomy schema 校验的离线补丁，不调用模型。
- `searchExerciseResources` 只暴露 execution taxonomy 的结构化输入字段，旧 `equipment` / `homeRequirement` 保留为 UI 展示、传统动作库筛选和审查对照字段，不再作为 Planner 可填写字段。

## 关键改动

- 新增 `npm run db:backfill-execution-taxonomy`，用于校验或事务化写入 `Exercise` execution taxonomy 补丁。
- 提交 `data/exercise-execution-taxonomy.backfill.jsonl`，覆盖当前 873 条动作源数据。
- `searchExerciseResources` input schema 移除模型可见 `equipment` / `homeRequirement`，新增 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 和 `noiseLevelMax`。
- Repository 将 taxonomy filters 下推到数据库查询；`unknown` / `null` 不匹配低门槛、低冲击或安静这类上限约束。
- Tool description、schema description、facet catalog、model-visible summary、user projection 和 trace summary 暴露有限 `executionTaxonomy` 事实，并继续隐藏完整数据库对象、handler output、placement eligibility 和固定 workflow 暗示。

## 边界

本次没有修改 LangChain runtime 主循环、provider payload、production response adapter、`/api/chat` 主链路或 finalization tool 通用合同。服务端没有新增用户原文关键词、正则、同义词表、短句模板、phrasing 特判或 provider `tool_calls` 改写。数据补齐脚本是离线运维入口，不是运行时自然语言推断能力。

## 验证

- `openspec validate add-exercise-execution-taxonomy --strict`
- `openspec validate migrate-exercise-resource-execution-taxonomy --strict`
- `openspec validate agent-exercise-resource-query-tool --strict`
- `npm test -- tests/exercise-execution-taxonomy.test.ts tests/exercise-execution-taxonomy-backfill.test.ts tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`
- `npm test -- tests/exercise-repository.test.ts`
- `npm run typecheck`
- `npm run db:backfill-execution-taxonomy -- --validate`
