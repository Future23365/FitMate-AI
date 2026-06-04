## 1. 现状审计与边界确认

- [ ] 1.1 运行 `git status --short`，确认实现前工作区状态，并隔离无关改动。
- [ ] 1.2 读取当前 `AgentAction` / `final_answer` schema、Action Validator、final grounding 和 Response Renderer，确认训练推送终态合同的真实入口。
- [ ] 1.3 读取当前 prompt config、model input builder、tool manifest、schema summary、examples、observations、compressed tool results 和 repair feedback，确认模型实际可见输入来源。
- [ ] 1.4 读取当前 `searchExerciseResources` input/output schema、handler、repository 查询、model observation、user projection、trace projection 和 tool-level tests。
- [ ] 1.5 读取当前动作推荐跨轮事实桥保存与读取链路，确认它保存的是用户可见 projection、tool result 还是其他结构。
- [ ] 1.6 确认动作数据库中 `exerciseId` 与动作英文主键的关系，并记录服务端按该 id 读取动作详情的确定性入口。

## 2. `visibleTrainingProposal` 输出合同

- [ ] 2.1 新增或更新 `final_answer.visibleTrainingProposal` schema，包含 `schemaVersion`、`exerciseItems`、可选 `schedule`，并保持字段命名与“用户可见训练方案”作用一致。
- [ ] 2.2 定义 `exerciseItems` 动作项 schema：`exerciseId`、`section`、`order` 和可选 `prescription`；`section` 只允许 `training`、`warmup`、`stretch`。
- [ ] 2.3 定义 `prescription` schema，并让处方绑定在动作项上；推荐动作场景允许缺少 `prescription`，编排 / 计划场景要求处方完整。
- [ ] 2.4 定义 `schedule` schema，只允许表达当前同一套编排的训练日 / 休息日安排，不允许每天内嵌不同完整编排。
- [ ] 2.5 更新 Action Validator / final grounding，校验 `exerciseId` 必须来自本轮 satisfied tool result 或当前用户可访问跨轮事实桥，并且存在于数据库。
- [ ] 2.6 更新结构化 repair feedback，覆盖未知 `exerciseId`、section 非法、编排缺处方、计划嵌套多套编排、正文承诺但缺少结构字段等失败。
- [ ] 2.7 更新类型导出和核心意图注释，说明 `visibleTrainingProposal` 是本轮可见训练方案事实源。

## 3. `searchExerciseResources` 多用途查询

- [ ] 3.1 扩展 `searchExerciseResourcesInputSchema`，新增或调整 `suitabilities` 多值字段，允许 `warmup`、`stretch` 以及主训练查询所需的受控用途表达。
- [ ] 3.2 更新 handler / repository 查询，使 `suitabilities = ["warmup", "stretch"]` 能在数据库结构化字段边界内查询候选。
- [ ] 3.3 更新 output schema 和 model observation，按 `warmup`、`stretch` 分组投影候选，并保留每个候选的 `exerciseId` 和安全摘要。
- [ ] 3.4 覆盖某个 suitability 候选为空的结构化诊断，确保 Agent 可选择重查、澄清或失败收口。
- [ ] 3.5 保持 `searchExerciseResources` 只读职责，不产出 `visibleTrainingProposal`、`prescription`、`schedule`、训练卡片、candidate set 或保存副作用。
- [ ] 3.6 更新 `tests/agent-tools/search-exercise-resources.test.ts`，直接覆盖 handler、成功路径、schema 拒绝、候选不足、分组投影、projection / redaction、只读边界和真实健身场景。
- [ ] 3.7 更新 `tests/agent-core/contract-helper.test.ts`，覆盖扩展后的 tool contract、policy metadata、resource / fulfillment、projection 和 redaction 边界。

## 4. Prompt 与模型可见合同

