## 1. 工具基础设施

- [ ] 1.1 新增 `lib/server/ai/tools/` 模块，定义 `ControlledReadTool`、`ControlledToolContext`、`ControlledToolResult` 和统一错误结构。
- [ ] 1.2 实现只读 tool registry，注册 `searchArtifacts`、`getArtifactPayload`、`getExerciseById`、`searchExercises`，并确保 registry 不包含写工具。
- [ ] 1.3 为每个只读工具实现 Zod 输入 Schema、服务端权限上下文传递、模型摘要函数和 trace 摘要函数。
- [ ] 1.4 实现 tool executor，统一处理工具名白名单、Schema 校验、执行、耗时统计、错误归一化和摘要输出。

## 2. LLM 只读 Tool Loop

- [ ] 2.1 新增 `runReadonlyToolLoop`，支持最多配置步数、模型 tool decision、工具执行、上下文摘要聚合和停止条件。
- [ ] 2.2 在 DeepSeek 标准 tool calling 不可用时，提供受控 JSON tool decision 协议，并用服务端 Schema 校验模型输出。
- [ ] 2.3 将 tool loop 接入 `/api/chat` 意图解析、用户记忆和引用解析之后，作为可选补查上下文阶段。
- [ ] 2.4 确保 tool loop 只补充上下文，不绕过 resolved intent、ReferenceResolver、Validator、PolicyEngine 或 ConfirmationGate。
- [ ] 2.5 为工具失败、未选择工具、越权、Schema 失败和步数上限实现确定性回退。

## 3. Trace 与上下文预算

- [ ] 3.1 扩展 AI Trace step 类型或 metadata，记录 tool decision、tool call、rag query、step limit 和回退策略。
- [ ] 3.2 更新 `aiRunTraceToolVersions`，为只读 tool loop、registry 和首批工具声明版本。
- [ ] 3.3 确保所有工具输出进入模型前经过字段裁剪、候选数量限制和长度预算控制。
- [ ] 3.4 如调试页已有对应展示逻辑，更新 `/dev/ai-traces` 展示只读工具决策和执行摘要。

## 4. 测试与验证

- [ ] 4.1 添加 tool registry 单元测试，覆盖注册工具集合、写工具不可注册、未知工具拒绝。
- [ ] 4.2 添加 tool executor 单元测试，覆盖 Schema 成功、Schema 失败、权限失败、执行失败和摘要输出。
- [ ] 4.3 添加聊天编排测试，覆盖需要补查历史 artifact、动作详情、推荐原因和工具失败回退的场景。
- [ ] 4.4 添加 trace 测试，覆盖 tool decision、tool call、rag query、step limit 和最终工具上下文摘要。
- [ ] 4.5 运行 `npm test` 或相关测试命令验证 AI 编排、工具层和聊天回归。
- [ ] 4.6 运行 `npm run typecheck` 验证 TypeScript 类型边界。
- [ ] 4.7 如果改动影响构建、路由或服务端/客户端模块边界，运行 `npm run build`；如无法运行，记录原因。
