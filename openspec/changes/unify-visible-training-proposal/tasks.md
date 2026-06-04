## 1. 现状审计与边界确认

- [ ] 1.1 运行 `git status --short`，确认实现前工作区状态，并隔离无关改动。
- [ ] 1.2 读取当前 `AgentAction` / `final_answer` schema、Action Validator、final grounding、Response Renderer 和 `/api/chat` production 接入，确认训练推送终态合同的真实入口。
- [ ] 1.3 读取当前 prompt config、model input builder、tool manifest、schema summary、examples、observations、compressed tool results 和 repair feedback，确认模型实际可见输入来源。
- [ ] 1.4 读取当前 `searchExerciseResources` input/output schema、handler、repository 查询、model observation、user projection、trace projection 和 tool-level tests。
- [ ] 1.5 读取当前动作推荐跨轮事实桥保存与读取链路，列出旧字段和旧命名的完整产生方、消费方、模型可见说明、trace/replay、fixtures 和 tests。
- [ ] 1.6 确认动作数据库中 `Exercise.id` 与新合同 `exerciseId` 的关系，并记录服务端按该 id 读取动作详情的确定性入口。
- [ ] 1.7 确认现有 routine / plan draft schema 中 `mode`、`sets`、`target`、`setRestSeconds`、`transitionRestSeconds` 和 schedule 边界，作为 `visibleTrainingProposal` 的处方和计划校验依据。

## 2. 通用 `visibleOutputs[]` 输出合同

- [ ] 2.1 新增或更新 `final_answer.visibleOutputs[]` 通用 envelope schema，包含 `outputType`、`schemaVersion`、`payload`，并限制为 JSON 可序列化结构。
- [ ] 2.2 确保 `agent-core` 只校验 envelope 通用结构、数组大小、terminal grounding 和 JSON 边界，不读取 `visibleTrainingProposal` 业务字段。
- [ ] 2.3 新增 terminal output validator registry 或等价扩展点，使业务层能按 `outputType` 校验 payload，并在失败时进入结构化 repair、澄清或失败收口。
- [ ] 2.4 新增 visible output renderer registry 或等价扩展点，使 Response Renderer 能按 `outputType` 渲染结构化用户可见事件，但不在 core 中写 `visibleTrainingProposal` 业务分支。
- [ ] 2.5 更新结构化 repair feedback，覆盖未知 `outputType`、`schemaVersion` 不支持、payload 非法、正文承诺但缺少 visible output、业务 validator 失败等场景。
- [ ] 2.6 更新类型导出和核心意图注释，说明 `visibleOutputs[]` 是通用用户可见结构化输出扩展点，不承载具体业务语义。

## 3. `visibleTrainingProposal` payload 合同

- [ ] 3.1 定义 `visibleTrainingProposal` payload schema：`kind`、`exerciseItems`、可选 `schedule`，由 `outputType = "visibleTrainingProposal"` 和 `schemaVersion = "1"` 承载。
- [ ] 3.2 定义 `kind = "exercise_selection" | "routine" | "plan"`，并按 kind 做确定性结构校验：推荐、编排、计划三种结构不得互相混用。
- [ ] 3.3 定义 `exerciseItems` 动作项 schema：`exerciseId`、`section`、`order` 和可选 `prescription`；`section` 只允许 `training`、`warmup`、`stretch`。
- [ ] 3.4 定义 `prescription` schema，并对齐现有执行字段：`mode`、`sets`、`target`、`setRestSeconds`、`transitionRestSeconds`；不得新增 `restSeconds` 作为主合同字段。
- [ ] 3.5 定义 `schedule` schema：`cycleLengthDays`、`assignments[]`、`cycleDayIndex`、`type`；要求 `cycleDayIndex` 从 1 开始、覆盖 `1..cycleLengthDays`、不能重复，`type` 只允许 `training` / `rest`。
- [ ] 3.6 更新 terminal output validation，校验 `exerciseId` 必须来自本轮 satisfied `searchExerciseResources` 结果或当前用户可访问的 `visible_training_proposal_fact`，并且存在于数据库。
- [ ] 3.7 更新 terminal output validation，校验动作 section 与本轮候选分组或数据库 `allowedSections` 的确定性边界；服务端不得做语义纠错，只能拒绝、repair、澄清或失败收口。
- [ ] 3.8 更新结构化 repair feedback，覆盖未知 `exerciseId`、输出 `id` 而不是 `exerciseId`、section 非法、order 重复、编排缺处方、推荐误带 schedule、计划嵌套每日编排等失败。
- [ ] 3.9 更新类型导出和业务意图注释，说明 `visibleTrainingProposal` 是用户可见训练方案事实源，正文不作为训练事实源。

