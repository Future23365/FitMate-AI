## Why

当前 terminal failure finalizer 本来是主 Agent 已经失败后的用户可见兜底，但它又对 `content` 和 `suggestedQuestions` 做了短语命中、成功声明和内部技术词等语义判定，导致可用的失败解释因为文案没有命中特定短语而被丢弃。兜底阶段应优先保证能输出安全的普通聊天内容和建议问题，不应再用服务端短语白名单二次阻断。

## What Changes

- 放宽 terminal failure finalizer 输出校验：只校验 JSON shape、允许字段、字段类型、非空内容、长度和建议问题数量。
- 删除 finalizer 输出的用户可见文案语义判定，包括失败披露短语命中、成功声明短语和内部技术词短语扫描。
- 保留主 Agent 的 `visibleTrainingProposal`、terminal reference、ResourceStore、Policy Guard、Response Renderer 和权限校验边界；无效训练结果仍不得渲染、保存或进入事实库。
- finalizer 输出成功时继续投影为 `content`、可选 `suggested_questions` 和 `done`；只有 JSON 不可解析或 shape 不合法时才降级到确定性 fallback。
- 更新相关单元测试，覆盖“不含固定失败短语但 shape 合法”的 finalizer 输出应被接受。
- 不新增服务端用户原文关键词、正则、同义词、phrasing 特判或业务 `toolName` 分支。

## Capabilities

### New Capabilities

- `terminal-failure-finalizer-output-contract`: 定义 terminal failure finalizer 的用户可见输出合同，明确兜底输出只需要符合结构化 shape，不再做用户可见文案语义短语判定。

### Modified Capabilities

<!-- 本次不修改已归档主规格；当前相关 finalizer 能力仍在已完成 change 中，使用新的窄能力规格承载输出合同调整。 -->

## Impact

- 预计影响代码：
  - `lib/server/chat/terminal-failure-finalizer.ts`
  - `tests/chat-terminal-failure-finalizer.test.ts`
  - `tests/chat-service.test.ts`
- 预计验证：
  - `openspec validate relax-terminal-failure-finalizer-validation --strict`
  - terminal failure finalizer 单元测试
  - chat service finalizer / fallback 相关测试
  - `npm run typecheck`
- 不涉及数据库、Prisma migration、业务 tool handler、训练方案 validator 放宽、前端 UI 改造或真实模型手测。
