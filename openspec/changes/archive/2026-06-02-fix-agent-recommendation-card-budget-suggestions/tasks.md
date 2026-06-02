## 1. 推荐卡片与建议事件

- [x] 1.1 梳理 `AgentExecutionResult`、tool result 和当前聊天流事件投影，确认 `answered` 推荐结果缺少 artifact 事件的具体落点。
- [x] 1.2 实现基于本轮 `searchExercises` tool result 的 `exercise_recommendation` artifact 投影，保证成功推荐候选能发送 `artifact_validated` / `artifact` 事件。
- [x] 1.3 从 Agent 终止结果和推荐投影中输出统一 `assistant_suggestions` 事件，恢复前端建议 chips。

## 2. Token 预算与 Trace 分组

- [x] 2.1 为 Agent decision 构造瘦身模型输入，裁剪完整 registry、完整 diagnostics/rerank 和展示噪音，并记录裁剪摘要。
- [x] 2.2 为 Agent decision 模型响应补充 `aiStage` / prompt module metadata，确保 trace 页面归入 `tool_decision` 并正确显示 token。
- [x] 2.3 更新 trace view model 必要的兜底分类或测试，避免新 Agent 模型响应进入 `legacy_compatibility`。

## 3. 验证与文档

- [x] 3.1 增加或更新自动化测试，覆盖推荐候选成功后出卡、建议 chips 事件、瘦身 payload 和 trace 分组。
- [x] 3.2 运行相关测试、`npm run typecheck` 和 `openspec validate fix-agent-recommendation-card-budget-suggestions --strict`。
- [x] 3.3 如改动构成核心链路修复，在 `docs/方案变更历史` 新增记录，并追加 `docs/项目演变历程.md`。
