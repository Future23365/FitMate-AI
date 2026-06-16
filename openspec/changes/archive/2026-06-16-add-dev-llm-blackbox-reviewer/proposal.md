## Why

基础 LLM 黑盒测试已经迁移到 JSON fixture，但当前只能通过命令行生成 Markdown 报告，人工审核真实用户可见结果不够直观。需要一个开发态审核页面，能够读取 JSON 用例、自动串行发送多轮消息、复用真实 `/api/chat` 前端事件合同，并以接近首页聊天消息样式的方式展示执行结果。

## What Changes

- 新增开发态 `/dev/llm-blackbox` 审核页面，用于读取基础 LLM 黑盒 JSON fixture。
- 支持选择并运行单个 flow，也支持串行运行全部 flow。
- 新增前端 headless runner：按 `turns[]` 顺序自动发送消息，等待本轮 NDJSON `done` 后再发送下一轮。
- 页面展示每个 flow / turn 的执行状态、`userInput`、`expectedOutput`、用户可见 assistant 文本、可见训练输出、建议提问、错误和事件摘要。
- 页面展示批次级临时运行结果和统计，包括 flow 数、turn 数、成功/失败/跳过数量、token 诊断和耗时。
- 结果展示复用首页聊天的消息展示层和可见训练输出渲染组件，但不嵌入首页整页、输入框、侧栏、欢迎态或 DOM 自动点击逻辑。
- 新增临时运行结果存储，只服务当前浏览器会话或开发态本地查看，不作为生产业务持久化。
- **不改变** 生产 `/api/chat` 请求 schema、LangChain runtime、tool calling、prompt、模型可见合同或生产聊天语义。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `testing-workflow`: 增加开发态 LLM 黑盒审核页，要求其从 JSON fixture 读取用例、自动运行单个或全部 flow、展示用户可见结果和统计，并保持与首页整页 UI 解耦。

## Impact

- 新增 `app/dev/llm-blackbox/page.tsx` 和 dev-only 审核组件。
- 新增或抽取共享的 JSON fixture 读取模块，供命令行手动黑盒和 dev 审核页共同消费。
- 抽出首页聊天消息展示层，例如 transcript / message bubble / visible output preview，供首页和审核页复用。
- 新增前端黑盒 runner controller 和临时结果存储模型。
- 更新普通自动化测试，覆盖 fixture 读取、runner 状态机、消息投影复用、统计计算和解耦边界。
- 更新手动黑盒测试文档，说明命令行报告和 dev 审核页的职责区别。
