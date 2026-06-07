## ADDED Requirements

### Requirement: 生产环境必须持久化 AI 模型调用 usage ledger

系统 SHALL 使用独立的生产数据库账本记录每一次真实 AI 模型调用的 token usage，并且该账本不得依赖 Trace、开发态内存 store、导出日志或 `ChatMessage.metadata`。

#### Scenario: 成功记录单次模型调用

- **WHEN** 服务端完成一次 AI 模型调用且 provider 返回 usage
- **THEN** 系统在 usage ledger 中记录一条模型调用事件
- **AND** 事件包含 `userId`、`runId`、`source`、`provider`、`model`、`status`
- **AND** 事件分别保存输入 token、输出 token 和总 token

#### Scenario: 生产关闭 Trace 时仍记录 usage

- **WHEN** 生产环境未开启 Trace 或 `isAiTraceEnabled()` 返回 false
- **THEN** 系统仍然将真实模型调用 usage 写入生产 usage ledger
- **AND** 后台 token 汇总不得依赖 `/dev/ai-traces`、内存 Trace store 或导出的 `codex_logs`

#### Scenario: 聊天消息保存或重写不影响 usage 账本

- **WHEN** 聊天历史通过 `ChatSession` / `ChatMessage` 被保存、重写或重新读取
- **THEN** 系统不得从 `ChatMessage.metadata` 推断生产 token usage
- **AND** 已记录的 usage ledger 事件不得因为聊天消息整段保存而丢失或被重算

### Requirement: usage ledger 必须覆盖 Agent Loop 的每一次模型调用

系统 SHALL 按模型调用粒度记录 usage，而不是只按用户请求、用户消息或助手可见回复记录 usage。

#### Scenario: 一次聊天请求包含多个 Agent loop

- **WHEN** 一次用户聊天请求触发多个 Agent planner loop
- **THEN** 系统为每一次 planner 模型调用分别记录 usage event
- **AND** 每条 usage event 包含可用于区分 loop 或 planner call 的字段，例如 `loopTurn`、`runtimeStep` 或 `plannerCallIndex`
- **AND** 后台可以把这些调用聚合为同一个 `runId` 的总输入 token、总输出 token 和总 token

#### Scenario: repair 或非法 action 后继续调模型

- **WHEN** Agent 因 schema validation、action validation、repair 或其他可恢复原因再次调用模型
- **THEN** 系统将每一次额外模型调用独立记录为 usage event
- **AND** 后台明细可以展示这些调用属于同一次 run 的不同 planner call

#### Scenario: finalizer 单独调用模型

- **WHEN** terminal failure finalizer 或其他非 planner 组件单独调用模型
- **THEN** 系统使用同一 usage ledger 记录该模型调用
- **AND** 事件的 `source` 明确区分为 `terminal_failure_finalizer` 或对应来源
- **AND** 后台聚合时将其计入用户、会话和 run 的 token 总量

### Requirement: usage ledger 必须分别保存输入 token、输出 token 和总 token

系统 SHALL 分别保存 provider usage 中归一化后的输入 token、输出 token 和总 token，并在后台聚合中分别展示。

#### Scenario: provider 返回完整 usage

- **WHEN** provider response 包含可归一化的 `prompt_tokens`、`completion_tokens` 和 `total_tokens`
- **THEN** usage ledger 保存对应的 `promptTokens`、`completionTokens` 和 `totalTokens`
- **AND** 后台展示中分别显示输入 token、输出 token 和总 token

#### Scenario: provider 只返回部分 usage

- **WHEN** provider response 只返回输入 token、输出 token 或总 token 的一部分
- **THEN** usage ledger 保存已知 token 字段
- **AND** 后台展示不得把未知字段伪装为真实 0
- **AND** 后台明细必须能区分未知 usage 和真实 0 token

#### Scenario: provider 调用失败且无 usage

- **WHEN** 模型调用因超时、网络错误、provider 错误或无可解析 response 而没有 usage
- **THEN** 系统可以记录 `status = "failed"` 或 `status = "usage_unavailable"` 的 usage event
- **AND** token 字段保持为空或等价未知状态
- **AND** 该事件不得污染真实 token 总量

### Requirement: usage ledger 写入必须幂等且不阻断聊天主流程

系统 SHALL 保证 usage ledger 写入具备幂等边界，并且账本写入失败不得导致用户聊天响应失败。

#### Scenario: 同一次模型调用被重复记录

- **WHEN** 异常恢复、重试或重复执行导致同一个模型调用 usage event 被记录两次
- **THEN** 系统通过 `modelCallId` 或等价唯一键避免重复记账
- **AND** 后台聚合结果不得因重复写入而放大 token 总量

#### Scenario: usage ledger 写入失败

