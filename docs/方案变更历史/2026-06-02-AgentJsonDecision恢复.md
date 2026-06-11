# Agent JSON Decision 恢复

时间：2026-06-02 12:28:07 CST

## 当前真实问题

真实 trace 显示，用户同样请求“今天想练上肢，30 分钟，有哑铃，帮我安排一套”时，Agent 前两轮已经成功完成 `searchExercises` 和 `generateRoutineDraft`，并产出可继续校验的 `draftId`。第三轮模型也选择了正确的 `validateRoutineDraft` 工具，但输出末尾额外多了一个 `}`，导致严格 `JSON.parse` 返回 `invalid_json`。

这个失败不是训练计划生成失败，也不是候选为空，而是模型 JSON 边界波动。当前 runtime 对普通 `invalid_json` 直接收敛成 `model_output_invalid`，所以用户只能看到“这次执行没有完成，我没有生成或修改训练结果。”。

## 调整思路

这次不做服务端语义兜底，不根据用户原文判断 routine，也不恢复旧 intent-first。修复点只放在 Agent JSON 解析边界：

- 严格解析失败后，尝试提取唯一完整的 JSON object。
- 支持尾随多余 `}`、fenced JSON 和 JSON 前后包裹文本。
- 恢复后的对象仍必须经过 `AgentToolDecision` Schema、registry 工具名和工具输入 Schema 校验。
- 多个 JSON object、截断、不平衡或恢复后 schema 非法时，仍走可诊断失败。

## 关键改动

- `parseAgentJsonObject()` 新增非语义 JSON object 边界恢复，并返回 `recovery` 诊断元数据。
- `/api/chat` 的 DeepSeek Agent decision trace 在恢复成功时记录 `parseStatus: "recovered"` 和 `jsonRecovery`，保留原始严格解析失败详情。
- `parseJsonObject()` 复用同一恢复逻辑，避免聊天服务和 Agent registry 解析行为分叉。
- 单元测试覆盖尾随 `}` 的 `validateRoutineDraft` 决策、包裹文本恢复、多个 JSON object 不恢复、恢复后未知工具仍失败。

## 为什么不是最小补丁

只在失败文案或 runtime 里硬重试会掩盖真实边界，也会增加额外模型成本。当前方案把修复收敛在 JSON 文本边界：能恢复日志中的一字符波动，又不会合成工具调用、改写用户语义或绕过 schema。

## 预期效果

同类 trace 中，模型返回 `{"action":"call_tool","toolName":"validateRoutineDraft",...}}` 时，系统会恢复为合法工具决策并继续进入 Validator / Policy / Save 链路。恢复事件会留在 trace 中，后续仍可观察模型格式波动频率。
