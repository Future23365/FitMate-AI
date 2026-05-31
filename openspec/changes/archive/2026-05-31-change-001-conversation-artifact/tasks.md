## 1. 数据模型与类型

- [x] 1.1 在 Prisma schema 中新增 `ConversationArtifact` 和 `ArtifactIndex`，包含 user/session/message、kind/scope、payload version、status、revision 和索引字段。
- [x] 1.2 增加 artifact payload、artifact index、artifact status 和 artifact scope 的 TypeScript 类型与 Zod 校验。
- [x] 1.3 增加 payload schema version 分发入口，确保不同 `kind` 的 payload 读取时经过服务端校验。

## 2. Artifact Service

- [x] 2.1 新增 Artifact Service，封装创建 artifact、创建索引、读取 artifact、更新来源实体和创建 revision。
- [x] 2.2 创建索引生成器，从动作推荐、routine、plan payload 中提取标题、摘要、exerciseIds、目标、肌群、器械、时长和频率字段。
- [x] 2.3 实现 userId 权限过滤，确保 artifact 和 index 读取只返回当前用户数据。

## 3. 聊天卡片接入

- [x] 3.1 在动作推荐卡片成功推送后创建 `kind = "exercise_recommendation"` 的 artifact。
- [x] 3.2 在 routine 卡片成功推送后创建 `kind = "routine"` 的 artifact，并保留三段式 section、循环配置和动作参数。
- [x] 3.3 在 plan 卡片成功推送后创建 `kind = "plan"` 的 artifact，并保留训练日、休息日、频率和周期信息。
- [x] 3.4 在用户保存 routine 或 schedule 后，将 artifact 与保存后的来源实体关联。

## 4. 上下文构建边界

- [x] 4.1 扩展会话上下文构建器，提供当前会话 recent artifact summaries。
- [x] 4.2 保持 `conversationSummary` 只作为自然语言摘要，不从 summary 重建完整训练 payload。
- [x] 4.3 为旧消息缺少 artifact 的情况提供安全兜底，避免引用解析读取不存在的 payload。

## 5. 测试与验证

- [x] 5.1 补充 Artifact Service 单元测试，覆盖创建、索引、读取、权限隔离和 revision。
- [x] 5.2 补充聊天推送集成测试，覆盖动作推荐、routine、plan 卡片成功后创建 artifact。
- [x] 5.3 补充旧消息无 artifact 的边界测试。
- [x] 5.4 运行 `npm test`、`npm run typecheck` 和 `npm run lint`；如 Prisma 或构建边界受影响，运行 `npm run build` 或说明无法运行原因。

## 6. 文档记录

- [x] 6.1 在 `docs/方案变更历史` 新增方案变更记录，说明聊天卡片从临时 payload 升级为可引用事实源。
- [x] 6.2 如新增数据库表、迁移或协作方式变化，同步更新相关 README 或架构文档。
