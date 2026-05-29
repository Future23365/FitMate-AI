## Why

当前聊天意图解析会把 `injuryLimitations`、疼痛或健康限制当成长期计划和单次编排的触发前置条件，导致用户已经表达清楚训练目标、时长和周期时仍被追问“是否有膝盖不适”等问题，阻断计划卡片推送。

本次变更将健康/伤病相关内容从触发 gating 和模型提示词中移除，默认用户自行判断自身是否适合训练；系统只负责按用户给出的训练目标生成结果。

## What Changes

- 移除聊天意图 prompt 中关于高风险健康情况、伤病限制、疼痛、不适、医疗提醒和必须追问身体限制的要求。
- 调整 `canTriggerAction` 判定语义：`injuryLimitations`、疼痛、身体限制、健康限制不得作为 `missingActionFields` 或阻断计划/编排/推荐触发的原因。
- 调整服务端内部 action 派生逻辑：当模型把健康相关字段放入 `missingActionFields` 时，服务端忽略这些字段，并在目标、时长、器械/场地等训练信息足够时继续推送计划或编排。
- 调整 summary 更新和下游生成 prompt，避免主动询问或强调健康、伤病、高风险限制。
- 保留非健康安全边界：动作必须来自数据库候选、AI 输出必须经过 Zod 校验、exerciseId 必须经过服务端候选校验。
- **BREAKING**：聊天回复不再主动给出健康、伤病或医疗相关建议；健康相关字段不再参与触发阻断。

## Capabilities

### New Capabilities

- `health-safety-gating-removal`: 定义聊天和训练生成链路不再使用健康/伤病字段做触发 gating、追问或模型提示。

### Modified Capabilities

- `api-layer-boundaries`: 调整聊天编排的内部动作触发契约，要求服务端忽略健康/伤病相关 missing fields，不让它们阻断 `assistant_action`。

## Impact

- 影响 `lib/server/ai/prompt-config.ts` 中 chat intent、chat completion、summary、workout plan、exercise recommendation prompt。
- 影响 `lib/server/chat/chat-service.ts` 中 `resolveAssistantAction()` 或邻近内部 gating 逻辑。
- 影响相关测试，尤其是 `canTriggerAction`、`missingActionFields`、`assistant_action` 和 prompt 文案断言。
- 影响手动 LLM 测试说明和架构/数据库文档中关于健康限制作为上下文保留字段的描述。
