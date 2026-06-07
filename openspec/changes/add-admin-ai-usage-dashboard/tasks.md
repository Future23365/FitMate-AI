## 1. 数据模型和迁移

- [ ] 1.1 设计 `AiTokenUsageEvent` Prisma model，包含 `userId`、`conversationId`、`messageId`、`runId`、`modelCallId`、`source`、loop / planner index、provider、model、status、输入 token、输出 token、总 token、错误 code 和 `createdAt`。
- [ ] 1.2 为 usage ledger 添加聚合查询需要的索引和幂等唯一键，覆盖 `userId + createdAt`、`conversationId + createdAt`、`runId` 和单次 model call 去重。
- [ ] 1.3 生成并检查 Prisma migration，确认时间字段使用无歧义 `timestamptz`，历史数据不做 token 回填。
- [ ] 1.4 更新 Prisma Client 生成结果，并确认新增表不会影响现有 `User`、`ChatSession`、`ChatMessage` 保存链路。

## 2. 后台权限和配置

- [ ] 2.1 新增集中配置模块 `lib/server/config/admin-config.ts`，解析管理员 userId 配置，并为未来邮箱 / role 权限模型保留清晰边界。
- [ ] 2.2 新增统一 admin guard，复用当前用户认证结果，再校验管理员配置；未登录返回 401，非管理员返回 403。
- [ ] 2.3 确保后台页面和后台数据 route / service 只通过 admin guard 授权，不在 UI 或 route 中复制环境变量解析和权限判断。
- [ ] 2.4 增加 admin guard 单元测试，覆盖未登录用户、普通用户、管理员和未配置管理员时默认拒绝访问。

## 3. 生产 usage ledger 写入

- [ ] 3.1 新增 `lib/server/ai-usage/usage-ledger-service.ts` 或等价模块，封装 usage event 记录、幂等写入、未知 usage 状态和写入失败隔离。
- [ ] 3.2 为 usage recording service 添加中文意图注释，说明它是生产模型调用账本，不属于 Trace 诊断层。
- [ ] 3.3 在 Agent planner 每次模型调用完成并归一化 `ModelTokenUsage` 后记录 usage event，包含 `runId`、`userId`、`conversationId`、`messageId`、loop / planner index、model、source 和 token 字段。
- [ ] 3.4 覆盖 repair / invalid action 后的额外 planner 调用，确保同一次用户请求中的每次模型调用都单独记账。
- [ ] 3.5 在 terminal failure finalizer 模型调用完成后记录 usage event，并用独立 `source` 区分 planner 调用。
- [ ] 3.6 确保 provider 返回 usage 但后续 parse / validation 失败时仍记录已消耗 token；provider 无 usage 时记录未知状态，不伪装为真实 0。
- [ ] 3.7 确保 usage ledger 写入失败只记录服务端错误，不阻断 `/api/chat` 用户可见响应或失败收口。
- [ ] 3.8 确认 Trace 仍可展示诊断 usage 摘要，但后台统计不读取 Trace、内存 store、`codex_logs` 或 `ChatMessage.metadata`。

## 4. 后台查询服务

- [ ] 4.1 新增后台查询 service，提供全站 overview 投影，包含用户数、会话数、消息数、输入 token、输出 token 和总 token。
- [ ] 4.2 新增用户列表投影，按用户展示身份摘要、创建时间、会话数、消息数、输入 token、输出 token 和总 token，并支持分页或默认 limit。
- [ ] 4.3 新增用户详情投影，展示该用户会话列表、每个会话 token 汇总和基础聊天统计。
- [ ] 4.4 新增会话详情投影，展示聊天消息和 run / loop / model call token 明细。
- [ ] 4.5 确保后台 UI 只消费 admin service 投影，不直接依赖 Prisma include shape、usage ledger 原始 shape 或 Trace shape。

## 5. 简易后台页面

- [ ] 5.1 新增 `/admin` 只读后台页面，经过 admin guard 后展示全站 token 汇总和用户列表入口。
- [ ] 5.2 新增用户详情或查询参数视图，展示用户信息、会话列表和用户级输入 / 输出 / 总 token。
- [ ] 5.3 新增会话详情或查询参数视图，展示聊天消息、run 汇总、loop / model call 明细和 finalizer 等非 planner 调用。
- [ ] 5.4 后台页面保持简易，只读展示；不提供删除用户、删除聊天、编辑资料、封禁、导出敏感内容等写操作。
- [ ] 5.5 页面展示未知 usage 和真实 0 token 的区别，避免把 provider 未返回 usage 误读为 0 消耗。
- [ ] 5.6 页面使用项目现有 UI / shadcn 基础组件和浅色 PC 响应式布局，避免引入新的视觉系统或 dev server 依赖。

## 6. 测试与验证

- [ ] 6.1 增加 usage ledger service tests，覆盖成功写入、幂等去重、部分 usage、无 usage、写入失败隔离。
- [ ] 6.2 增加 Agent planner 多 loop / 多 model call 统计测试，断言每次调用单独落库并能聚合输入 / 输出 / 总 token。
- [ ] 6.3 增加 repair / invalid action 后额外 planner call 的 usage 统计测试。
- [ ] 6.4 增加 terminal failure finalizer usage 统计测试，断言 `source` 和聚合结果正确。
- [ ] 6.5 增加 admin 查询 service tests，覆盖 overview、用户列表、用户详情、会话详情和未知 usage 展示投影。
- [ ] 6.6 增加后台页面或 route 测试，覆盖未登录、普通用户、管理员访问，以及页面只读展示关键字段。
- [ ] 6.7 运行 `openspec validate add-admin-ai-usage-dashboard --strict`。
- [ ] 6.8 修改 Prisma / TypeScript / React / API 后运行 `npm run typecheck` 和相关自动化测试；涉及迁移或服务端 / 客户端边界时按需运行 `npm run build`。
