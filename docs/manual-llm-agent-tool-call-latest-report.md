# 手动 LLM 单次 Agent Tool 调用流程测试报告
生成时间：2026-06-02T18:59:23.789+08:00
模型：deepseek-v4-flash
运行命令：npm run test:llm:agent-tool --disable-legacy-events --dry-run
runner 类型：api_route
dryRun：true
旧兼容事件：关闭
真实/跳过状态：跳过或环境未满足
## 汇总
- 用例数：8
- 轮次数：8
- 通过：0
- 失败：0
- 跳过：8
- 需复核：0
- 预计输入 token：19412
- 预计输出 token：6080
- 预计总 token：25492
- 估算来源：fallback
- 估算口径：按 8 个单次 Agent tool case 和保守均值估算。
- prompt_tokens：0
- completion_tokens：0
- total_tokens：0
- token 偏差摘要：本次没有真实 token usage，通常表示 dry-run、跳过或运行失败。
## 运行范围
- 完整 fixture case 数：8
- 本次筛选 case 数：8
- 筛选条件：ids=all; groups=all; tools=all; statuses=all; states=all
- 未运行 case 数：0
- 未运行原因：--dry-run 开启。
- 并发数：1
## Preflight
- 状态：skipped
- 模型 key：可用
- 数据库：不可用
- artifact 表：不可用
- seed 数据：不可用
- 原因：--dry-run 已开启，只生成筛选、预估和跳过报告，不请求真实模型。
## 最终状态枚举
- `passed`：执行基础、tool 选择和结果合同断言都通过。
- `failed`：P0/P1/P2 自动断言失败。
- `skipped`：缺少 key、dry-run、preflight 未满足或 failed-from-report 没有失败用例。
- `needs_review`：仅 P3 内容质量需要人工复核，不计为通过。
## 断言分层
- 执行基础：stream 成功、回复非空、`AgentExecutionResult` 和 `dependencyGraph` 存在。
- tool 选择：Agent status、必需 tool、禁用 tool、训练卡片类型和 legacy path skip。
- 结果合同：candidateSetId、validationId、revisionId、usedToolResultIds、repair 和未注册资源引用。
## 失败分类摘要
- 本次没有失败用例。
## 用例结果
### AT01 胸部动作推荐

- 状态：跳过
- 来源：F01 第 1 轮
- group：recommendation
- stateFixture：empty
- 用户输入：今天我想练胸
- 期望结果：LLM 应选择动作检索和受控保存工具，生成动作推荐 artifact，不升级 routine 或 plan。
- 期望 Agent status：generated
- 实际 Agent status：missing
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：无卡片
- 必需 tool：searchExercises, saveConversationArtifactRevision
- 禁止 tool：generateRoutineDraft, generatePlanDraft
- 实际 tool：无
- assistant 摘要：未请求真实模型。
- 执行基础断言：skipped
- tool 选择断言：skipped
- 结果合同断言：skipped
- 跳过原因：--dry-run 已开启，只生成筛选、预估和跳过报告，不请求真实模型。
- conversationId：manual-llm-AT01-mpwiz8y3-17pfsb

### AT02 居家背部 routine

- 状态：跳过
- 来源：F04 第 1 轮
- group：routine
- stateFixture：empty
- 用户输入：今天在家练背30分钟
- 期望结果：LLM 应围绕单次 routine 调用检索、生成、校验和保存工具，不应误生成长期 plan。
- 期望 Agent status：generated
- 实际 Agent status：missing
- 期望卡片类型：workout_routine
- 实际卡片类型：无卡片
- 必需 tool：searchExercises, generateRoutineDraft, validateRoutineDraft, saveConversationArtifactRevision
- 禁止 tool：generatePlanDraft
- 实际 tool：无
- assistant 摘要：未请求真实模型。
- 执行基础断言：skipped
- tool 选择断言：skipped
- 结果合同断言：skipped
- 跳过原因：--dry-run 已开启，只生成筛选、预估和跳过报告，不请求真实模型。
- conversationId：manual-llm-AT02-mpwiz8y4-0j6ijk

### AT03 每周 4 练增肌计划

- 状态：跳过
- 来源：F19 第 1 轮
- group：plan
- stateFixture：empty
- 用户输入：给我一个每周4练增肌计划
- 期望结果：LLM 应保持长期 plan 语义，调用 plan 生成和校验工具。
- 期望 Agent status：generated
- 实际 Agent status：missing
- 期望卡片类型：workout_plan
- 实际卡片类型：无卡片
- 必需 tool：searchExercises, generatePlanDraft, validatePlanDraft, saveConversationArtifactRevision
- 禁止 tool：generateRoutineDraft
- 实际 tool：无
- assistant 摘要：未请求真实模型。
- 执行基础断言：skipped
- tool 选择断言：skipped
- 结果合同断言：skipped
- 跳过原因：--dry-run 已开启，只生成筛选、预估和跳过报告，不请求真实模型。
- conversationId：manual-llm-AT03-mpwiz8y4-6rgpiw

### AT04 笼统训练请求先澄清