## 4. `searchExerciseResources` 多用途查询

- [ ] 4.1 扩展 `searchExerciseResourcesInputSchema`，删除旧单值 `suitability`，新增 `suitabilities` 多值字段，允许 `warmup`、`training`、`stretch` 受控用途表达。
- [ ] 4.2 更新 handler / repository 查询，使 `suitabilities = ["warmup", "stretch"]` 能在数据库结构化字段边界内查询候选；不得读取用户自然语言原文判断用途。
- [ ] 4.3 更新 output schema 和 model observation，按 `warmup`、`training`、`stretch` 分组投影候选，并保留每个候选的 `exerciseId` 和安全摘要。
- [ ] 4.4 更新模型可见投影，确保候选主键字段统一为 `exerciseId`；模型可见 observation、examples 和 schema summary 不再暴露可复制的 `id` 字段。
- [ ] 4.5 覆盖某个 suitability 候选为空的结构化诊断，确保 Agent 可选择重查、澄清或失败收口。
- [ ] 4.6 保持 `searchExerciseResources` 只读职责，不产出 `visibleTrainingProposal`、`prescription`、`schedule`、训练卡片、candidate set 或保存副作用。
- [ ] 4.7 更新 `tests/agent-tools/search-exercise-resources.test.ts`，直接覆盖 handler、成功路径、schema 拒绝、旧 `suitability` 拒绝、候选不足、分组投影、projection / redaction、只读边界和真实健身场景。
- [ ] 4.8 更新 `tests/agent-core/contract-helper.test.ts`，覆盖扩展后的 tool contract、policy metadata、resource / fulfillment、projection 和 redaction 边界。

## 5. Prompt 与模型可见合同

- [ ] 5.1 更新 Agent 通用输出合同，使模型知道结构化用户可见输出必须放入 `final_answer.visibleOutputs[]`，普通文本说明仍放在 `content`。
- [ ] 5.2 更新 `visibleTrainingProposal` 的模型可见 schema summary、examples 和 repair feedback，说明 `outputType`、`schemaVersion`、`payload.kind`、`exerciseItems`、`prescription` 和 `schedule` 的字段要求。
- [ ] 5.3 更新 `searchExerciseResources` manifest、schema description 和 examples，说明先确定 `training`，再基于主训练查询 `warmup` / `stretch` 的分阶段原则。
- [ ] 5.4 更新 ContextPackage / fact bridge observation，向模型投影最近可见 `visibleTrainingProposal` 的 `training` 动作、section 摘要、处方摘要和 schedule 摘要。
- [ ] 5.5 更新 compressed tool results / observations，避免把 output-only 字段表达成下一轮可复制 input，并确保候选 id 字段使用 `exerciseId`。
- [ ] 5.6 确保所有描述性自然语言 prompt / manifest / schema description / examples / repair feedback / observation 默认使用中文，字段名、枚举值、toolName、outputType 和 schema id 保持英文。
- [ ] 5.7 编写 prompt / manifest 测试，断言相关说明不包含关键词、正则、同义词表或固定短句式业务分流规则。
- [ ] 5.8 更新 `tests/agent-core/agent-llm-prompt-config.test.ts` 和 `tests/agent-core/tool-registry-manifest.test.ts`，覆盖模型可见输出合同、tool manifest、schema summary 和语言要求。

## 6. 删除旧动作推荐事实桥

- [ ] 6.1 删除旧事实桥主路径代码和类型，不再使用 `exercise_recommendation_displayed`、`exercise_recommendation_fact`、`displayedExerciseIds`、`displayedExercises` 保存新事实。
- [ ] 6.2 删除旧 read tool `readRecentExerciseRecommendationFact` 和生产 registry 注册；不保留 alias、兼容输入或转换层。
- [ ] 6.3 删除 `recentExerciseRecommendationFacts` 旧 run metadata 投影，改为 `recentVisibleTrainingProposals`。
- [ ] 6.4 删除旧模型可见说明、schema summary、examples、observations、compressed tool results 和 repair feedback 中对旧字段的引导。
- [ ] 6.5 新增或更新 `visible_training_proposal_displayed` / `visible_training_proposal_fact` / `readRecentVisibleTrainingProposal` / `recentVisibleTrainingProposals` 主路径。
- [ ] 6.6 明确旧数据库事实不兼容读取、不迁移、不投影给模型；如存在历史旧行，新链路直接忽略。
- [ ] 6.7 更新旧事实桥相关测试为 delete-only 断言：旧 read tool 不注册、旧字段不出现在模型可见输入、新事实桥不读取旧 payload。

## 7. Renderer、事实桥与前端事件

