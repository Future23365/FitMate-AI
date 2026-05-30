## 1. 信息架构

- [x] 1.1 将 trace 详情改为请求概览、流程节点、选中阶段详情和原始数据兜底的工作台结构。
- [x] 1.2 保留左侧 trace 列表、刷新、清空 Trace、保存全链路 log 的现有入口。
- [x] 1.3 为阶段节点展示顺序、状态、事件数量、耗时和 token usage，并支持选择阶段。

## 2. 字段解释与结果摘要

- [x] 2.1 新增请求概览字段解释，覆盖 route、status、createdAt、durationMs、token usage 和主要 metadata。
- [x] 2.2 新增意图字段解释与业务结果摘要，覆盖常见 intent 字段和触发动作判断。
- [x] 2.3 新增候选动作、校验、最终返回和错误事件的关键字段摘要。

## 3. 模型调用阅读体验

- [x] 3.1 将模型调用配置从原始 JSON 中拆出，用字段标签、含义和本次值展示。
- [x] 3.2 将消息列表按 role、顺序和内容块展示，便于阅读 system、user、assistant 等消息。
- [x] 3.3 保留每个事件的输入、输出、metadata、error 原始 JSON 兜底和保存单事件 log 能力。

## 4. 验证

- [x] 4.1 运行 `openspec validate redesign-ai-trace-debugger --strict`。
- [x] 4.2 运行 `npm run typecheck`。
- [x] 4.3 运行 `npm run lint`。
- [x] 4.4 运行 `npm test`。

## 5. 会话记忆更新分组

- [x] 5.1 将 `聊天上下文总结` 相关 step 从主流程节点中剥离。
- [x] 5.2 在流程步骤切换区的接口返回之后，通过分割线展示会话记忆更新模块。
