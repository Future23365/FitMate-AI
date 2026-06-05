## Context

项目当前已经有统一客户端请求入口 `clientRequest`。当同源私有 API 返回 `401` 或兼容旧链路的 `403`，且响应体明确为 `code: "unauthenticated"` 时，请求层会派发 `fitmate:auth-required` 事件。`LocalAuthProvider` 监听该事件并打开本地匿名登录 Dialog。

本次需求要补的是全局提示层：未认证事件发生时，用户应看到轻量 toast 提示“需要登录”，组件样式使用 shadcn/ui 推荐的 Sonner，而不是每个业务组件自己判断请求失败并弹提示。

## Goals / Non-Goals

**Goals:**
- 使用 shadcn/ui 官方 `sonner` 组件提供全局 toast 容器。
- 保持 `clientRequest` 作为 API 未认证响应到前端事件的唯一 adapter。
- 让 `LocalAuthProvider` 成为 auth-required 事件的展示协调者，同时打开 Dialog 和触发 toast。
- 保持业务页面无需知道具体 API route、状态码组合或错误响应 shape。

**Non-Goals:**
- 不改变服务端未认证响应结构。
- 不改变匿名登录 cookie、token 或权限校验逻辑。
- 不替换所有局部提示或重构现有业务页面。
- 不引入新的登录页或全局阻塞层。

## Decisions

1. 使用 `sonner` 而不是旧 Radix toast。
   - 理由：shadcn/ui 官网当前推荐 `sonner`，旧 `toast` 组件已标记为不推荐继续使用。
   - 取舍：会新增一个轻量运行时依赖，但能保持和官方组件基线一致。

2. 在 `app/layout.tsx` 挂载 `Toaster`。
   - 理由：根布局是所有页面共享的 UI 上下文，适合作为全局提示容器入口。
   - 取舍：`Toaster` 是客户端组件，会增加一个全局客户端边界；但只影响提示容器，不改变页面数据流。

3. 在 `LocalAuthProvider` 内触发 toast。
   - 理由：它已经是 `fitmate:auth-required` 的唯一消费者，负责未认证后的用户可见反馈。把 toast 放在这里能避免每个页面或请求调用点重复处理。
   - 取舍：`LocalAuthProvider` 同时协调 Dialog 和 toast 两种 UI 反馈；这是同一 auth-required 事件的展示职责，不把 API 解析细节扩散到 UI 页面。

4. 不在 `clientRequest` 里直接调用 `toast`。
   - 理由：请求层应只做 HTTP adapter 和事件派发，不直接依赖展示组件，避免 API 层和 UI 库耦合。
   - 取舍：事件到 toast 多经过一层 provider，但模块边界更清晰。

## Risks / Trade-offs

- [Risk] 重复的未认证请求可能连续弹出多个 toast。
  → Mitigation：使用固定 toast `id` 合并同类未登录提示，避免短时间堆叠。
- [Risk] 新增依赖或官方组件生成内容与项目 Tailwind 4 token 不兼容。
  → Mitigation：按 `components.json` 生成本地 shadcn 组件，并通过 typecheck、lint、build 验证。
- [Risk] toast 提示与 Dialog 文案重复。
  → Mitigation：toast 只承担轻量即时反馈，Dialog 继续承担匿名登录操作入口。
