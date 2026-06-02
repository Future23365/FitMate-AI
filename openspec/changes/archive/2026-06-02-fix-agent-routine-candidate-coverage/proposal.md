## Why

最新 AI Trace 显示，用户要求把 8 个指定动作编成一套 routine，但 `generateRoutineDraft` 固定按 `warmup / training / stretch` 各挑 1 个动作，最终只保留了 2 个唯一动作，训练量明显不足且仍被保存。

这会破坏“把这批动作编成训练”的用户预期，也暴露出动作阶段元数据推断过粗：`髋伸展` 这类力量动作被 `伸展` 字面命中为拉伸动作。

## What Changes

- 调整 Agent routine draft 生成策略：用户或上游模型明确传入的 `candidateExerciseIds` 必须全部进入 routine，不能被阶段挑选逻辑静默丢弃。
- 当指定动作不足以覆盖 `warmup`、`training`、`stretch` 三段时，系统可以从受控动作库候选中补充热身或拉伸动作；补充动作仍必须来自数据库并纳入候选集合校验。
- 主训练 section 支持多个动作项，并根据动作数量与经验水平生成合理组数、次数、休息和循环配置。
- 修正动作阶段元数据推断，避免将 `髋伸展`、`hip extension` 这类力量训练动作仅因包含 `伸展 / extension` 判为拉伸。
- 补充回归测试，覆盖“8 个指定动作全部保留”“缺少热身/拉伸时受控补齐”“髋伸展仍可进入主训练”。

## Capabilities

### New Capabilities

<!-- 无新增 capability，本次修改现有聊天 routine 生成和动作元数据合同。 -->

### Modified Capabilities

- `chat-routine-composition`: routine 生成必须保留用户指定候选动作，并在缺少阶段动作时通过受控补充候选补齐三段式结构。
- `exercise-metadata-pools`: 动作阶段元数据推断需要区分拉伸类动作和力量动作中的“伸展 / extension”字样，避免把髋伸展误归为拉伸。

## Impact

- 影响 `lib/server/agent-orchestrator/workout-tools.ts` 的 `generateRoutineDraft` 草稿生成逻辑。
- 影响 `lib/shared/exercises/metadata.ts` 的动作阶段推断。
- 影响 routine 校验、artifact index 中提取的动作覆盖范围和聊天 routine 卡片实际展示内容。
- 需要更新 `tests/agent-orchestrator.test.ts`、`tests/workout-plan-validation.test.ts` 或相关测试，覆盖新的候选覆盖与元数据边界。
