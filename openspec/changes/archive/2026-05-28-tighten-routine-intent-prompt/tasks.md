## 1. Prompt 调整

- [x] 1.1 收紧 `/api/chat` 意图解析 prompt，明确“目标 + 单次时长 + 器械/场地条件”必须返回顶层 `type = "routine"`。
- [x] 1.2 明确 `exercise_recommendation` 只能用于纯动作推荐或换一批动作，不得与本次训练编排语义混用。

## 2. 测试与验证

- [x] 2.1 增加或更新聊天意图解析相关测试，覆盖“练腿，20分钟，没有器械”触发 `workout_routine`。
- [x] 2.2 运行相关自动化测试，并运行 OpenSpec strict 校验。
