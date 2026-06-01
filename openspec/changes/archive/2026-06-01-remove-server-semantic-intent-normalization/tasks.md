## 1. 现状梳理

- [x] 1.1 盘点 `/api/chat` 中所有会基于关键词、正则、短句模板或历史摘要改写 `type`、`action.kind`、`workoutIntent.intentType` 的服务端语义归一化分支。
- [x] 1.2 标记仍允许保留的契约归一化逻辑，包括 schema 解析、空值规范化、字段一致性、引用需求、权限隔离、数据库存在性和 patch 范围校验。
- [x] 1.3 梳理 `exercise_replacement`、`workout_patch`、`exercise_explanation` 当前被误要求 `workoutIntent` 或跳过引用解析的路径。
- [x] 1.4 盘点 `createFallbackChatIntent`、ReferenceResolver 入口和 Workout Patch 聊天编排中仍用关键词决定高层 action 的旧路径。
- [x] 1.5 标记需要删除或改写的旧测试，尤其是直接断言 `normalizeChatIntentForBlackboxFlows` 改写短句高层意图的用例。

## 2. 意图契约重构

- [x] 2.1 移除或停止调用服务端语义归一化分支，确保服务端不得用自然语言关键词重写 LLM 输出的高层意图。
- [x] 2.2 将剩余逻辑收敛为契约校验函数，只处理结构合法性、一致性、引用需求和可执行门控。
- [x] 2.3 按 action 类型区分必需字段：生成型 action 校验 `workoutIntent`，引用型 action 校验 `referenceRequirement`、`referenceResolution`、artifact payload 和目标范围。
- [x] 2.4 当 LLM 输出存在结构冲突或不可执行时，进入 resolved intent repair、澄清或拒绝执行，不得改写成另一个 action。
- [x] 2.5 调整解析失败和 fallback 路径，确保 fallback 只产生安全回复、澄清或非执行建议，不得靠关键词触发 assistant action。
- [x] 2.6 保留字段补齐时，确保补齐只发生在 LLM 已经给出高层 action 之后，不得用补齐结果反推 `type` 或 `action.kind`。

## 3. 引用型替换流程

- [x] 3.1 确保 `exercise_replacement`、`workout_patch` 和依赖 artifact 的 `exercise_explanation` 由 `action.kind` / `referenceRequirement` 驱动进入 ReferenceResolver，并在引用不可用时返回澄清或引用选择。
- [x] 3.2 确保替换目标动作必须存在于目标 artifact payload，且替换候选必须来自动作库。
- [x] 3.3 确保 WorkoutPatchEngine 输出只修改目标动作或目标 item，保留非目标动作、section 和训练结构。
- [x] 3.4 确保局部替换成功时返回 `workout_patch` 事件，而不是触发 routine 或 plan 重新生成。
- [x] 3.5 将 patch 编排入口绑定到引用型 resolved action；“换成”“改成”“删除”等关键词只能辅助 operation/target 定位，不能单独触发 patch。
- [x] 3.6 按 action 类型校验 artifact kind：`exercise_replacement` / `workout_patch` 只允许 `routine` 或 `plan`，`exercise_explanation` 可读取推荐、routine 或 plan 中的目标动作。

## 4. Trace 与失败恢复

- [x] 4.1 调整 trace，明确记录 LLM 原始意图、契约校验结果、repair 结果、引用解析结果和 patch 结果。
- [x] 4.2 删除或改名会误导为“语义归一化成功”的 trace 字段，避免把服务端重写高层意图视为正常路径。
- [x] 4.3 为契约失败、引用失败、patch 失败分别返回用户可理解的澄清或恢复提示。

## 5. 测试与验证

- [x] 5.1 增加单元测试：LLM 输出 `exercise_replacement` 且 `workoutIntent` 为空时，不得被改写为 `routine` 或 `workout_plan`。
- [x] 5.2 增加单元测试：包含“换成”、“改成”、“调整”等词的用户消息不得让服务端覆盖 LLM 的 `type` 或 `action.kind`。
- [x] 5.3 增加 patch 流程测试：只替换 `Rope_Jumping` 时，目标 artifact 中其他动作和训练结构保持不变。
- [x] 5.4 增加黑盒或集成测试：多轮对话中用户说“跳绳换成别的”后，应返回局部 patch 事件，不应生成新的 routine。
- [x] 5.5 增加单元测试：LLM 输出解析失败或 schema 校验失败时，fallback 不得靠关键词产生可执行 action。
- [x] 5.6 增加单元测试：生成型 resolved action 即使命中“换成”“改成”“删除”等词，也不得进入 patch 执行流程。
- [x] 5.7 增加单元测试：引用型 action 缺少 `workoutIntent` 时不得被执行门控误判为缺失生成字段。
- [x] 5.8 删除或改写旧的语义归一化断言测试，避免继续要求服务端把短句改写成推荐、routine 或 plan。
- [x] 5.9 运行相关自动化测试，并按需运行 `npm run typecheck`；若影响构建边界，补跑 `npm run build` 或记录无法运行原因。

## 6. 文档收尾

- [x] 6.1 更新相关架构或调试文档，说明 LLM 负责语义理解，服务端只负责契约校验和确定性执行。
- [x] 6.2 若实现改变聊天主链路或 AI 编排边界，在 `docs/方案变更历史` 和 `docs/项目演变历程.md` 记录本次调整。
- [x] 6.3 更新本 change 的任务状态，并在验证通过后准备归档。