- [ ] 7.1 更新 Response Renderer，使动作推荐、编排和计划的用户可见结构化事件只从已校验 `visibleOutputs[]` 渲染。
- [ ] 7.2 当 `visibleTrainingProposal.payload.kind = "exercise_selection"` 时，渲染为动作推荐事件或等价卡片数据。
- [ ] 7.3 当 `visibleTrainingProposal.payload.kind = "routine"` 时，按 `warmup`、`training`、`stretch` 顺序渲染编排事件或等价卡片数据。
- [ ] 7.4 当 `visibleTrainingProposal.payload.kind = "plan"` 时，在同一套编排基础上渲染训练日 / 休息日安排，不生成每日独立编排。
- [ ] 7.5 更新跨轮事实桥，在确认本轮 assistant response 已对用户可见后保存同一份 `visibleTrainingProposal` payload，不得再从 `searchExerciseResources` 的 `tool_result`、handler output、model observation 或 user projection 直接抽取最终方案事实。
- [ ] 7.6 更新跨轮事实桥 payload schema，使保存内容覆盖 `exerciseItems` 的最终 `exerciseId`、`section`、`order`、`prescription` 和可选 `schedule`，并确保未进入最终方案的 tool 候选不会被投影成“上一轮这套训练”。
- [ ] 7.7 更新跨轮事实桥读取投影，使下一轮 Agent 能复用上一轮 `training` 动作并按需补 `warmup` / `stretch` 或 `schedule`。
- [ ] 7.8 更新前端聊天客户端类型和事件消费边界，确保后续卡片从结构化事件读取事实，正文只作为解释文本。

## 8. Runtime 回归与安全边界

- [ ] 8.1 更新 `tests/agent-core/planner-validator.test.ts`，覆盖 `visibleOutputs[]` 合法、非法 envelope、unknown outputType、unsupported schemaVersion、非法 action 和 terminal grounding 边界。
- [ ] 8.2 新增或更新 terminal output validator tests，覆盖 `visibleTrainingProposal` 合法、unknown id、输出 `id` 而不是 `exerciseId`、缺处方、非法 schedule、旧字段残留等业务 payload 校验。
- [ ] 8.3 更新 `tests/agent-core/executor-runtime-renderer.test.ts` 或对应 renderer 测试，覆盖 renderer 从同一结构渲染动作推荐、编排、计划。
- [ ] 8.4 更新 `tests/chat-service.test.ts` 或当前生产聊天回归测试，覆盖只推荐动作只需要 training 证据、直接编排先建立 training 证据再补 warmup / stretch、基于上一轮动作编排只补 warmup / stretch、已有编排生成计划只输出 schedule。
- [ ] 8.5 更新 fact bridge 相关测试，覆盖保存点在用户可见 response 之后，且下一轮读取的事实与上一轮渲染结构一致。
- [ ] 8.6 覆盖候选与最终方案边界：`searchExerciseResources` 返回但未进入 `visibleTrainingProposal` 的候选不得被保存或投影为上一轮方案。
- [ ] 8.7 覆盖 delete-only 旧命名边界：新主路径不得继续以 `exercise_recommendation_displayed`、`readRecentExerciseRecommendationFact`、`recentExerciseRecommendationFacts`、`displayedExerciseIds` 或 `displayedExercises` 承载或投影 `visibleTrainingProposal`。
- [ ] 8.8 更新 `tests/agent-core/architecture-boundary.test.ts`，证明 `/api/chat`、agent-core 和 `searchExerciseResources` 不新增服务端关键词分流、业务 toolName 特判、健身业务 outputType core 分支或隐藏编排器。
- [ ] 8.9 运行旧字段残留扫描，至少覆盖 `lib/server/agent-core`、`lib/server/agent-planners`、`lib/server/agent-tools`、`lib/server/chat`、相关 tests 和模型可见 prompt/manifest 构造入口。
- [ ] 8.10 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [ ] 8.11 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [ ] 8.12 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [ ] 8.13 运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts`。
- [ ] 8.14 运行与 final grounding、terminal output validation、renderer、fact bridge 和 chat service 相关的最窄自动化测试。
- [ ] 8.15 运行 `npm run typecheck`。

## 9. 文档与收口

- [ ] 9.1 如果实现改变核心链路或架构边界，按项目规则在 `docs/方案变更历史/` 新增方案变更记录，并在 `docs/项目演变历程.md` 追加摘要。
- [ ] 9.2 运行 `openspec validate unify-visible-training-proposal --strict`。
- [ ] 9.3 运行 `openspec status --change unify-visible-training-proposal`，确认 change apply-ready。
- [ ] 9.4 最终检查 diff，确认未混入无关代码、旧方案兼容层、旧字段别名或非本 change 文件。
