## 1. OpenSpec

- [x] 1.1 补充 `workout-session-voice-broadcast` delta spec，明确语音按钮只负责打开和关闭。
- [x] 1.2 验证 OpenSpec change 结构和规格内容。

## 2. Voice Toggle Implementation

- [x] 2.1 移除 `WorkoutSessionPage` 中由 `needs-activation` / `failed` 驱动的语音按钮重试分支。
- [x] 2.2 调整语音按钮 label 和样式，让开启状态统一表示“关闭语音播报”，不再提示“启动语音播报”。
- [x] 2.3 保留开始按钮中的当前步骤语音激活逻辑，确保刷新后点击开始仍可播报训练步骤。

## 3. Tests and Validation

- [x] 3.1 补充或调整语音控制测试，覆盖等待激活或失败状态下点击语音按钮会关闭语音。
- [x] 3.2 运行相关语音测试。
- [x] 3.3 运行 `npm run lint`、`npm run typecheck` 和 `npm test`。
