## Why

Artifact、引用解析和 Patch 引入后，AI 错误可能来自引用定位、工具调用、Patch scope、校验或保存任一环节。第一批需要先补齐基础 trace，让开发者能复盘一次请求为什么选中了某张卡片、为什么生成某个 Patch、为什么校验放行或拦截。

## What Changes

- 新增 `AiRunTrace` 基础结构，记录用户消息、artifact 摘要、模型配置、工具版本、关键步骤输入输出和最终决策。
- 对 intent resolution、reference resolution、tool call、patch proposal、validation、persistence 和 response write 建立统一 step 记录。
- `/dev/ai-traces` 支持查看新增步骤类型，并保留原始 JSON 入口。
- Trace 中必须记录失败原因和被拦截结果，但不得记录越权 payload 或未经脱敏的敏感信息。
- 本 change 只实现基础 trace，不实现完整 Replay、Eval Suite、Reranker 或独立评测平台。

## Capabilities

### New Capabilities
- `ai-run-trace`: 定义 AI 编排链路的基础 trace 数据结构、记录边界和隐私要求。

### Modified Capabilities
- `ai-trace-debugger`: 让现有 trace 调试页能够展示 artifact、引用解析、Patch 和校验相关的新步骤。

## Impact

- 影响 AI trace 记录工具、聊天编排服务、ReferenceResolver、PatchEngine、Validation Service 和 `/dev/ai-traces`。
- 需要为新增 step 类型补充服务端测试或 trace fixture。
- 不要求本阶段实现 Replay 或 Eval 自动化执行，但数据结构需要为后续回放保留必要快照。
