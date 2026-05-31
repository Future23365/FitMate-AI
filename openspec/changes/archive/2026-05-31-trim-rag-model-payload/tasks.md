## 1. 模型 Payload 收敛

- [x] 1.1 精简聊天模型的 `providedExercises` 字段，确认不包含图片、完整候选对象或 trace 诊断字段。
- [x] 1.2 精简动作推荐模型的 `candidateExercises` 字段，删除图片、英文名、中文难度冗余字段和完整候选原因。
- [x] 1.3 精简训练草稿生成/修复模型候选 payload，并降低单类候选传入上限。

## 2. 验证

- [x] 2.1 补充或更新测试，覆盖模型请求 payload 不包含 `imageUrl`、`imageUrls`、`images`、`nameEn`、`levelZh` 和完整候选原因。
- [x] 2.2 运行相关自动化测试和类型检查，确认卡片展示和训练编排仍能使用服务端完整动作对象。