- 状态：跳过
- 来源：F03 第 1 轮
- group：clarification
- stateFixture：empty
- 用户输入：给我一套训练
- 期望结果：信息不足时应澄清或说明需要补充条件，不应调用生成和保存工具产出随机训练卡片。
- 期望 Agent status：needs_clarification 或 answered
- 实际 Agent status：missing
- 期望卡片类型：无固定卡片类型
- 实际卡片类型：无卡片
- 必需 tool：无
- 禁止 tool：generateRoutineDraft, generatePlanDraft, proposeWorkoutPatch, validateRoutineDraft, validatePlanDraft, validateWorkoutPatch, saveConversationArtifactRevision
- 实际 tool：无
- assistant 摘要：未请求真实模型。
- 执行基础断言：skipped
- tool 选择断言：skipped
- 结果合同断言：skipped
- 跳过原因：--dry-run 已开启，只生成筛选、预估和跳过报告，不请求真实模型。
- conversationId：manual-llm-AT04-mpwiz8y4-9f10ge

### AT05 非健身问题不进训练工具

- 状态：跳过
- 来源：F13 第 1 轮
- group：non_fitness
- stateFixture：empty
- 用户输入：明天天气怎么样？
- 期望结果：非健身输入不应触发动作检索、训练生成或 artifact 保存工具。
- 期望 Agent status：answered 或 blocked
- 实际 Agent status：missing
- 期望卡片类型：无固定卡片类型
- 实际卡片类型：无卡片
- 必需 tool：无
- 禁止 tool：searchExercises, generateRoutineDraft, generatePlanDraft, proposeWorkoutPatch, validateRoutineDraft, validatePlanDraft, validateWorkoutPatch, saveConversationArtifactRevision
- 实际 tool：无
- assistant 摘要：未请求真实模型。
- 执行基础断言：skipped
- tool 选择断言：skipped
- 结果合同断言：skipped
- 跳过原因：--dry-run 已开启，只生成筛选、预估和跳过报告，不请求真实模型。
- conversationId：manual-llm-AT05-mpwiz8y4-5yv3qp

### AT06 不存在动作不编造 artifact

- 状态：跳过
- 来源：F23 第 1 轮
- group：safety
- stateFixture：empty
- 用户输入：我想练你们库里没有的超级飞鸟跳
- 期望结果：点名不存在动作时可以检索或解释，但不能保存编造出来的训练 artifact。
- 期望 Agent status：needs_clarification 或 answered 或 blocked
- 实际 Agent status：missing
- 期望卡片类型：无固定卡片类型
- 实际卡片类型：无卡片
- 必需 tool：无
- 禁止 tool：saveConversationArtifactRevision
- 实际 tool：无
- assistant 摘要：未请求真实模型。
- 执行基础断言：skipped
- tool 选择断言：skipped
- 结果合同断言：skipped
- 跳过原因：--dry-run 已开启，只生成筛选、预估和跳过报告，不请求真实模型。
- conversationId：manual-llm-AT06-mpwiz8y4-6grqau

### AT07 解释最近推荐第一个动作

- 状态：跳过
- 来源：F15 第 3 轮
- group：reference
- stateFixture：recent_recommendation
- 用户输入：第一个动作怎么做
- 期望结果：已有最近推荐卡片时，应读取 artifact payload 解释动作，不应刷新推荐或生成训练。
- 期望 Agent status：answered
- 实际 Agent status：missing
- 期望卡片类型：无固定卡片类型
- 实际卡片类型：无卡片
- 必需 tool：getArtifactPayload
- 禁止 tool：searchExercises, generateRoutineDraft, generatePlanDraft, proposeWorkoutPatch, validateRoutineDraft, validatePlanDraft, validateWorkoutPatch, saveConversationArtifactRevision
- 实际 tool：无
- assistant 摘要：未请求真实模型。
- 执行基础断言：skipped
- tool 选择断言：skipped
- 结果合同断言：skipped
- 跳过原因：--dry-run 已开启，只生成筛选、预估和跳过报告，不请求真实模型。
- conversationId：manual-llm-AT07-mpwiz8y4-y7pben

### AT08 最近 routine 排除哑铃后 patch

- 状态：跳过
- 来源：W09 第 2 轮
- group：patch
- stateFixture：recent_routine
- 用户输入：不用哑铃了，换一个
- 期望结果：已有 routine 时，应读取 payload、检索替代候选、生成 patch、校验并保存新 revision。
- 期望 Agent status：patched
- 实际 Agent status：missing
- 期望卡片类型：workout_patch
- 实际卡片类型：无卡片
- 必需 tool：getArtifactPayload, searchExercises, proposeWorkoutPatch, validateWorkoutPatch, saveConversationArtifactRevision
- 禁止 tool：legacyIntentNormalize, runReadonlyToolLoop
- 实际 tool：无
- assistant 摘要：未请求真实模型。
- 执行基础断言：skipped
- tool 选择断言：skipped
- 结果合同断言：skipped
- 跳过原因：--dry-run 已开启，只生成筛选、预估和跳过报告，不请求真实模型。
- conversationId：manual-llm-AT08-mpwiz8y4-caxaqr
