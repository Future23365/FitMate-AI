## Implementation

- [x] 1. 扩展训练动作类型和 Zod schema，让 `WorkoutItem` 支持可选 `imageUrls`，并在归一化中兼容旧数据。
- [x] 2. 更新动作库到训练动作的转换路径，确保新编排和保存计划写入完整 `imageUrls`。
- [x] 3. 重构 `/training` 动作示范区域，按当前步骤计时派生当前示范图并循环展示全部图片。
- [x] 4. 补充或更新相关测试，覆盖 `imageUrls` 归一化和旧数据兼容。
- [x] 5. 运行相关检查，确认 TypeScript、lint 或测试无新增错误。
