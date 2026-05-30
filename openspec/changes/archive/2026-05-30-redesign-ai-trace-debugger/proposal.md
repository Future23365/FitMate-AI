## Why

当前 `/dev/ai-traces` 页面更像原始 trace JSON 查看器：请求概览没有字段解释，模型调用配置和消息列表需要在多层折叠中来回展开，意图解析只展示字段值但缺少业务含义和结果解释。开发者排查聊天、意图、候选动作、校验和最终返回时，需要自行理解字段和流程，调试成本偏高。

## What Changes

- 将 trace 详情重组为调试工作台：左侧保留请求列表，右侧按“请求概览、流程步骤、选中阶段详情、原始数据兜底”组织信息。
- 为请求概览、意图解析、候选动作、校验、模型请求和模型输出增加主要字段说明，展示字段含义和本次识别结果。
- 将每个阶段从多层子模块折叠改为清晰流程节点，支持快速选中某一步查看该阶段的摘要、输入、输出、错误和 token 使用情况。
- 优化模型调用查看方式：调用配置以字段说明呈现，消息列表按 role、顺序和内容分块展示，降低阅读 prompt 和上下文的阻力。
- 保留保存全链路 log、保存阶段 log、保存单事件 log、刷新和清空 Trace 的现有能力。

## Capabilities

### New Capabilities
- `ai-trace-debugger`: 开发者可以在 `/dev/ai-traces` 中按流程理解 AI 调用链路，并查看关键字段的含义、识别结果和原始数据。

### Modified Capabilities

## Impact

- 影响 `components/dev/ai-trace-viewer.tsx` 的页面信息架构、交互状态和数据展示组件。
- 不改变 `lib/server/dev/ai-trace-store.ts` 的 trace 数据结构。
- 不改变 `/api/dev/ai-traces` API 契约、保存 log 的 HTTP 行为或生产环境禁用逻辑。
- 需要运行 `npm run typecheck`、`npm run lint`，并运行 `openspec validate redesign-ai-trace-debugger --strict`。
