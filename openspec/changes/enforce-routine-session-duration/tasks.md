## 1. 服务端校验与恢复

- [x] 1.1 在训练草稿校验中新增目标时长明显不足的 `session_too_short` 问题，并确保 routine 实际估算低于目标超过容差时不能直接通过。
- [x] 1.2 更新校验恢复分类、引导文案和建议回复，让 `session_too_short` 进入可恢复流程并提示补足训练量。
- [x] 1.3 更新自动修复 prompt，让时长不足时优先增加主训练容量，时长过长时继续压缩容量。

## 2. 测试与验证

- [x] 2.1 补充 workout plan validation 测试，覆盖 40 分钟目标但实际约 25 分钟的 routine 被判定为时长不足。
- [x] 2.2 补充 validation recovery / repair prompt 测试，覆盖 `session_too_short` 的恢复策略和补足训练量指令。
- [x] 2.3 运行相关自动化测试，并按需运行 `npm run typecheck`；记录无法运行的检查原因。
