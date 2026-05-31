## 1. 工具基础设施

- [x] 1.1 新增 `lib/server/ai/tools/` 模块，定义 `ControlledReadTool`、`ControlledToolContext`、`ControlledToolResult` 和统一错误结构。
- [x] 1.2 实现只读 tool registry，注册 `searchArtifacts`、`getArtifactPayload`、`getExerciseById`、`searchExercises`，并确保 registry 不包含写工具。
- [x] 1.3 为每个只读工具实现 Zod 输入 Schema、服务端权限上下文传递、稳定模型摘要 Schema 和 trace 摘要函数。
- [x] 1.4 实现 tool executor，统一处理工具名白名单、Schema 校验、执行、耗时统计、错误归一化和摘要输出。

## 2. LLM 只读 Tool Loop

- [x] 2.1 新增 `runReadonlyToolLoop`，支持最多配置步数、模型 tool decision、工具执行、上下文摘要聚合和停止条件。
- [x] 2.2 首版固定使用受控 JSON tool decision 协议，不接入标准 `tools` / `tool_choice` 作为运行时契约，并用服务端 Schema 校验模型输出。
- [x] 2.3 将 tool loop 接入 `/api/chat` 意图解析、用户记忆和引用解析之后，作为可选补查上下文阶段。
- [x] 2.4 确保 tool loop 只补充上下文，不绕过 resolved intent、ReferenceResolver、Validator、PolicyEngine 或 ConfirmationGate。
- [x] 2.5 为工具失败、未选择工具、越权、Schema 失败和步数上限实现确定性回退。
- [x] 2.6 添加 `ENABLE_READONLY_LLM_TOOLS` 服务端 feature flag，默认关闭；关闭时 `/api/chat` 完全跳过 `runReadonlyToolLoop` 并记录 skipped reason。
- [x] 2.7 将 `ReadonlyToolContextBundle` 显式接入最终回复 prompt，确保未成功读取的数据库内容不会被回复声称已读取。
- [x] 2.8 覆盖引用澄清、Patch 已处理、动作讲解已处理和 artifact 生成已处理等确定性早返回路径，避免 tool loop 重复决策。
- [x] 2.9 实现首版触发矩阵：只允许历史 artifact 解释、动作详情补查、推荐理由解释和计划理由解释进入 tool loop；生成型 plan/routine/recommendation/patch 主流程不得进入 tool loop 改变执行决策。

## 3. Trace 与上下文预算

- [x] 3.1 扩展 AI Trace step 类型，新增 `tool_decision`，并记录 tool call、rag query、step limit 和回退策略。
- [x] 3.2 更新 `aiRunTraceToolVersions`，为只读 tool loop、registry 和首批工具声明版本。
- [x] 3.3 确保所有工具输出进入模型前经过字段裁剪、候选数量限制和长度预算控制，默认 `maxSteps = 3`、最多 3 次额外 tool decision 模型调用、总耗时 8 秒、`searchArtifacts` 最多 12 条、`searchExercises` 最多 24 条、单项自由文本 300 字符、bundle 6000 字符。
- [x] 3.4 如调试页已有对应展示逻辑，更新 `/dev/ai-traces` 展示只读工具决策和执行摘要。
- [x] 3.5 为 `exercise_recommendation`、`routine`、`plan`、`patch` 四类 artifact 实现并测试稳定模型摘要 Schema，避免完整 payload 进入 prompt 或 trace。
- [x] 3.6 实现 bundle 截断优先级：已 resolved artifact、具体动作详情、当前问题相关训练结构、artifact 候选、exercise 候选。
- [x] 3.7 trace 记录额外 tool decision 模型调用次数、工具执行次数、总耗时、step limit、timeout、stop reason 和 feature flag disabled 跳过原因。

## 4. 测试与验证

- [x] 4.1 添加 tool registry 单元测试，覆盖注册工具集合、写工具不可注册、未知工具拒绝。
- [x] 4.2 添加 tool executor 单元测试，覆盖 Schema 成功、Schema 失败、权限失败、执行失败和摘要输出。
- [x] 4.3 添加 JSON tool decision 单元测试，覆盖合法调用、finish、非法 JSON、多工具请求、未知 action、未知工具名和缺少 reason。
- [x] 4.4 添加聊天编排测试，覆盖需要补查历史 artifact、动作详情、推荐原因、工具失败回退、feature flag 关闭、确定性早返回跳过 tool loop 和生成型流程不被 tool loop 改写的场景。
- [x] 4.5 添加 trace 测试，覆盖 tool decision、tool call、rag query、step limit、timeout、额外模型调用计数、bundle 截断和最终工具上下文摘要。
- [x] 4.6 添加 artifact 摘要 Schema 测试，覆盖四类 artifact 的字段集合、字段长度和完整 payload 不泄漏。
- [x] 4.7 更新 `docs/方案变更历史/`，按需追加 `docs/项目演变历程.md` 记录只读 LLM tool calling 的核心链路变化。
- [x] 4.8 运行 `npm test` 或相关测试命令验证 AI 编排、工具层和聊天回归。
- [x] 4.9 运行 `npm run typecheck` 验证 TypeScript 类型边界。
- [x] 4.10 如果改动影响构建、路由或服务端/客户端模块边界，运行 `npm run build`；如无法运行，记录原因。
