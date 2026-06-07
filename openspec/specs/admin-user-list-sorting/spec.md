# admin-user-list-sorting Specification

## Purpose
TBD - created by archiving change add-admin-user-list-sorting. Update Purpose after archive.
## Requirements
### Requirement: 后台用户列表必须展示最后回复时间

后台用户列表 SHALL 为每个用户展示 `最后回复时间`，该时间表示该用户最近一次聊天活动时间；没有会话活动时 MUST 显示空状态，不得伪造当前时间或创建时间。

#### Scenario: 用户存在最近会话活动

- **WHEN** 管理员查看后台用户列表且某用户存在至少一个聊天会话
- **THEN** 用户列表展示该用户最近会话活动时间作为最后回复时间

#### Scenario: 用户没有会话活动

- **WHEN** 管理员查看后台用户列表且某用户没有任何聊天会话
- **THEN** 用户列表在最后回复时间列展示空状态
- **AND** 后台投影中的 `lastReplyAt` 为 `null`

### Requirement: 后台用户列表必须支持服务端排序

后台用户列表 SHALL 支持按 `createdAt`、`lastReplyAt`、`conversationCount`、`messageCount` 和 `totalTokens` 排序，并且排序 MUST 在后台查询 service 中完成；UI 不得仅对当前已返回列表做最终排序。

#### Scenario: 按创建时间排序

- **WHEN** 管理员选择按 `createdAt` 排序
- **THEN** 后台查询 service 按用户创建时间返回排序后的用户列表

#### Scenario: 按最后回复时间排序

- **WHEN** 管理员选择按 `lastReplyAt` 排序
- **THEN** 后台查询 service 按用户最近聊天活动时间返回排序后的用户列表
- **AND** 没有最后回复时间的用户排在有时间用户之后

#### Scenario: 按 token 总量排序

- **WHEN** 管理员选择按 `totalTokens` 排序
- **THEN** 后台查询 service 按用户 token 总量返回排序后的用户列表
- **AND** 未知 token 总量的用户排在已知 token 总量用户之后

#### Scenario: 按会话数排序

- **WHEN** 管理员选择按 `conversationCount` 排序
- **THEN** 后台查询 service 按用户会话数量返回排序后的用户列表

#### Scenario: 按消息数排序

- **WHEN** 管理员选择按 `messageCount` 排序
- **THEN** 后台查询 service 按用户消息数量返回排序后的用户列表

### Requirement: 后台排序必须支持升序和降序

后台用户列表 SHALL 对每个支持排序的字段提供 `asc` 和 `desc` 两个方向；非法排序字段或方向 MUST 回退到 `createdAt desc`。

#### Scenario: 选择升序

- **WHEN** 管理员选择任一支持字段的 `asc` 排序
- **THEN** 后台页面和 JSON API 使用升序返回用户列表

#### Scenario: 选择降序

- **WHEN** 管理员选择任一支持字段的 `desc` 排序
- **THEN** 后台页面和 JSON API 使用降序返回用户列表

#### Scenario: 非法排序参数

- **WHEN** 管理员请求后台页面或 JSON API 时传入非法 `sortBy` 或 `sortDirection`
- **THEN** 系统使用 `createdAt desc` 作为默认排序
