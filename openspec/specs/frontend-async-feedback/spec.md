# frontend-async-feedback Specification

## Purpose
TBD - created by archiving change add-frontend-async-loading-toasts. Update Purpose after archive.
## Requirements
### Requirement: 用户主动触发的命令型异步操作必须展示加载 Toast

前端 SHALL 对用户主动触发、会创建 / 更新 / 删除 / 保存 / 重置 / 清理业务数据或开发数据的异步操作展示全局 loading Toast，并在操作成功或失败后更新同一个 Toast。

#### Scenario: 命令型写操作开始

- **WHEN** 用户点击保存训练编排、复制训练编排、删除训练编排、安排训练、设置休息日、更新训练状态、移除计划、保存 AI 训练方案、重置本地用户、清理 dev trace 或保存 dev trace 日志
- **THEN** 前端展示全局 loading Toast，说明当前操作正在处理中
- **AND** 对应按钮或命令入口进入 pending / disabled 状态，避免重复提交

#### Scenario: 命令型写操作成功

- **WHEN** 命令型异步操作成功完成
- **THEN** 前端将同一个 Toast 更新为成功提示
- **AND** 页面状态与服务端返回结果保持一致
- **AND** pending / disabled 状态被清理

#### Scenario: 命令型写操作失败

- **WHEN** 命令型异步操作失败
- **THEN** 前端将同一个 Toast 更新为用户可理解的失败提示
- **AND** 不直接展示服务端堆栈、调试字段或未清洗的原始错误对象
- **AND** pending / disabled 状态被清理

### Requirement: 用户可见的读请求必须有加载反馈且避免提示噪音

前端 SHALL 对用户触发且会替换主要可见内容的读请求提供明确加载反馈；局部 Skeleton / Spinner / 活动条已经足够表达进度时，Toast 可以延迟展示或在首个可见反馈出现后关闭。

#### Scenario: 聊天发送等待首个流式事件

- **WHEN** 用户发送聊天消息且请求已经发出但尚未收到 `agent_loop`、`agent_progress`、`content`、`done` 或 `error`
- **THEN** 前端展示全局 loading Toast，说明消息正在发送或 AI 正在建立响应
- **AND** 一旦收到首个流式事件，前端关闭该 loading Toast，由聊天气泡和 Agent 活动条继续展示进度

#### Scenario: 动作库筛选或翻页加载

- **WHEN** 用户修改动作库搜索条件、筛选条件、排序或页码
- **THEN** 前端保留列表区域的局部 loading / empty / error 状态
- **AND** 如果请求超过约定延迟阈值仍未完成，前端展示全局 loading Toast
- **AND** 请求完成、失败或被新请求取消后，该 Toast 被成功更新、失败更新或静默关闭

#### Scenario: 动作详情打开加载

- **WHEN** 用户打开或切换动作详情且详情数据不在缓存中
- **THEN** 前端展示详情区域局部 loading 状态
- **AND** 如果加载超过约定延迟阈值仍未完成，前端展示全局 loading Toast
- **AND** 缓存命中时不得展示 loading Toast

### Requirement: 后台同步和高频自动请求必须降噪

前端 MUST NOT 对后台自动同步、高频轮询、debounce 保存、缓存预取或用户不可感知的内部请求默认展示 loading Toast。

#### Scenario: 聊天历史 debounce 保存

- **WHEN** 前端在用户输入或收到回复后 debounce 保存聊天历史
- **THEN** 前端不展示 loading Toast 或 success Toast
- **AND** 保存失败时可以展示一次非阻塞失败提示或只记录诊断信息，具体策略不得影响当前聊天输入和流式回复

#### Scenario: 自动刷新或缓存预取

- **WHEN** 前端执行 dev trace 自动刷新、动作详情预取、动作图片加载或其他用户未直接触发的刷新请求
- **THEN** 前端不展示 loading Toast
- **AND** 自动请求失败不得覆盖用户当前正在处理的命令型操作 Toast

### Requirement: Toast 生命周期必须处理取消、并发和卸载

前端 SHALL 统一管理异步 Toast 的 id、取消、并发和组件卸载，避免过期 Toast、重复 Toast 或错误状态串台。

#### Scenario: 请求被主动取消

- **WHEN** 异步请求因为 `AbortError`、路由切换、组件卸载或被后续同类请求替代而取消
- **THEN** 前端关闭对应 loading Toast
- **AND** 默认不展示失败 Toast

#### Scenario: 同类操作重复触发

- **WHEN** 同一页面同一类异步操作在前一次未完成时再次触发
- **THEN** 前端复用或替换该操作的稳定 Toast id
- **AND** 不堆叠多个含义相同的 loading Toast

#### Scenario: 并发操作互不覆盖

- **WHEN** 两个不同业务操作并发执行，例如动作库列表加载和训练编排保存同时发生
- **THEN** 前端使用不同 Toast id 管理各自生命周期
- **AND** 任一操作完成不得错误关闭或更新另一操作的 Toast

### Requirement: Toast 不得替代页面内状态和可访问性反馈

前端 SHALL 保留页面内 loading、empty、error、success、pending、disabled 和必要的可访问性状态；Toast 只作为全局反馈补充。

#### Scenario: 按钮提交期间

- **WHEN** 用户触发带 loading Toast 的按钮操作
- **THEN** 按钮仍展示 pending 或 disabled 状态
- **AND** Toast 不得成为防重复提交的唯一机制

#### Scenario: 列表首屏加载

- **WHEN** 页面首次加载列表数据
- **THEN** 页面仍展示稳定的局部 Skeleton / Spinner / empty / error 状态
- **AND** loading Toast 不得导致布局跳动或遮挡主要内容操作

### Requirement: 异步反馈实现必须复用现有全局 Toast 基础设施

前端 SHALL 继续使用现有 `sonner` / shadcn `Toaster` 作为全局反馈层，并通过共享 helper 或 hook 统一新增异步 Toast 语义。

#### Scenario: 新增异步 Toast helper

- **WHEN** 实现本 change
- **THEN** 项目提供可复用的前端 async feedback helper 或 hook
- **AND** 业务组件通过该 helper 声明 loading、success、error、delay、min visible、toast id 和 abort 策略
- **AND** 不新增第二套 Toast 容器或外部通知依赖

#### Scenario: 文案和错误映射

- **WHEN** 前端展示 loading、success 或 error Toast
- **THEN** 可见文案使用简体中文
- **AND** `toolName`、API 路径、错误 code 等技术标识只在必要诊断场景保持英文原样
