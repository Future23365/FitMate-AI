## Why

训练执行页在休息步骤中虽然预览的是下一个动作，但示范图仍跟随休息计时继续轮换，容易让用户误以为休息期间还需要继续执行动作。休息态应明确表达“准备下一组动作”，并保持示范图静止。

## What Changes

- 休息步骤存在下一个动作时，动作示范区域展示下一个动作，但图片轮换暂停，固定为该动作的准备预览图。
- 休息步骤的示范区标题从当前相关动作改为“下一个动作”语义，避免与当前休息状态冲突。
- 非休息步骤保持现有规则：计次动作按节奏轮换，计时动作默认展示最后一张图，暂停训练时不独立推进。

## Capabilities

### New Capabilities

### Modified Capabilities
- `workout-session-demo-carousel`: 收紧休息步骤的示范图规则，要求休息期间预览下一个动作时不轮换图片，并以“下一个动作”提示用户。

## Impact

- 影响 `features/workouts/components/workout-session-page.tsx` 的示范图选择和休息态文案。
- 影响 `openspec/specs/workout-session-demo-carousel/spec.md` 对休息态示范图行为的描述。
- 不涉及 API、数据库、AI 输出结构或依赖变更。
