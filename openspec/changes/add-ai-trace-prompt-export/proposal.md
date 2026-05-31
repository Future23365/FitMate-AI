## Why

AI Trace 现在可以保存完整链路 log，但完整 trace 包含候选动作、校验结果、模型 payload 和内部 metadata，不适合直接作为后续回归测试的人工输入样本。需要在调试页提供一个更窄的导出入口，只记录用户连续提问和最终给用户看的文本回答，方便快速复盘和沉淀回归案例。

## What Changes

- 在 `/dev/ai-traces` 的「保存全链路log」左侧新增「保存用户问答记录」按钮。
- 保存用户问答记录时，输出到 `codex_logs/prompt.js`，格式清晰、可读、适合后续手工复制为回归样本。
- 导出内容只包含本轮 trace 可见的用户问题历史和最终文本回答，不包含动作卡片、训练计划卡片、候选动作池、校验详情或完整 trace payload。
- 保持现有「保存全链路log」功能和 `codex_logs/ai_trace_log.js` 输出不变。

## Capabilities

### New Capabilities

### Modified Capabilities
- `ai-trace-debugger`: `/dev/ai-traces` 新增用户问答记录导出能力。

## Impact

- 影响 `components/dev/ai-trace-viewer.tsx`：新增按钮、保存状态、用户问答记录 payload 提炼逻辑。
- 影响 `app/api/dev/ai-traces/route.ts`：根据保存类型选择写入 `ai_trace_log.js` 或 `prompt.js`。
- 影响 OpenSpec `ai-trace-debugger` 规格和任务清单。
- 不涉及生产用户流程、数据库结构、AI 编排规则或外部依赖。