- [ ] 4.1 更新 Agent 通用输出合同，使模型知道训练推送类 `final_answer` 必须把用户实际可见训练方案放入 `visibleTrainingProposal`。
- [ ] 4.2 更新 `searchExerciseResources` manifest、schema description 和 examples，说明先确定 `training`，再基于主训练查询 `warmup` / `stretch` 的分阶段原则。
- [ ] 4.3 更新 ContextPackage / fact bridge observation，向模型投影最近可见 `visibleTrainingProposal` 的 `training` 动作、section 摘要和 schedule 摘要。
- [ ] 4.4 更新 compressed tool results / observations，避免把 output-only 字段表达成下一轮可复制 input。
- [ ] 4.5 确保所有描述性自然语言 prompt / manifest / schema description / examples / repair feedback / observation 默认使用中文，字段名、枚举值、toolName 和 schema id 保持英文。
- [ ] 4.6 编写 prompt / manifest 测试，断言相关说明不包含关键词、正则、同义词表或固定短句式业务分流规则。
- [ ] 4.7 更新 `tests/agent-core/agent-llm-prompt-config.test.ts` 和 `tests/agent-core/tool-registry-manifest.test.ts`，覆盖模型可见输出合同、tool manifest、schema summary 和语言要求。

## 5. Renderer、事实桥与前端事件

- [ ] 5.1 更新 Response Renderer，使动作推荐、编排和计划的用户可见结构化事件只从已校验 `visibleTrainingProposal` 渲染。
- [ ] 5.2 当 `visibleTrainingProposal` 只包含 `training` 且无处方时，渲染为动作推荐事件或等价卡片数据。
- [ ] 5.3 当 `visibleTrainingProposal` 包含三段 section 和处方时，按 `warmup`、`training`、`stretch` 顺序渲染编排事件或等价卡片数据。
- [ ] 5.4 当 `visibleTrainingProposal` 包含 `schedule` 时，在同一套编排基础上渲染训练日 / 休息日安排，不生成每日独立编排。
- [ ] 5.5 更新跨轮事实桥，在确认本轮 assistant response 已对用户可见后保存同一份 `visibleTrainingProposal`。
- [ ] 5.6 更新跨轮事实桥读取投影，使下一轮 Agent 能复用上一轮 `training` 动作并按需补 `warmup` / `stretch` 或 `schedule`。
- [ ] 5.7 更新前端聊天客户端类型和事件消费边界，确保后续卡片从结构化事件读取事实，正文只作为解释文本。

## 6. Runtime 回归与安全边界

- [ ] 6.1 更新 `tests/agent-core/planner-validator.test.ts`，覆盖 `visibleTrainingProposal` 合法、非法 action、unknown id、缺处方、非法 schedule 等终态校验。
- [ ] 6.2 更新 `tests/agent-core/executor-runtime-renderer.test.ts`，覆盖 renderer 从同一结构渲染动作推荐、编排、计划。
- [ ] 6.3 更新 `tests/chat-service.test.ts` 或当前生产聊天回归测试，覆盖只推荐动作调用 1 次 tool、直接编排调用 training 后再 warmup / stretch、基于上一轮动作编排只补查 warmup / stretch、已有编排生成计划只输出 schedule。
- [ ] 6.4 更新 fact bridge 相关测试，覆盖保存点在用户可见 response 之后，且下一轮读取的事实与上一轮渲染结构一致。
- [ ] 6.5 更新 `tests/agent-core/architecture-boundary.test.ts`，证明 `/api/chat`、agent-core 和 `searchExerciseResources` 不新增服务端关键词分流、业务 toolName 特判或隐藏编排器。
- [ ] 6.6 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [ ] 6.7 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [ ] 6.8 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [ ] 6.9 运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts`。
- [ ] 6.10 运行与 final grounding、renderer、fact bridge 和 chat service 相关的最窄自动化测试。
- [ ] 6.11 运行 `npm run typecheck`。

## 7. 文档与收口

- [ ] 7.1 如果实现改变核心链路或架构边界，按项目规则在 `docs/方案变更历史/` 新增方案变更记录，并在 `docs/项目演变历程.md` 追加摘要。
- [ ] 7.2 运行 `openspec validate unify-visible-training-proposal --strict`。
- [ ] 7.3 运行 `openspec status --change unify-visible-training-proposal`，确认 change apply-ready。
- [ ] 7.4 最终检查 diff，确认未混入无关代码、旧方案兼容层或非本 change 文件。
