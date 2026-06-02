## Context

Tool-first Agent 的决策模型每轮会看到由 `buildAgentDecisionModelInput` 生成的 registry 摘要。为了控制 token，系统不会直接发送完整 JSON Schema，而是通过 `summarizeJsonSchemaFields` 生成轻量 `inputFields`。

当前摘要函数只展开顶层 `properties`，数组字段只保留 item 的基础类型和枚举。对于对象字段、record 字段和嵌套数组，模型只能看到外层字段名。例如 `searchExercises.resultRequirements.sectionCoverage` 的真实结构是按 section key 映射到 `{ min: number }` 的 record，但模型摘要里只会显示 `sectionCoverage` 这个字段名，导致模型可能写成 `["warmup", "training", "stretch"]`。类似问题也会影响 `intent`、`strategy`、`patch` 和 `payload` 等复杂工具输入。

## Goals / Non-Goals

**Goals:**
- 在 token 可控的前提下，让模型可见工具摘要保留必要嵌套结构。
- 让对象字段暴露其子字段、required、enum、const、默认值和数组 item 结构。
- 让 record 字段暴露 key/value 合同，尤其是 `sectionCoverage` 这类动态 key 对象。
- 用自动化测试覆盖多个复杂 Agent Tools，避免只修 `searchExercises` 表面问题。

**Non-Goals:**
- 不改变任意 Agent Tool 的真实输入 Schema。
- 不放宽 Zod 校验，也不自动纠正模型输入。
- 不修改 repair runtime 或失败重试策略。
- 不新增关键词、同义词或服务端自然语言语义判断。
- 不发送完整 JSON Schema 给模型。

## Decisions

### Decision 1: 用受控深度递归摘要替代顶层字段摘要

`summarizeJsonSchemaFields` 继续返回轻量结构，但字段摘要会递归保留有限深度内的子结构。默认深度应足够覆盖当前工具的两到三层调用合同，例如：

- `filters.equipment.in`
- `resultRequirements.sectionCoverage.<section>.min`
- `generateRoutineDraft.intent.durationMinutes`
- `generatePlanDraft.strategy`
- `evaluatePolicy` 的 discriminated union 分支

超过深度后只保留字段名、类型、枚举、const、required 和尺寸边界，避免把完整 payload schema 展开成大 prompt。

### Decision 2: 显式摘要 object、record、array 和 union

字段摘要至少区分：

- `object`：保留 `properties` 子字段。
- `record` / `additionalProperties`：保留 `additionalProperties` 的 value 结构。
- `array`：保留 `items` 结构，且 item 可以继续是 object、array 或 enum。
- `oneOf` / `anyOf`：保留分支摘要，继续支持 `evaluatePolicy` 这类 union 工具。

这样模型能看到字段形态，而不是只看到字段名。

### Decision 3: 测试覆盖工具族而不是单个工具

测试不只断言 `searchExercises.allowedSections` 或 `sectionCoverage`，还要覆盖至少一个训练生成工具和一个 policy union 工具。这样能证明修复的是公共摘要能力，而不是对某个字段写死特殊规则。

## Risks / Trade-offs

- 摘要更详细会增加模型输入 token。缓解方式是限制递归深度、每层字段数量和分支数量，并继续不发送完整 schema。
- 某些 payload schema 可能很大。缓解方式是深度截断后只保留结构入口和关键边界，不展开完整业务对象。
- 模型仍可能输出非法 JSON 或违反 schema。该 change 只解决“模型看不到结构”的问题，非法输出仍由现有 Zod 校验和后续 repair runtime 处理。
