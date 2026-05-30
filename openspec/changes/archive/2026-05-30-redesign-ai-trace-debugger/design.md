## Context

`/dev/ai-traces` 是开发环境排查 AI 调用链路的主要入口。当前实现已经能按 trace、阶段和事件展示输入输出，也能保存 log，但页面仍以原始 JSON 和多层 `details` 为主。开发者需要自行推断 `metadata`、`intent`、模型参数、候选筛选和校验字段的含义，导致“看到了数据，但还要反推系统发生了什么”。

约束：

- trace store 和 `/api/dev/ai-traces` API 契约保持不变。
- 页面仍是开发环境工具，不引入新依赖，不启动 dev server，不主动使用浏览器验证。
- UI 保持项目浅色 Material Design 3 风格，重点是信息密度、流程感和可解释性。

## Goals / Non-Goals

**Goals:**

- 让开发者先看到“这次请求是什么、走到了哪一步、每一步识别/生成/校验出了什么结果”。
- 对主要字段给出中文含义，尤其是请求概览、意图解析、模型调用配置、消息列表、候选动作和校验结果。
- 将多层子模块折叠改为单一流程选中模型：先选阶段，再看该阶段事件。
- 保留原始 JSON 兜底，确保新解释层不会隐藏排查所需细节。

**Non-Goals:**

- 不调整 trace 采集点、step 命名、token usage 记录语义。
- 不改变 AI prompt、模型调用、意图解析、候选动作或校验业务行为。
- 不新增 trace 搜索、跨 trace 对比、持久化历史库或导入功能。

## Decisions

1. **使用前端解释层，而不是修改 trace schema。**
   - 设计：在 `AiTraceViewer` 中新增字段说明、结果摘要和阶段诊断组件，通过现有 `AiTrace` / `AiTraceStep` 派生展示数据。
   - 原因：这次目标是调试可读性，不应扩大到 trace 数据契约变更。
   - 取舍：前端需要维护字段解释映射，但能避免影响服务端采集链路。

2. **使用“流程节点 + 选中阶段详情”，替代全部阶段同时展开。**
   - 设计：右侧详情区顶部展示流程节点；点击阶段后，在一个主详情面板内展示该阶段摘要、事件列表、解释块和原始数据。
   - 原因：AI trace 本质是时序链路，按流程定位比在多个折叠卡片中上下滚动更适合调试。
   - 取舍：一次只重点看一个阶段；左侧流程节点保留全局进度，减少信息干扰。

3. **模型请求拆成调用配置和消息阅读器。**
   - 设计：对 `model`、`temperature`、`response_format`、`stream`、`messages` 等字段给出解释；消息列表按 role 分块展示，role 说明和内容分离。
   - 原因：排查 prompt 和上下文时，开发者最关心“用了什么配置”和“每条消息承担什么角色”。
   - 取舍：仍保留完整 JSON，避免解释层遗漏低频参数。

4. **意图解析展示“字段含义 + 本次结果 + 业务解释”。**
   - 设计：识别常见字段如 `intentType`、`targetMuscles`、`equipmentOrLocation`、`sessionMinutes`、`canTriggerAction`、`missingActionFields`、`confidence` 等，给出中文说明和本次值。
   - 原因：意图字段是后续触发动作推荐、计划生成和追问的核心判断点。
   - 取舍：字段解释覆盖主要路径；未知字段仍进入原始 JSON。

## Risks / Trade-offs

- [Risk] trace step 的具体字段来自多个服务，字段名称可能继续扩展 → Mitigation：主要字段用解释卡片展示，未知字段保留在原始 JSON，并让解释函数保持容错。
- [Risk] 单文件组件继续变大 → Mitigation：本次先控制在现有页面边界内，优先提取纯函数和小展示组件；后续如果继续扩展可拆成 `components/dev/ai-trace-*` 子组件。
- [Risk] 只做静态代码验证无法完全确认视觉观感 → Mitigation：按项目规则不主动打开浏览器；运行类型检查、lint 和 OpenSpec 校验，视觉细节由后续人工页面检查确认。
