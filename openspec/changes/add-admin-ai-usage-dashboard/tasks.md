## 1. 数据模型和迁移

- [x] 1.1 设计 `AiTokenUsageSummary` Prisma model，包含 `userId`、`conversationId`、`messageId`、输入 token、输出 token、总 token、`createdAt` 和 `updatedAt`。
- [x] 1.2 为 usage summary 添加聚合查询需要的索引和幂等唯一键，覆盖 `userId + createdAt`、`conversationId + createdAt`、`messageId` 和请求 / 消息级去重。
- [x] 1.3 生成并检查 Prisma migration，确认时间字段使用无歧义 `timestamptz`，历史数据不做 token 回填。
- [x] 1.4 更新 Prisma Client 生成结果，并确认新增表不会影响现有 `User`、`ChatSession`、`ChatMessage` 保存链路。

## 2. 后台权限和配置

- [x] 2.1 新增集中配置模块 `lib/server/config/admin-config.ts`，解析管理员 userId 配置，并为未来邮箱 / role 权限模型保留清晰边界。
- [x] 2.2 新增统一 admin guard，复用当前用户认证结果，再校验管理员配置；未登录返回 401，非管理员返回 403。
- [x] 2.3 确保后台页面和后台数据 route / service 只通过 admin guard 授权，不在 UI 或 route 中复制环境变量解析和权限判断。
- [x] 2.4 增加 admin guard 单元测试，覆盖未登录用户、普通用户、管理员和未配置管理员时默认拒绝访问。

## 3. 生产 usage summary 写入

- [x] 3.1 新增 `lib/server/ai-usage/usage-summary-service.ts` 或等价模块，封装请求 / 消息级 token 汇总、幂等写入和写入失败隔离。
- [x] 3.2 为 usage recording service 添加中文意图注释，说明它是生产 token 汇总表写入入口，不属于 Trace 诊断层。
- [x] 3.3 在聊天请求链路中读取已归一化的 `ModelTokenUsage`，按 `userId`、`conversationId`、`messageId` 累计输入 token、输出 token 和总 token。
- [x] 3.4 覆盖 repair / invalid action 后的额外模型调用，确保它们的 token 被合并进同一次请求 / 消息汇总，而不是单独落内部 loop 明细。
- [x] 3.5 覆盖 terminal failure finalizer 等同一聊天响应内的额外模型调用，确保可获取的 token 被纳入同一汇总，不保存独立 `source` 明细。
- [x] 3.6 确保 provider 返回 usage 但后续 parse / validation 失败时仍尽量计入已消耗 token；provider 无 usage 时不得伪装为真实 0。
- [x] 3.7 确保 usage summary 写入失败不阻断 `/api/chat` 用户可见响应或失败收口，且本 change 不新增错误日志或错误明细保存要求。
- [x] 3.8 确认 Trace 仍可展示诊断 usage 摘要，但后台统计不读取 Trace、内存 store、`codex_logs` 或 `ChatMessage.metadata`。

## 4. 后台查询服务

- [x] 4.1 新增后台查询 service，提供全站 overview 投影，包含用户数、会话数、消息数、输入 token、输出 token 和总 token。
- [x] 4.2 新增用户列表投影，按用户展示身份摘要、创建时间、会话数、消息数、输入 token、输出 token 和总 token，并支持分页或默认 limit。
- [x] 4.3 新增用户详情投影，展示该用户会话列表、每个会话 token 汇总和基础聊天统计。
- [x] 4.4 新增会话详情投影，展示聊天消息和消息 / 请求级 token 汇总。
- [x] 4.5 确保后台 UI 只消费 admin service 投影，不直接依赖 Prisma include shape、usage summary 原始 shape 或 Trace shape。

## 5. 简易后台页面

- [x] 5.1 新增 `/admin` 只读后台页面，经过 admin guard 后展示全站 token 汇总和用户列表入口。
- [x] 5.2 新增用户详情或查询参数视图，展示用户信息、会话列表和用户级输入 / 输出 / 总 token。
- [x] 5.3 新增会话详情或查询参数视图，展示聊天消息和消息 / 请求级 token 汇总。
- [x] 5.4 后台页面保持简易，只读展示；不提供删除用户、删除聊天、编辑资料、封禁、导出敏感内容等写操作。
- [x] 5.5 页面展示未知 usage 和真实 0 token 的区别，避免把 provider 未返回 usage 误读为 0 消耗。
- [x] 5.6 页面使用项目现有 UI / shadcn 基础组件和浅色 PC 响应式布局，避免引入新的视觉系统或 dev server 依赖。

## 6. 测试与验证

- [x] 6.1 增加 usage summary service tests，覆盖成功写入、幂等去重、部分 usage、无 usage、写入失败隔离。
- [x] 6.2 增加多次内部模型调用的 token 合并统计测试，断言同一次请求 / 消息只形成汇总结果并正确计算输入 / 输出 / 总 token。
- [x] 6.3 增加 repair / invalid action 后额外模型调用的 usage 合并统计测试。
- [x] 6.4 增加 terminal failure finalizer usage 合并统计测试，断言可获取 token 被纳入请求 / 消息级汇总。
- [x] 6.5 增加 admin 查询 service tests，覆盖 overview、用户列表、用户详情、会话详情和未知 usage 展示投影。
- [x] 6.6 增加后台页面或 route 测试，覆盖未登录、普通用户、管理员访问，以及页面只读展示关键字段。
- [x] 6.7 运行 `openspec validate add-admin-ai-usage-dashboard --strict`。
- [x] 6.8 修改 Prisma / TypeScript / React / API 后运行 `npm run typecheck` 和相关自动化测试；涉及迁移或服务端 / 客户端边界时按需运行 `npm run build`。
