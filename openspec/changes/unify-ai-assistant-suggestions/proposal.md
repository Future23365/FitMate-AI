## Why

当前聊天建议回复散落在 `suggestedReplies`、`clarificationReplies`、`adjustmentReplies`、artifact 失败恢复建议等多个字段中，前端和 trace 需要理解多套来源语义。与此同时，部分建议出现“请重新说明你的训练目标、时间和器械条件”这类 AI 对用户说话的口吻，不适合作为用户点击后发送的回复。

本 change 将 AI 建议收敛为统一的 `assistantSuggestions` 交互模型：建议内容由对应阶段的 LLM 生成，服务端只负责统一结构、来源标记、口吻约束、事实校验和兼容输出。

## What Changes

- 新增统一建议模型 `assistantSuggestions`，覆盖缺信息追问、推荐成功后的下一步、训练生成失败后的恢复建议、引用确认和 patch 确认等场景。
- 不默认新增一次独立 suggestion 模型调用；意图解析、动作推荐、routine/plan 生成或修复等已有 LLM 阶段应在自己的结构化输出中顺手产出建议。
- 服务端增加统一归一化边界，将不同阶段的建议候选合并、去重、限量、标记来源，并输出统一流事件。
- 建议点击后发送的 `message` 必须是用户口吻、可直接发送的完整用户表达；禁止“请重新说明……”这类 AI 指令式、追问式或系统口吻文本进入用户可见建议。
- 保留旧字段兼容：短期内 `suggestedReplies`、`clarificationReplies`、`adjustmentReplies` 和 artifact 失败建议可作为输入来源，但对前端的新出口应逐步收敛为 `assistantSuggestions`。

## Capabilities

### New Capabilities

- `assistant-suggestions`: 定义 AI 建议的统一结构、LLM 产出阶段、服务端归一化和用户口吻约束。

### Modified Capabilities

- `api-layer-boundaries`: `/api/chat` 需要统一输出 AI 建议事件，并保持旧建议字段兼容期行为可控。
- `chat-blackbox-flow-regression-fixes`: 补充建议回复口吻和动作推荐成功后下一步建议的回归场景。

## Impact

- 影响聊天编排服务：`lib/server/chat/chat-service.ts` 的建议来源收集、流事件输出、trace 记录和旧字段兼容。
- 影响 AI prompt 配置：`lib/server/ai/prompt-config.ts` 中意图解析、动作推荐、训练生成/修复阶段需要输出符合统一建议 schema 的建议候选。
- 影响前端聊天状态：`features/chat/hooks/use-chat-controller.ts`、`features/chat/components/chat-page.tsx` 需要逐步优先消费 `assistant_suggestions`，并兼容旧事件。
- 影响测试：需要覆盖非用户口吻建议被过滤、缺信息建议、动作推荐成功后的 next action、artifact 失败恢复建议和旧字段兼容。
- 不改变数据库结构，不要求新增默认 LLM 调用，不要求一次性删除旧字段。
