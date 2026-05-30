## Why

用户在已经给出目标、时长、频率和无器械条件后，只是没有明确说明训练经验，系统仍然阻断计划推送，导致聊天回复说会整理计划但没有实际推送结果。这个问题会让“补充一个训练条件后继续生成”的对话链路显得不可靠。

## What Changes

- 当用户没有明确说明经验水平，但训练目标、时长、频率、器械或场地等核心生成条件已经足够时，系统 SHALL 默认按 `beginner` / 简单训练推送结果。
- `experience` 缺失或模型把 `experience` 写入 `missingActionFields` 时，不得单独阻断 `exercise_recommendation`、`routine` 或 `workout_plan` 内部动作事件。
- 服务端 SHALL 继续使用更保守的新手强度、动作候选过滤和校验边界，避免因为默认经验而生成高风险或高难度训练。
- 当内部动作未触发时，用户可见回复 SHALL 与实际状态一致，不能说“我先整理计划”但没有推送内部动作。

## Capabilities

### New Capabilities
- `chat-default-beginner-action-trigger`: 定义聊天动作触发门控中经验缺失的默认新手策略，以及回复状态一致性要求。

### Modified Capabilities
- `chat-routine-composition`: 单次训练编排在经验未明确时仍应按新手默认触发，并生成简单 routine。
- `plan-push-composition`: 长期计划在经验未明确时仍应按新手默认触发，并生成简单周期计划。

## Impact

- 影响 `lib/server/chat/chat-service.ts` 中 `missingActionFields` 到内部动作事件的服务端兜底判断。
- 影响 `lib/server/ai/prompt-config.ts` 中意图解析和回复生成的提示边界。
- 需要补充 `tests/chat-service.test.ts` 或等价测试，覆盖 `experience` 缺失但核心条件足够时仍触发 `workout_routine` / `workout_plan`。
- 不涉及数据库结构、Prisma Schema、公开 API 契约或依赖升级。
