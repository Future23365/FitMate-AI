## 1. Stream 合同与服务端事件

- [x] 1.1 在共享聊天事件类型和服务端 NDJSON 白名单中新增 `agent_loop` 事件，payload 只允许 `loopTurn` 和必要排序字段。
- [x] 1.2 在当前 `agent-core` runtime 或 production chat adapter 的真实 Agent Loop 边界输出 `agent_loop`，确保同一请求内只在进入新 Loop 时递增。
- [x] 1.3 保留 `agent_progress` 或等价 Activity 事件作为阶段文案来源，禁止把 Loop 轮次塞进 Activity 事件作为前端计数依据。
- [x] 1.4 确认 `agent_loop` 与 Activity 事件都不暴露 prompt、raw model output、toolName、tool input/output、resource id、token usage、trace 详情或内部错误栈。

## 2. 前端解析与状态模型

- [x] 2.1 更新聊天客户端 stream parser，分别校验 `agent_loop` 和 Activity 事件；非法 `loopTurn` 或非法 Activity payload 不得污染消息内容。
- [x] 2.2 将前端活动状态拆成 `loopTurn` 和 `activityStage` 两个独立字段，`sequence` 只用于顺序保护，不用于推断 `#N`。
- [x] 2.3 更新 `use-chat-controller` 或等价 reducer：收到 `agent_loop` 只更新轮次，收到 Activity 事件只更新中文文案阶段，收到 content 只允许进入整理回复阶段且不得递增轮次。
- [x] 2.4 更新 `AgentActivityIndicator` 或等价组件：有合法 `loopTurn` 时展示 `#N`，未进入 Loop 时只展示中文活动文案，不展示 runtime step、planner call、tool call 或英文技术字段。
- [x] 2.5 确保 `done`、`error`、abort、timeout、会话切换和新建会话会同时清理 `loopTurn` 与 Activity stage，且两者不进入聊天历史持久化。

## 3. 展示稳定性与扩展边界

- [x] 3.1 调整 Activity 展示仲裁，使具体阶段优先、通用阶段冷却、未知阶段兜底和过期 sequence 保护只影响右侧中文文案。
- [x] 3.2 覆盖同一 Loop 内多个 Activity 更新保持同一 `#N` 的场景。
- [x] 3.3 覆盖不同 Loop 内重复相同 Activity 文案时仍更新 `#N` 的场景。
- [x] 3.4 确认未进入后端 Agent Loop 的准备阶段不会显示本地生成的 `#0` 或 `#1`。
- [x] 3.5 确认后续新增 validation、policy、resource、saving、rendering 等 Activity stage 时不需要修改 Loop 事件合同。

## 4. 测试与验证

- [x] 4.1 更新或新增服务端 stream fixture 测试，覆盖 `agent_loop` 与 Activity 事件的安全 payload、顺序和重复 stage 场景。
- [x] 4.2 更新或新增前端 parser 测试，覆盖合法/非法 `agent_loop`、合法/非法 Activity、未知 stage 兜底和内部字段不渲染。
- [x] 4.3 更新或新增 activity reducer/component 测试，覆盖同一 Loop 多 Activity、新 Loop 重复文案、content 不递增 Loop、请求结束清理和无 Loop 前缀场景。
- [x] 4.4 更新 architecture boundary 测试或扫描，证明 `/api/chat`、production chat service 和 `agent-core` 没有基于用户原文、关键词、具体业务 `toolName` 或 stage 数量推断 Loop 轮次。
- [x] 4.5 运行 `openspec validate split-agent-loop-activity-stream-events --strict`。
- [x] 4.6 运行相关自动化测试，至少包括 `npm test -- tests/chat-agent-activity.test.ts`、`npm test -- tests/client-api.test.ts`、`npm test -- tests/chat-service.test.ts` 和 `npm test -- tests/agent-core/architecture-boundary.test.ts`，并按实际触碰范围补充 runtime 测试。
- [x] 4.7 运行 `npm run typecheck`。
