## Context

本次日志显示 `/api/chat` 路由本身成功，但 Tool-first Agent 的终止结果为 `model_output_invalid`。直接原因是模型在候选为空后返回 `status: "blocked"`，却把说明写进 `replyContext.reply`，没有提供 `blockReason`。同时动作数据默认 `isPublished = false`，导致 `searchExercises` 在 `visibility: "published"` 下无法召回任何动作。

这两个问题叠加后，用户看不到“条件下未找到动作”的可恢复说明，只能看到通用失败文案。

## Goals / Non-Goals

**Goals:**

- 所有动作种子数据默认处于发布态，保证发布态检索能覆盖动作库。
- Agent 在候选为空时必须产出合法 `blocked` 终止结果。
- 对模型旧形态 `blocked` 输出提供窄范围兼容修复，避免合法阻塞场景被误判为模型非法输出。
- 补充自动化测试验证动作发布态和 Agent blocked 结果投影。

**Non-Goals:**

- 不改变 `searchExercises` 的权限、候选集合、RAG 排序或业务硬过滤规则。
- 不引入服务端自然语言语义改写，不基于用户原文纠偏意图。
- 不扩大动作推荐生成链路，只修复已有工具和终止结果契约。

## Decisions

1. **动作数据层统一发布，而不是让 Agent 默认使用 `visibility: "all"`。**

   `visibility: "published"` 是面向用户推荐的合理默认边界。如果开发数据全部未发布，问题应在 seed 数据和静态数据中修复，而不是让 Agent 绕过发布态约束。

2. **`blocked` 合同继续以 `blockReason` 为唯一阻塞说明字段。**

   Response Writer 已基于 `AgentExecutionResult` 投影，不应重新解释 `replyContext.reply`。因此 prompt 必须明确 `blocked` 示例；解析层只对明显的旧形态输出做结构迁移。

3. **兼容迁移只处理终止结果 Schema，不处理自然语言语义。**

   当模型返回 `status: "blocked"` 且 `replyContext.reply` 是非空字符串时，可以把它映射为 `blockReason`。这不改变用户意图或动作类型，只修正字段位置，符合服务端只校验契约的边界。

4. **测试覆盖真实失败路径。**

   测试需要证明：动作数据发布态可用；`blocked` 旧形态输出能被规范化；规范化后的结果能被 Response Writer 投影为用户可见阻塞说明。

## Risks / Trade-offs

- **Risk:** 全量发布动作可能暴露机器翻译质量一般的动作。
  **Mitigation:** 当前项目已依赖动作库作为训练事实源，本次只恢复发布态检索能力；后续如需人工审核，可另行设计 `reviewStatus` 到 `isPublished` 的审核流。

- **Risk:** 兼容旧形态输出可能掩盖 prompt 不严谨。
  **Mitigation:** 同时修 prompt 和测试；兼容逻辑只处理 `blocked` 的字段迁移，不吞掉其他非法结构。

- **Risk:** 数据文件较大，批量修改会产生较大 diff。
  **Mitigation:** 仅修改 `isPublished` 字段，不重排 JSON、不改其他动作内容。