- **WHEN** provider 模型调用已经完成但 usage ledger 写入数据库失败
- **THEN** 聊天主流程继续返回用户可见响应或错误收口
- **AND** 服务端记录账本写入失败日志
- **AND** 后台不得从 Trace 或聊天消息中临时反推该次 usage 作为正式账本

### Requirement: 后台访问必须经过统一 admin guard

系统 SHALL 对所有后台页面和后台数据查询使用统一服务端 admin guard，并且不得默认向普通登录用户开放。

#### Scenario: 未登录用户访问后台

- **WHEN** 未登录用户访问后台页面或后台数据接口
- **THEN** 系统拒绝访问并返回未认证状态
- **AND** 不泄露用户列表、聊天内容或 token usage

#### Scenario: 普通用户访问后台

- **WHEN** 已登录但不在管理员配置中的用户访问后台页面或后台数据接口
- **THEN** 系统拒绝访问并返回无权限状态
- **AND** 不泄露任何其他用户数据

#### Scenario: 管理员访问后台

- **WHEN** 当前用户通过统一 admin guard 校验
- **THEN** 系统允许访问后台只读页面和后台查询服务
- **AND** 管理员身份判断来自集中配置或后续稳定权限模型
- **AND** 页面和 route 不得自行解析环境变量或复制权限判断

### Requirement: 后台必须只读展示用户、聊天内容和 token 聚合

后台 SHALL 提供简易只读页面，展示生产用户、聊天消息和 token usage 聚合，不提供删除、编辑、封禁或导出敏感内容的写操作。

#### Scenario: 查看全站 token 汇总

- **WHEN** 管理员打开后台 overview
- **THEN** 页面展示全站输入 token、输出 token 和总 token
- **AND** 页面展示用户数、会话数、消息数或等价基础运营统计

#### Scenario: 查看用户列表 token 汇总

- **WHEN** 管理员查看后台用户列表
- **THEN** 页面按用户展示 `userId`、显示名、邮箱或匿名身份摘要、创建时间、会话数、消息数
- **AND** 页面按用户展示输入 token、输出 token 和总 token
- **AND** 列表支持分页或等价限制，避免一次性加载所有用户和消息

#### Scenario: 查看用户聊天内容

- **WHEN** 管理员打开某个用户详情或会话详情
- **THEN** 页面展示该用户的会话列表和聊天消息
- **AND** 每条消息展示角色、正文和创建时间
- **AND** 页面不得允许管理员在第一版修改或删除聊天内容

#### Scenario: 查看 run 和 loop 级 token 明细

- **WHEN** 管理员查看某个会话或请求 run 的 token 明细
- **THEN** 页面展示每个 run 的输入 token、输出 token 和总 token
- **AND** 页面展示每次 model call 的 `source`、loop / planner index、model、status、输入 token、输出 token 和总 token
- **AND** terminal finalizer 等非 planner 调用与 planner loop 调用可被区分

### Requirement: 后台查询必须通过稳定 admin service 投影

系统 SHALL 通过后台查询 service 输出稳定投影给 UI，UI 不得直接依赖 Prisma include shape、usage ledger 原始 shape 或 Trace shape。

#### Scenario: UI 获取后台 overview

- **WHEN** 后台页面需要展示全站概览
- **THEN** 页面调用后台查询 service 或对应 Route Handler 获取 overview 投影
- **AND** 投影包含页面需要的统计字段
- **AND** UI 不直接拼接多张 Prisma 表的原始返回结构

#### Scenario: usage ledger 字段未来扩展

- **WHEN** usage ledger 后续新增 `source`、provider metadata、成本字段或其他模型调用属性
- **THEN** 后台 UI 只需要消费 admin service 的稳定投影
- **AND** 不相关 UI 组件不需要认识新增数据库字段

### Requirement: 实现必须提供相关自动化验证

实现 SHALL 提供覆盖 usage ledger、Agent loop、多来源模型调用、admin guard 和后台聚合展示的自动化测试或等价验证。

#### Scenario: Agent loop 多调用统计测试

- **WHEN** 测试构造一次包含多个 planner model call 的 Agent run
- **THEN** 断言 usage ledger 记录多条模型调用事件
- **AND** 聚合结果分别正确计算输入 token、输出 token 和总 token

#### Scenario: finalizer usage 统计测试

- **WHEN** 测试触发 terminal failure finalizer 模型调用
- **THEN** 断言 usage ledger 写入 `source = "terminal_failure_finalizer"` 或等价来源的事件
- **AND** 聚合结果包含该次调用

#### Scenario: admin guard 测试

- **WHEN** 测试分别使用未登录用户、普通用户和管理员访问后台查询
- **THEN** 未登录用户被拒绝
- **AND** 普通用户被拒绝
- **AND** 管理员可以读取只读后台投影
