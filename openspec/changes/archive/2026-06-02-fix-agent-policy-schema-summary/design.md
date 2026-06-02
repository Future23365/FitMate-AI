## Context

`AgentToolRegistry.listModelDefinitions()` 使用 `z.toJSONSchema()` 暴露工具输入 Schema。普通 object schema 会在根级提供 `properties` / `required`，现有 `summarizeJsonSchemaFields()` 能正确摘要。

`evaluatePolicy` 使用 `z.discriminatedUnion("policyTarget", [...])`，转换后的 JSON Schema 是根级 `oneOf`。每个分支才有 `properties` / `required`，根级没有。因此瘦身逻辑输出 `inputFields: []`，模型无法看到：

- `policyTarget="new_artifact"`
- `artifactKind` 必填且只能是 `routine | plan`
- `draftId` 必填

## Goals / Non-Goals

**Goals:**
- 对 `oneOf` / `anyOf` 工具 Schema 保留每个变体的字段摘要。
- 保留判别字段的 `const` 值，便于模型选择正确分支。
- 继续保持模型输入瘦身，不发送完整深层 schema。
- 用测试覆盖 `evaluatePolicy` 的 `new_artifact` 分支。

**Non-Goals:**
- 不改变 `evaluatePolicy` 的服务端执行合同。
- 不让模型提交完整 draft 或 policy payload。
- 不恢复旧 intent-first 保存路径。

## Decisions

1. 在 `inputFields` 中表示 union 变体。

   对根级 `oneOf` / `anyOf`，`summarizeJsonSchemaFields()` 返回多个变体摘要，每个变体包含 `variant` 和 `fields`。这样保持结构紧凑，同时不会丢失必填字段。

2. 字段摘要保留 `const`。

   `policyTarget` 在 union 分支中通常以 `const` 表示。保留 `const` 后，模型可以明确知道 `new_artifact` 分支对应哪些字段。

3. Prompt 给出首次 artifact policy 的完整输入形态。

   仅修 schema 摘要仍可能不足以约束模型。Agent tool decision prompt 应明确说明首次生成 routine / plan 后调用：

   `{ "policyTarget": "new_artifact", "artifactKind": "routine" | "plan", "draftId": "..." }`

## Risks / Trade-offs

- [Risk] 模型输入略微变长。→ 只摘要 union 分支字段，不发送完整 schema，增长可控。
- [Risk] 影响普通 object schema 摘要。→ 普通根级 `properties` 仍走原逻辑。
- [Risk] 模型仍可能传错字段。→ 服务端 Schema 仍是最终边界，测试覆盖模型可见摘要不再为空。
