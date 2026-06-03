## Context

当前 `/api/chat` 已切到 Tool-first Agent 主链。`searchExercises` 只会在模型传入 `filters.equipment`、`equipmentRequired` 或 `homeRequirements` 时把器械当作 hard filter；没有这些字段时，动作检索和 routine draft builder 会把器械视为未约束。

新的产品规则要求：用户没有单独提供可用器械时，不应产生“任意器械可用”的候选集合，而应按无器械训练处理。只有用户在当前消息、同会话已确认事实或用户记忆中明确表达“我有某个器械 / 健身房器械可用”时，系统才使用特定器械。

## Goals / Non-Goals

**Goals:**

- 让动作推荐、routine 和 plan 在未指定器械时默认使用无器械 / 自重候选。
- 让服务端 Agent 工具边界提供确定性兜底，避免模型漏传默认器械条件时退回任意器械。
- 保留用户明确可用器械的优先级，避免默认无器械覆盖“我有哑铃”“有弹力带”“健身房器械”等正向条件。
- 同步 prompt、工具说明、生成 intent、测试和黑盒期望。

**Non-Goals:**

- 不新增基于用户原文关键词的服务端语义判断，不用正则、同义词表或短句模板重新解释自然语言。
- 不修改动作库页面、composer 动作库筛选或普通 `/api/exercises` 查询的默认行为。
- 不修改 Prisma Schema、数据库迁移或动作元数据。
- 不启动 dev server，不做浏览器验证。

## Decisions

### 1. 默认无器械放在 Agent 工具边界，而不是通用动作搜索服务

`searchExercises` Agent 工具在执行型 `candidateUse = "recommendation" | "routine" | "plan" | "patch"` 时，如果结构化输入没有正向可用器械、居家条件或已确认可用器械事实，则补入无器械边界，例如 `filters.homeRequirements = ["no_equipment"]` 或项目已有的等价自重器械 facet。

不把默认写进 `lib/server/exercises/exercise-service.ts` 的通用入口，是为了避免污染动作库页面、composer、测试 fixture 和普通 API 查询。动作搜索服务仍只执行传入的结构化 filters。

### 2. 正向可用器械事实优先于默认无器械

可取消默认无器械的事实必须是结构化正向条件：当前 Agent 输入中的 `filters.equipment.in`、`equipmentRequired`、`equipment`、`homeRequirements`，或 ContextPackage / memory 中已确认的可用器械事实。排除类条件如 `equipment.notIn`、`equipmentAvoided` 不是正向可用器械；如果没有其他可用器械，仍应叠加无器械默认。

选择这个边界是为了符合“只有用户说有某某器械，才用特定器械”的产品规则，同时避免服务端从自然语言原文二次猜测语义。

### 3. Prompt 只做模型侧约束，服务端兜底保证一致性

`prompt-config.ts` 和 `searchExercises` 工具说明需要明确：未指定器械时必须默认无器械；模型应把该默认写入结构化 filters 和 routine / plan intent。服务端仍在工具归一化阶段兜底，以覆盖模型漏传或多轮收口抖动。

这个设计优于只改 prompt，因为候选集合和 artifact 生成是用户可见结果，必须能被 trace、测试和 resource fulfillment 复盘。

### 4. Routine / plan intent 也要同步默认

仅让候选集合无器械不足够。`generateRoutineDraft` 和 `generatePlanDraft` 的结构化 intent / strategy 中也应反映默认无器械，否则保存后的 artifact 可能显示或索引为“未指定器械”。实现时应在工具 schema preprocess 或生成工具入口用同一默认判定补齐。

### 5. 长期计划门控不再把器械作为必须追问字段

`plan-push-composition` 当前要求目标、时长、频率、器械或场地都足够才触发计划。新规则下，器械缺失不再阻断 plan；只要目标、单次时长和周频足够，且没有其他结构化阻断，系统应按无器械计划生成。

## Risks / Trade-offs

- [Risk] 默认无器械会让部分用户期待健身房动作时看到自重动作。→ Mitigation: 这是新的产品默认；可通过建议回复提示“如果你有哑铃或器械，可以告诉我再调整”。
- [Risk] 历史器械事实与当前默认规则冲突。→ Mitigation: 已确认正向可用器械事实优先；当前消息明确“不要器械 / 无器械”时仍按当前消息覆盖。
- [Risk] 只看结构化事实可能漏掉模型没有抽取出的器械表达。→ Mitigation: prompt 和工具说明要求模型抽取；服务端不读原文重解释，符合 AI 语义边界。
- [Risk] patch 场景默认无器械可能改变替换动作范围。→ Mitigation: 仅在没有源 artifact 器械边界、没有 patch 目标器械边界、没有正向可用器械事实时生效；已有 artifact / candidate evidence 继续优先。

## Migration Plan

1. 更新 OpenSpec delta specs 和 tasks。
2. 在 Agent prompt 和 `searchExercises` 工具说明中加入默认无器械规则。
3. 在 Agent `searchExercises` 输入归一化处实现执行型候选默认无器械。
4. 在 routine / plan 生成工具入口同步补齐 intent / strategy 的默认器械边界。
5. 调整长期 plan 门控，不再因缺少器械或场地追问。
6. 补充单测和黑盒 flow 期望，运行相关测试、`npm run typecheck` 和 `openspec validate default-unspecified-equipment-to-no-equipment --strict`。

## Open Questions

无。
