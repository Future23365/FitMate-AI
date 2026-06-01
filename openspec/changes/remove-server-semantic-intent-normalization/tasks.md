## 1. 现状梳理

- [ ] 1.1 盘点 `/api/chat` 中所有会基于关键词、正则、短句模板或历史摘要改写 `type`、`action.kind`、`workoutIntent.intentType` 的服务端语义归一化分支。
- [ ] 1.2 标记仍允许保留的契约归一化逻辑，包括 schema 解析、空值规范化、字段一致性、引用需求、权限隔离、数据库存在性和 patch 范围校验。
- [ ] 1.3 梳理 `exercise_replacement`、`workout_patch`、`exercise_explanation` 当前被误要求 `workoutIntent` 或跳过引用解析的路径。

## 2. 意图契约重构

- [ ] 2.1 移除或停止调用服务端语义归一化分支，确保服务端不得用自然语言关键词重写 LLM 输出的高层意图。
- [ ] 2.2 将剩余逻辑收敛为契约校验函数，只处理结构合法性、一致性、引用需求和可执行门控。
- [ ] 2.3 按 action 类型区分必需字段：生成型 action 校验 `workoutIntent`，引用型 action 校验 `referenceRequirement`、`referenceResolution`、artifact payload 和目标范围。
- [ ] 2.4 当 LLM 输出存在结构冲突或不可执行时，进入 resolved intent repair、澄清或拒绝执行，不得改写成另一个 action。

## 3. 引用型替换流程

- [ ] 3.1 确保 `exercise_replacement` 和 `workout_patch` 必须进入 ReferenceResolver，并在引用不可用时返回澄清或引用选择。
- [ ] 3.2 确保替换目标动作必须存在于目标 artifact payload，且替换候选必须来自动作库。
- [ ] 3.3 确保 WorkoutPatchEngine 输出只修改目标动作或目标 item，保留非目标动作、section 和训练结构。
- [ ] 3.4 确保局部替换成功时返回 `workout_patch` 事件，而不是触发 routine 或 plan 重新生成。

## 4. Trace 与失败恢复

- [ ] 4.1 调整 trace，明确记录 LLM 原始意图、契约校验结果、repair 结果、引用解析结果和 patch 结果。
- [ ] 4.2 删除或改名会误导为“语义归一化成功”的 trace 字段，避免把服务端重写高层意图视为正常路径。
- [ ] 4.3 为契约失败、引用失败、patch 失败分别返回用户可理解的澄清或恢复提示。

## 5. 测试与验证

- [ ] 5.1 增加单元测试：LLM 输出 `exercise_replacement` 且 `workoutIntent` 为空时，不得被改写为 `routine` 或 `workout_plan`。
- [ ] 5.2 增加单元测试：包含“换成”、“改成”、“调整”等词的用户消息不得让服务端覆盖 LLM 的 `type` 或 `action.kind`。
- [ ] 5.3 增加 patch 流程测试：只替换 `Rope_Jumping` 时，目标 artifact 中其他动作和训练结构保持不变。
- [ ] 5.4 增加黑盒或集成测试：多轮对话中用户说“跳绳换成别的”后，应返回局部 patch 事件，不应生成新的 routine。
- [ ] 5.5 运行相关自动化测试，并按需运行 `npm run typecheck`；若影响构建边界，补跑 `npm run build` 或记录无法运行原因。

## 6. 文档收尾

- [ ] 6.1 更新相关架构或调试文档，说明 LLM 负责语义理解，服务端只负责契约校验和确定性执行。
- [ ] 6.2 若实现改变聊天主链路或 AI 编排边界，在 `docs/方案变更历史` 和 `docs/项目演变历程.md` 记录本次调整。
- [ ] 6.3 更新本 change 的任务状态，并在验证通过后准备归档。
