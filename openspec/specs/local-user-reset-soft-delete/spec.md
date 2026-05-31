# local-user-reset-soft-delete Specification

## Purpose
TBD - created by archiving change add-local-user-reset-soft-delete. Update Purpose after archive.
## Requirements
### Requirement: 设置页本地用户重置入口
系统 SHALL 在设置页提供清晰、无重复图标的本地用户重置入口，并将该操作呈现为需要确认的危险操作。

#### Scenario: 本地用户区域只显示一个入口图标
- **WHEN** 用户打开设置页并查看“本地用户”区域
- **THEN** 该区域标题左侧 MUST 只显示一个代表本地用户或重置语义的图标
- **AND** 重置按钮左侧 MUST NOT 再重复显示相同或等价图标
- **AND** 页面布局 MUST 保持标题、说明和按钮在桌面端响应式宽度下不互相遮挡

#### Scenario: 点击重置按钮先打开确认弹窗
- **WHEN** 用户点击“重置本地用户”
- **THEN** 系统 MUST 打开二次确认弹窗
- **AND** 系统 MUST NOT 在用户确认前调用 `DELETE /api/auth/local-anonymous`
- **AND** 弹窗 MUST 明确说明当前浏览器会退出旧本地用户并进入新的匿名登录流程
- **AND** 弹窗 MUST 明确说明旧本地用户会被软删除且无法通过当前浏览器继续恢复

#### Scenario: 用户取消重置
- **WHEN** 用户在二次确认弹窗中取消或关闭弹窗
- **THEN** 系统 MUST 保留当前本地用户会话
- **AND** 系统 MUST NOT 调用本地匿名重置接口
- **AND** 设置页 MUST 回到可继续操作状态

#### Scenario: 用户确认重置
- **WHEN** 用户在二次确认弹窗中确认重置
- **THEN** 系统 MUST 调用本地匿名重置接口
- **AND** 确认按钮和重置入口 MUST 在请求进行中禁用，避免重复提交
- **AND** 请求成功后系统 MUST 清空当前运行时用户摘要
- **AND** 系统 MUST 按未认证状态展示本地匿名登录 Dialog 或在下一次私有请求时触发该 Dialog

### Requirement: 本地匿名用户软删除
系统 SHALL 在重置本地用户时软删除当前匿名用户，并保留旧用户关联业务数据用于审计、调试和未来迁移。

#### Scenario: 有效匿名用户执行重置
- **WHEN** `DELETE /api/auth/local-anonymous` 收到带有效匿名 auth cookie 的请求
- **THEN** 服务端 MUST 解析当前匿名用户
- **AND** 服务端 MUST 将该用户标记为软删除
- **AND** 服务端 MUST 清除 `fitmate_local_anonymous` cookie
- **AND** 服务端 MUST NOT 物理删除 `User`、`UserIdentity`、聊天、训练计划、训练日程、训练结果、artifact、memory 或动作反馈数据

#### Scenario: 缺少或无效 cookie 执行重置
- **WHEN** `DELETE /api/auth/local-anonymous` 收到缺少、过期、篡改或已无法解析的匿名 auth cookie
- **THEN** 服务端 MUST 返回稳定成功响应或稳定未认证响应
- **AND** 服务端 MUST 设置清除 `fitmate_local_anonymous` cookie 的响应头
- **AND** 服务端 MUST NOT 创建新的匿名用户
- **AND** 服务端 MUST NOT 根据客户端传入的 userId 软删除任意用户

#### Scenario: 重复执行重置
- **WHEN** 同一个已软删除匿名用户的旧 cookie 再次请求重置或恢复
- **THEN** 系统 MUST 将该用户视为不可恢复
- **AND** 系统 MUST NOT 修改其他未软删除用户
- **AND** 系统 MUST 保持重置接口幂等，不因重复操作导致 500 错误

### Requirement: 软删除用户不可恢复为当前用户
系统 SHALL 阻止已软删除匿名用户通过旧 cookie 恢复为当前用户，并保持所有用户私有数据基于新的当前 `userId` 隔离。

#### Scenario: 旧 cookie 尝试恢复软删除用户
- **WHEN** `POST /api/auth/local-anonymous` 收到指向已软删除匿名用户的旧 cookie
- **THEN** 系统 MUST 返回 `401 unauthenticated`
- **AND** 响应 MUST 清除旧匿名 auth cookie
- **AND** 系统 MUST NOT 返回已软删除用户的最小用户摘要
- **AND** 系统 MUST NOT 自动复用已软删除用户创建新会话

#### Scenario: 私有 API 使用软删除用户 cookie
- **WHEN** 聊天、训练、日程、结果、artifact、memory 或动作反馈等私有 API 收到指向已软删除用户的 cookie
- **THEN** 系统 MUST 将请求视为未认证
- **AND** 系统 MUST NOT 读取、写入或泄漏该软删除用户的私有业务数据
- **AND** 客户端统一请求层 MUST 触发本地匿名登录需求

#### Scenario: 重置后创建新的本地匿名用户
- **WHEN** 当前浏览器清除旧 cookie 后完成新的本地匿名登录
- **THEN** 系统 MUST 创建或恢复一个未软删除的匿名用户
- **AND** 新用户 MUST 使用新的 `userId`
- **AND** 新用户 MUST NOT 读取旧软删除用户的聊天、训练、日程、结果、artifact、memory 或动作反馈数据

### Requirement: 重置软删除文档和验证
系统 SHALL 为本地用户重置软删除更新测试和协作文档，确保后续开发理解该流程不是物理删除。

#### Scenario: 自动化验证覆盖重置链路
- **WHEN** 本 change 实现完成
- **THEN** 测试 MUST 覆盖确认弹窗打开/取消/确认行为
- **AND** 测试 MUST 覆盖有效 cookie 重置会软删除用户并清 cookie
- **AND** 测试 MUST 覆盖软删除用户无法通过旧 cookie 恢复
- **AND** 测试 MUST 覆盖缺失或无效 cookie 重置不会创建或删除其他用户

#### Scenario: 文档记录软删除语义
- **WHEN** 本 change 实现完成
- **THEN** 相关架构或数据库文档 MUST 说明本地匿名用户重置使用软删除而不是物理删除
- **AND** `docs/方案变更历史/` MUST 新增本次本地用户重置软删除方案记录
- **AND** 如果本次调整改变了核心数据生命周期或 auth 恢复逻辑，`docs/项目演变历程.md` MUST 追加简要记录

