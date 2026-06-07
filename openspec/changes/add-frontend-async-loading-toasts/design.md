## Context

项目已经在 `app/layout.tsx` 挂载全局 `Toaster`，并通过 `components/ui/sonner.tsx` 统一 toast 外观和层级。`clientRequest` 目前负责 HTTP 序列化、错误解析和本地匿名登录事件，不负责业务加载反馈。

当前前端异步入口分散在多个区域：

- 聊天发送使用 `isLoading`、聊天气泡和 Agent 活动条，但请求发出到首个 stream event 之间没有全局加载反馈。
- 动作库列表 / 详情有局部 loading 和错误区域，筛选、翻页、详情切换在慢网下容易表现为静默等待。
- 训练日历使用组件内短暂文本状态，不走全局 `sonner`，与全局反馈层不一致。
- 动作编排页已有局部 `showComposerToast`，但部分保存、复制、删除等写操作缺少 loading 阶段。
- AI 训练方案卡片保存、设置页本地用户重置、dev trace 清理 / 保存等写操作只禁用按钮或设置局部错误。
- 聊天历史 debounce 保存、自动刷新、abort 请求和缓存命中请求不适合弹出全局 loading toast。

## Goals / Non-Goals

**Goals:**

- 建立统一的前端异步反馈合同，使用户主动触发、耗时不确定、会改变系统状态的操作必须有 loading Toast。
- 为慢网读请求提供可控反馈：局部 Skeleton / Spinner 仍为主，必要时使用延迟出现的 loading Toast。
- 统一 success / error / cancel 行为，避免重复 toast、过期 toast、abort 请求误报失败。
- 保持按钮禁用、局部 pending、错误区域和页面级 Skeleton，与全局 Toast 各司其职。
- 给实现阶段提供可审计的入口清单和测试范围。

**Non-Goals:**

- 不改变任何 API 路由、请求 / 响应 JSON、数据库结构、Prisma schema 或服务端权限模型。
- 不改变 AI 编排、Agent tool、模型 prompt、训练计划生成规则或输出校验逻辑。
- 不把所有 `clientRequest` 默认包装成 toast 请求。
- 不用 Toast 替代页面内必要的 loading、empty、error、success 状态。
- 不引入新的通知依赖，继续使用现有 `sonner` / shadcn Toaster。

## Decisions

### 1. 使用显式 async feedback helper，而不是在 `clientRequest` 默认弹 Toast

实现时新增一个前端 helper / hook，例如 `runWithAsyncToast` 或 `useAsyncToastAction`，由业务入口显式声明：

- `id`：同类操作使用稳定 id，避免重复堆叠。
- `loading`：请求开始后的加载文案。
- `success`：成功后的完成文案，可基于返回值生成。
- `error`：失败文案，可基于 `ClientRequestError` 或普通 `Error` 映射。
- `delayMs`：读请求或短请求可延迟展示，避免闪烁。
- `minVisibleMs`：loading toast 已出现时保持最短可见时间，避免慢网边界抖动。
- `silentOnAbort`：`AbortError` 或主动取消时关闭 loading，不展示失败。

取舍：把 toast 放进 `clientRequest` 可以覆盖更广，但会让自动刷新、缓存详情、debounce 保存和背景同步产生噪音，也会让 HTTP 层承担 UI 决策。显式 helper 让每个用户操作的反馈策略可审计，符合 UI 层和请求层职责分离。

### 2. 按异步入口类型分层处理

实现时将异步入口分成四类：

- **命令型写操作**：保存、删除、复制、安排训练、更新状态、重置用户、清理日志等。必须展示 loading Toast，并在成功或失败时更新同一个 toast。
- **用户触发的可见读操作**：聊天发送前等待首个事件、动作库筛选 / 翻页、详情打开、训练数据手动刷新等。保留局部 loading；当操作可能明显等待时使用延迟 loading Toast，首个内容或局部 loading 完成后关闭。
- **页面初始加载和列表分页**：以 Skeleton、Spinner、空状态、错误区域为主；只有页面没有足够局部反馈或加载超过阈值时才补全局 loading Toast。
- **后台静默同步**：聊天历史 debounce 保存、自动刷新、缓存预取、aborted 请求。默认不展示 loading；失败时按用户可恢复程度展示 warning/error，或只记录 console。

取舍：这能解决慢网“没有反应”的问题，同时不把整个应用变成持续弹通知的界面。

### 3. 聊天发送的 Toast 只覆盖请求启动到流式反馈接管的空窗

聊天页已经有气泡 pending 和 Agent 活动条。实现时应在用户发送后展示全局 loading Toast，例如“正在发送消息...”。当收到 `agent_loop`、`agent_progress`、`content` 或 `done` 之一时，关闭或切换该 toast，由气泡和活动条继续承载进度。请求超时、HTTP 失败或 stream error 时更新同一个 toast 为错误。

取舍：如果 loading toast 一直覆盖整个 AI 回复过程，会和 Agent 活动条重复；只覆盖首包空窗更符合当前页面的信息结构。

### 4. 训练日历和动作编排应迁移到全局 sonner 反馈

训练日历当前使用组件内 `toast` 字符串。实现时应改为全局 `sonner`，并把安排训练、休息日、状态更新、移除计划统一为 `runWithAsyncToast`。动作编排页已有 `showComposerToast`，可保留局部函数名，但内部应复用统一 helper 或对齐同样的 loading/success/error/cancel 语义，避免页面间行为分叉。

取舍：完全删除页面局部函数会带来较大 churn；允许局部 façade 复用统一 helper，可以保持组件可读性。

### 5. Toast 文案和交互状态必须一致

所有新增可见文案使用中文。loading toast 不能替代按钮 `disabled`、`aria-busy` 或局部 pending 状态；同一操作开始后必须禁用重复提交入口，完成、失败或取消后必须恢复。错误 toast 只展示用户可理解的信息，不直接泄露原始服务端堆栈或调试字段。

## Risks / Trade-offs

- [Risk] 全局 loading Toast 过多，打断用户操作。→ Mitigation：只对用户主动触发且耗时不确定的操作默认展示；读请求使用 `delayMs`；后台同步默认静默。
- [Risk] 多个并发请求共用 toast id 导致状态串台。→ Mitigation：按页面和操作命名稳定 id，列表查询、详情查询、保存命令分别隔离。
- [Risk] abort 或路由切换后显示错误 toast。→ Mitigation：helper 统一识别 `AbortError`，支持 `silentOnAbort`，组件 unmount 时 dismiss 对应 toast。
- [Risk] loading toast 和页面内 Skeleton 重复。→ Mitigation：spec 明确 Toast 是全局确认反馈，页面内 loading 负责布局占位；首屏和分页以局部反馈为主。
- [Risk] 成功 toast 在频繁自动保存时产生噪音。→ Mitigation：debounce 保存、自动刷新和缓存预取默认不展示 success，必要时只在失败时提示。

## Migration Plan

1. 新增统一 async feedback helper，并补单元测试覆盖成功、失败、延迟、最短展示、abort 和并发 id。
2. 先迁移命令型写操作：训练日历、动作编排、AI 方案卡保存、设置页重置、dev trace 清理 / 保存。
3. 再补读请求空窗：聊天发送首包前、动作库筛选 / 翻页、动作详情打开。
4. 保持后台同步静默，仅收敛失败提示或 console 记录。
5. 运行相关前端测试、`npm run typecheck`，并按改动范围运行 `npm test`。

## Open Questions

- 无需要先确认的问题。具体 Toast 文案可在实现阶段按页面上下文微调，但不得改变本 change 的反馈分层和降噪规则。
