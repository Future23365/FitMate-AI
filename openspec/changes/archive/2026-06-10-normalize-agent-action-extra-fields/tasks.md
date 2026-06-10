## 1. 边界确认

- [x] 1.1 确认本 change 分类为 core contract 变更，允许触碰 `lib/server/agent-core/**` 中的 AgentAction schema / validator / repair feedback / trace diagnostic 相关模块。
- [x] 1.2 确认禁止触碰业务 tool handler、`searchExerciseResources` 查询策略、动作库 repository、`Policy Guard` 主流程、`ResourceStore` 主流程、`Response Renderer` 主路径和 `/api/chat` 关键词路由。
- [x] 1.3 读取当前 `AgentAction` schema、`validateAgentActionAsync` 或等价 validator、invalid action repair feedback、runtime validation trace 事件和相关测试，记录实际入口。
- [x] 1.4 完成抽象层级检查：本 change 不新增业务 `toolName` 分支，不读取用户自然语言，不把 warmup/stretch trace 写成生产规则。

## 2. Core 实现

- [x] 2.1 在 AgentAction validator 边界实现 type-aware normalization：合法 `type` 确定后，仅保留 selected variant 的顶层 allowlist 字段。
- [x] 2.2 保持 `tool_call` 的 `type`、`toolName`、`input` 必填和严格校验；保持目标 tool input schema 校验不被 normalization 放宽。
- [x] 2.3 确保 normalization 不把旧同义字段转换成新字段，不使用未知字段补齐 missing required field。
- [x] 2.4 将被丢弃字段以脱敏 diagnostic 形式写入 runtime validation / trace，不进入 tool input、前端响应、resource、usedRefs、visibleOutputs 或 grounding。
- [x] 2.5 调整 repair 触发边界：可安全丢弃的顶层字段不生成 repair feedback、不消耗 repair budget；不可执行结构错误继续进入原 repair 路径。
- [x] 2.6 如实现修改模型可见 repair feedback、repairContext、observations 或 compressed tool results，使用 `agent-prompt-contract-governance` 检查模型可见合同。

## 3. 回归测试

- [x] 3.1 新增或更新 Agent core validator 测试：`tool_call` 顶层多 `content` 时会被丢弃，并继续执行或通过 action validation。
- [x] 3.2 新增或更新 Agent core validator 测试：`tool_call` 缺 `toolName` / `input`、未注册 `toolName`、非法 tool input 仍失败。
- [x] 3.3 新增或更新 repair loop 测试：可丢弃顶层字段不消耗 repair budget；缺 required field、invalid discriminator、非法 tool input 仍生成结构化 repair feedback。
- [x] 3.4 新增或更新 trace 测试：记录 dropped field path、selected action type 和 normalization status，且不记录 `content` 完整文本。
- [x] 3.5 新增生产聊天或 runtime 回归用例：模拟模型返回 `tool_call.content + searchExerciseResources warmup/stretch input`，断言 tool call 未因顶层 `content` 中断。
- [x] 3.6 运行架构边界扫描或对应测试，确认 core 中没有新增具体业务 `toolName` 分支，`/api/chat` 没有新增用户原文关键词分流。

## 4. 验证

- [x] 4.1 运行 `openspec validate normalize-agent-action-extra-fields --strict`。
- [x] 4.2 运行最窄 Agent core 合同测试，例如 `npm test -- tests/agent-core/contract-helper.test.ts` 或当前覆盖 AgentAction validator 的实际测试文件。
- [x] 4.3 如修改 runtime loop、repair 或 trace 相关模块，运行对应 `tests/agent-core/*repair*`、`tests/agent-core/*trace*`、`tests/agent-core/architecture-boundary.test.ts` 或实际存在的等价测试文件。
- [x] 4.4 如改动 TypeScript、schema、AI orchestration 或共享业务逻辑，运行 `npm run typecheck`。
- [x] 4.5 最终检查 `git diff --name-status`，确认没有无关删除、业务 tool 改动、前端渲染改动或文档范围外变更。
