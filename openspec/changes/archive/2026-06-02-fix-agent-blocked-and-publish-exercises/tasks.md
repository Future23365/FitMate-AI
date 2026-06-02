## 1. 动作发布态数据

- [x] 1.1 将 `data/exercises.zh.json` 中所有动作的 `isPublished` 改为 `true`，不改变其他动作字段。
- [x] 1.2 更新 `scripts/seed-exercises.mjs`，让缺省 `isPublished` 写入 `true`，同时保留显式值。

## 2. Agent blocked 合同修复

- [x] 2.1 更新 Agent tool decision / final result prompt 示例，明确 `blocked` 必须包含 `blockReason`。
- [x] 2.2 在 Agent decision 解析边界增加窄范围规范化：仅将 `blocked.replyContext.reply` 转成 `blocked.blockReason`。

## 3. 测试与验证

- [x] 3.1 增加或更新动作检索测试，验证发布态弹力带新手臀腿动作可被召回。
- [x] 3.2 增加或更新 Agent Orchestrator 测试，验证旧形态 `blocked` 会规范化为合法 `blockReason` 并被 Response Writer 投影。
- [x] 3.3 运行相关测试和类型检查，记录结果。
