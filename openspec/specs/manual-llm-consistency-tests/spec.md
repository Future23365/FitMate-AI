# manual-llm-consistency-tests Specification

## Purpose
TBD - created by archiving change add-manual-llm-consistency-tests. Update Purpose after archive.
## Requirements
### Requirement: Manual LLM consistency tests are isolated

项目 MUST 提供一套只在开发者手动执行时运行的 LLM 输入输出一致性测试。该测试 MUST NOT 被 `npm run test` 自动发现、自动运行或作为常规 CI 风险门禁的一部分。

#### Scenario: Default test command excludes LLM consistency tests

- **WHEN** 开发者在项目根目录执行 `npm run test`
- **THEN** 系统 MUST NOT 运行任何真实 LLM 输入输出一致性测试
- **AND** 系统 MUST NOT 因缺少 `DEEPSEEK_API_KEY` 或外部模型网络不可用而导致 `npm run test` 失败

#### Scenario: Manual command runs LLM consistency tests

- **WHEN** 开发者执行专用手动 LLM 测试命令
- **THEN** 系统 MUST 运行 LLM 输入输出一致性测试
- **AND** 测试输出 MUST 明确显示被运行的 LLM 调用点、用例名称和通过或失败结果
- **AND** 测试开始前 MUST 输出本次运行的粗略 token 消耗预估

#### Scenario: Missing model configuration is explicit

- **WHEN** 开发者执行专用手动 LLM 测试命令但缺少必需模型配置
- **THEN** 系统 MUST 输出缺失配置名称
- **AND** 系统 MUST NOT 静默改用 mock、旧快照或非真实模型结果

### Requirement: Manual tests cover all current LLM call sites

手动 LLM 一致性测试 MUST 覆盖当前项目所有真实 LLM 调用点，并为每个调用点提供至少一个成功路径用例和关键分支用例。

#### Scenario: Chat intent resolution is covered

- **WHEN** 手动 LLM 一致性测试运行
- **THEN** 测试 MUST 覆盖 `/api/chat` 的聊天意图解析调用
- **AND** 测试 MUST 校验输出包含 `type`、`needsExerciseContext`、`canTriggerAction`、`missingActionFields` 和 `suggestedReplies`
- **AND** 需要动作上下文的分支 MUST 校验 `workoutIntent` 符合 `WorkoutPlanIntent` 结构

#### Scenario: Chat completion is covered

- **WHEN** 手动 LLM 一致性测试运行
- **THEN** 测试 MUST 覆盖 `/api/chat` 的用户可见回复调用
- **AND** 测试 MUST 校验回复是自然语言正文
- **AND** 回复 MUST NOT 包含内部 Trigger、JSON fenced block 或服务端流程字样

#### Scenario: Exercise recommendation generation is covered

- **WHEN** 手动 LLM 一致性测试运行
- **THEN** 测试 MUST 覆盖 `/api/ai/exercise-recommendations` 的动作推荐生成调用
- **AND** 测试 MUST 校验模型返回的每个 `exerciseId` 都来自输入候选动作
- **AND** 换一批用例 MUST 校验模型没有返回 `excludedExerciseIds` 中的动作

#### Scenario: Workout plan intent extraction is covered

- **WHEN** 手动 LLM 一致性测试运行
- **THEN** 测试 MUST 覆盖 `/api/ai/workout-plan` 的训练计划意图抽取调用
- **AND** 测试 MUST 校验输出符合 `WorkoutPlanIntent`
- **AND** 测试 MUST 覆盖 `plan` 和 `routine` 两种 `intentType`

#### Scenario: Workout draft generation is covered

- **WHEN** 手动 LLM 一致性测试运行
- **THEN** 测试 MUST 覆盖 `/api/ai/workout-plan` 的训练草稿生成调用
- **AND** 长期计划用例 MUST 校验输出符合 `WorkoutPlanDraft`
- **AND** 单次训练用例 MUST 校验输出符合 `WorkoutRoutineDraft`
- **AND** 所有草稿动作的 `exerciseId` MUST 来自输入候选动作

### Requirement: Manual tests cover current LLM branches

手动 LLM 一致性测试 MUST 覆盖当前 prompt 和服务端 LLM 输入输出契约中的主要分支，避免只验证单一路径。

#### Scenario: Chat intent branches are covered

- **WHEN** 手动 LLM 一致性测试运行聊天意图解析用例
- **THEN** 测试 MUST 覆盖 `general_fitness_advice`、`exercise_recommendation`、`workout_plan`、`routine`、`exercise_replacement`、`exercise_explanation` 和 `non_fitness`
- **AND** 测试 MUST 覆盖 `canTriggerAction=true` 和 `canTriggerAction=false`
- **AND** 信息不足用例 MUST 校验 `missingActionFields` 非空且 `suggestedReplies` 使用用户第一人称口吻

#### Scenario: Conversation context branches are covered

- **WHEN** 手动 LLM 一致性测试运行包含上下文的用例
- **THEN** 测试 MUST 覆盖复用 `fitnessConversationContext.currentIntent` 的换一批动作场景
- **AND** 测试 MUST 覆盖从 `fitnessConversationContext.knownFacts` 沿用目标、器械、经验或限制的场景

#### Scenario: Safety and non-fitness branches are covered

- **WHEN** 手动 LLM 一致性测试运行安全相关用例
- **THEN** 高风险健康场景 MUST 在可见回复中触发咨询医生或专业人士的安全提醒
- **AND** 非健身问题 MUST 输出 `type=non_fitness`
- **AND** 非健身问题 MUST NOT 请求动作上下文或触发训练生成动作

#### Scenario: Candidate state branches are covered

- **WHEN** 手动 LLM 一致性测试运行带动作候选上下文的可见回复用例
- **THEN** `candidateStatus=enough` 和 `candidateStatus=limited_but_usable` 用例 MUST NOT 表达动作库无匹配
- **AND** `candidateStatus=insufficient` 用例 MUST 允许说明当前候选不足并建议放宽条件

#### Scenario: Draft generation branches are covered

- **WHEN** 手动 LLM 一致性测试运行训练草稿生成用例
- **THEN** `plan` 用例 MUST 输出 `days`
- **AND** `routine` 用例 MUST 输出 `kind="routine"` 和 `sections`
- **AND** `routine` 用例 MUST 包含 `warmup`、`training` 和 `stretch` 三个阶段

### Requirement: Manual tests report actionable failures

手动 LLM 一致性测试失败时 MUST 输出足够定位问题的信息，帮助开发者判断是 prompt 变化、模型输出漂移、输入 fixture 过期还是服务端结构校验失败。

#### Scenario: Structural assertion fails

- **WHEN** 模型输出没有通过 JSON 解析、Schema 校验或关键字段断言
- **THEN** 测试失败报告 MUST 包含调用点名称、用例名称、期望断言、实际输出和失败原因

#### Scenario: Natural language guardrail fails

- **WHEN** 可见回复包含内部 Trigger、JSON fenced block、候选外动作名或禁止的 UI 流程字样
- **THEN** 测试失败报告 MUST 标出命中的禁止项
- **AND** 测试失败报告 MUST 保留模型原始正文

#### Scenario: Flow failure records downstream skipped turns

- **WHEN** 多轮黑盒流程中的任意一轮失败
- **AND** 同一 fixture 中仍有后续轮次
- **THEN** 验收报告 MUST 将后续轮次记录为 skipped
- **AND** skipped 记录 MUST 包含导致跳过的失败摘要
- **AND** 本次运行的报告轮次数 MUST 等于 fixture 中定义的总轮次数

#### Scenario: Manual run summary is emitted

- **WHEN** 专用手动 LLM 测试命令结束
- **THEN** 系统 MUST 输出测试总数、通过数、失败数和被跳过数
- **AND** 系统 MUST 输出模型返回的 `prompt_tokens`、`completion_tokens` 和 `total_tokens` 汇总
- **AND** 任一非跳过测试失败时命令 MUST 以非零退出码结束

#### Scenario: Acceptance report is written

- **WHEN** 专用手动 LLM 测试命令结束
- **THEN** 系统 MUST 生成一份测试后验收文档
- **AND** 验收文档 MUST 包含用例通过/失败数量、真实 token 汇总和简要人工验收结果
- **AND** 简要人工验收结果 MUST 能展示用户提问、大模型回答摘要和本地解析或断言结果

### Requirement: 详细 LLM 黑盒 fixture 必须治理重复覆盖

系统 SHALL 让详细 LLM 黑盒 fixture 保持可解释覆盖，避免严格重复的真实模型用例长期存在。

#### Scenario: 严格重复 flow 被检测

- **WHEN** 开发者运行不调用真实模型的 LLM fixture 元数据检查
- **THEN** 系统 MUST 检测三轮用户输入完全相同的详细 flow
- **AND** 检测结果 MUST 输出重复 flow id、重复输入序列和建议处理方式
- **AND** 严格重复 flow 未被标记为允许重复时，检查 MUST 失败

#### Scenario: 重复 flow 的独有断言被保留

- **WHEN** 开发者删除、合并或改写严格重复 flow
- **THEN** 系统 MUST 保留被删除 flow 中独有的卡片类型断言、语义断言、引用断言和禁用关键词断言
- **AND** 如果独有断言无法合并到保留 flow，系统 MUST 将被删除 flow 改写为覆盖不同风险的输入序列

#### Scenario: 高重叠 flow 有明确覆盖意图

- **WHEN** 多个详细 flow 使用相同起点或相同中间输入
- **THEN** 每个保留 flow MUST 通过元数据或说明表达不同覆盖目标
- **AND** 报告 MUST 能展示这些 flow 归属的能力分组

### Requirement: 详细 LLM 黑盒测试必须支持分层与分组运行

系统 SHALL 支持按稳定 suite 层级和能力分组运行详细 LLM 黑盒测试子集，降低日常调试成本。

#### Scenario: flow 定义包含运行元数据

- **WHEN** 开发者新增或修改详细 LLM 黑盒 flow
- **THEN** 每个 flow MUST 声明所属 suite 层级
- **AND** 每个 flow MUST 声明至少一个能力分组
- **AND** 元数据检查 MUST 拒绝缺少 suite 或 group 的 flow

#### Scenario: 按能力分组运行

- **WHEN** 开发者执行手动 LLM 测试命令并指定能力分组
- **THEN** 系统 MUST 只运行属于该分组的 flow
- **AND** 控制台和报告 MUST 显示本次指定的分组、匹配 flow 数和匹配 turn 数
- **AND** 指定未知分组时命令 MUST 失败并输出可用分组列表

#### Scenario: 按 suite 层级运行

- **WHEN** 开发者执行手动 LLM 测试命令并指定详细核心、详细扩展或其他已定义 suite 层级
- **THEN** 系统 MUST 只运行该 suite 层级包含的 flow
- **AND** 系统 MUST NOT 把未指定的扩展或高风险分组混入本次运行

### Requirement: 手动 LLM runner 必须支持精确子集和失败重跑

系统 SHALL 允许开发者只运行指定 flow 或最近失败 flow，避免每次排查都运行完整详细套件。

#### Scenario: 按 flow id 运行

- **WHEN** 开发者通过命令参数指定一个或多个 flow id
- **THEN** 系统 MUST 只运行这些 flow id 对应的用例
- **AND** 指定不存在的 flow id 时命令 MUST 失败并输出未知 id
- **AND** 报告 MUST 记录本次运行的 flow id 筛选条件

#### Scenario: 从报告重跑失败 flow

- **WHEN** 开发者指定从某份 LLM 黑盒报告重跑失败用例
- **THEN** 系统 MUST 从报告中提取最终状态为 failed 的 flow id
- **AND** 系统 MUST 只运行这些失败 flow
- **AND** 如果报告中没有失败 flow，命令 MUST 明确输出无需重跑并生成空运行或跳过摘要
- **AND** 如果报告无法解析失败 flow，命令 MUST 失败，不得静默运行完整套件

#### Scenario: 筛选结果为空

- **WHEN** suite、group、flow id 或失败报告筛选后的运行集合为空
- **THEN** 系统 MUST 阻止真实模型调用
- **AND** 系统 MUST 输出筛选条件、可用 flow id、可用 suite 和可用 group 摘要

### Requirement: 详细 LLM 黑盒测试必须支持受控 flow 级并发

系统 SHALL 在显式配置下支持不同 flow 并发运行，同时保持单个 flow 内多轮上下文串行。

#### Scenario: 默认串行运行

- **WHEN** 开发者未指定 LLM 黑盒并发配置
- **THEN** 系统 MUST 以并发数 1 运行 flow
- **AND** 报告 MUST 记录并发数为 1

#### Scenario: 显式启用 flow 级并发

- **WHEN** 开发者显式指定大于 1 的 LLM 黑盒并发数
- **THEN** 系统 MAY 并发运行不同 flow
- **AND** 同一个 flow 内的三轮对话 MUST 保持串行
- **AND** 每个 flow MUST 使用独立 conversationId，避免跨 flow 共享会话状态

#### Scenario: 并发报告顺序稳定

- **WHEN** flow 级并发运行完成
- **THEN** 报告中的 flow 和 turn 结果 MUST 按 fixture 定义顺序输出
- **AND** token 汇总、失败数、跳过数和通过数 MUST 与实际执行结果一致

### Requirement: 手动 LLM 报告必须展示运行范围与动态规模

系统 SHALL 让手动 LLM 黑盒报告展示本次实际运行范围，并从 fixture 动态计算规模与成本。

#### Scenario: 报告展示筛选范围

- **WHEN** 手动 LLM 黑盒测试运行结束
- **THEN** 报告 MUST 记录完整 fixture flow/turn 数
- **AND** 报告 MUST 记录本次实际运行 flow/turn 数
- **AND** 报告 MUST 记录 suite、group、flow id、失败报告来源和并发数等运行条件

#### Scenario: 报告展示未运行原因

- **WHEN** 本次运行只覆盖完整 fixture 的子集
- **THEN** 报告 MUST 说明未运行 flow 是因为筛选条件排除、前序失败级联跳过、preflight 不满足还是缺少模型 key
- **AND** 报告 MUST NOT 把筛选排除的 flow 统计为失败

#### Scenario: token 预估动态计算

- **WHEN** runner 输出 token 预估、跳过报告或控制台摘要
- **THEN** 系统 MUST 基于当前 fixture 和筛选后的实际运行集合计算 flow 数和 turn 数
- **AND** 系统 MUST NOT 使用硬编码的基础套件或详细套件规模
- **AND** fixture 增删后报告中的流程用例数和轮次数 MUST 自动反映最新定义

#### Scenario: 去重检查结果进入报告

- **WHEN** 手动 LLM 黑盒测试运行结束
- **THEN** 报告 SHOULD 记录 fixture 去重检查摘要
- **AND** 如果存在未处理的严格重复 flow，报告 MUST 标记该运行存在 fixture 治理风险

### Requirement: 黑盒报告必须记录确定性引用讲解诊断

系统 SHALL 让手动 LLM 黑盒 runner 记录确定性引用讲解路径的引用解析状态，避免用户可见回复正确但报告因缺少 `assistant_action` 而误判。

#### Scenario: 序号动作讲解 resolved 状态可见

- **WHEN** 用户在同一会话中基于最近训练卡片输入“第一个动作怎么做”
- **AND** 服务端通过确定性路径读取 recent artifact 和动作库生成讲解
- **THEN** 黑盒 runner MUST 记录 `referenceResolutionStatus = resolved`
- **AND** 报告 MUST 记录 artifactId、artifactKind 和 payload 读取状态
- **AND** 该轮 MUST NOT 仅因为没有 `assistant_action` 事件而判定引用解析失败

#### Scenario: 确定性引用失败仍然失败

- **WHEN** 用户请求序号动作讲解
- **AND** 服务端无法读取当前用户可访问的 artifact payload 或无法定位具体 `exerciseId`
- **THEN** 黑盒 runner MUST 将该轮记录为语义断言失败
- **AND** 报告 MUST 记录失败原因
- **AND** 系统 MUST NOT 把无训练卡片当作该轮通过的充分条件

### Requirement: token 预估必须优先使用真实运行校准

系统 SHALL 在手动 LLM 黑盒测试启动前使用最近一次可用真实运行报告校准 token 预估，只有缺少可用真实报告时才使用 fallback。

#### Scenario: 基础套件使用最近真实报告均值

- **WHEN** 开发者执行 `npm run test:llm`
- **AND** `docs/manual-llm-blackbox-flow-latest-report.md` 中存在真实模型运行状态
- **AND** 报告包含有效 `total_tokens` 和轮次数
- **THEN** token 预估 MUST 基于该报告的真实 token 均值或总量校准
- **AND** 输出和新报告 MUST 标明估算来源为真实报告校准
- **AND** 系统 MUST NOT 在该条件下退回过低 fallback 估算

#### Scenario: 缺少真实报告时 fallback 标注明确

- **WHEN** 最近报告缺失、为跳过报告或缺少有效 token 字段
- **THEN** token 预估 MAY 使用 fixture 数量、轮次数和保守均值生成
- **AND** 输出和报告 MUST 标明估算来源为 fallback
- **AND** 系统 MUST NOT 将跳过报告的 `total_tokens = 0` 当作真实成本基线

### Requirement: 手动 LLM 测试必须支持详细套件入口

系统 SHALL 在保留默认基准测试和基础 LLM 黑盒测试的同时，提供显式详细 LLM 黑盒测试入口。

#### Scenario: 默认测试仍运行基准套件

- **WHEN** 开发者在项目根目录执行 `npm run test`
- **THEN** 系统 MUST 运行原有普通 Vitest 基准测试
- **AND** 系统 MUST NOT 运行真实模型 LLM 黑盒测试
- **AND** 系统 MUST NOT 因缺少 `DEEPSEEK_API_KEY` 或外部模型网络不可用而失败

#### Scenario: 详细参数运行详细 LLM 套件

- **WHEN** 开发者在项目根目录执行 `npm run test --detail`
- **THEN** 系统 MUST 运行详细 LLM 首页聊天黑盒测试
- **AND** 系统 MUST 使用真实模型测试入口
- **AND** 系统 MUST NOT 静默改用 mock、旧快照或非真实模型结果

#### Scenario: 基础 LLM 命令保持兼容

- **WHEN** 开发者执行 `npm run test:llm`
- **THEN** 系统 MUST 继续运行基础 LLM 首页聊天黑盒流程
- **AND** 系统 MUST NOT 自动升级为详细套件

### Requirement: 详细 LLM 套件必须扩展首页聊天能力覆盖

系统 SHALL 在详细 LLM 套件中覆盖比基础套件更完整的首页聊天流程能力。

#### Scenario: 详细套件包含基础套件

- **WHEN** 详细 LLM 套件被选择
- **THEN** 系统 MUST 包含基础 LLM 套件中的所有流程用例
- **AND** 系统 MUST 为每个流程保持 3 轮多轮对话结构

#### Scenario: 详细套件覆盖主要能力域

- **WHEN** 详细 LLM 套件运行
- **THEN** 系统 MUST 覆盖基础回复、动作推荐、单次训练、长期计划、多轮上下文、引用修改、安全边界和输出质量场景
- **AND** 系统 MUST 继续只断言用户可见文本、内部字段泄漏和卡片类型这些稳定黑盒结果

### Requirement: 详细 LLM 套件必须生成独立报告

系统 SHALL 为详细 LLM 套件生成独立报告，避免覆盖基础 LLM 测试报告。

#### Scenario: 详细套件报告独立写入

- **WHEN** 详细 LLM 套件运行结束
- **THEN** 系统 MUST 写入 `docs/manual-llm-blackbox-flow-detail-latest-report.md`
- **AND** 报告 MUST 标明当前运行的是详细套件
- **AND** 报告 MUST 包含流程用例数、轮次数、通过数、失败数、跳过数、预计 token 和真实 token 汇总

#### Scenario: 缺少模型配置时详细报告记录跳过

- **WHEN** 开发者执行 `npm run test --detail` 但缺少 `DEEPSEEK_API_KEY`
- **THEN** 系统 MUST 输出缺失配置名称
- **AND** 系统 MUST 生成详细套件跳过报告
- **AND** 系统 MUST 记录所有详细流程轮次被跳过

### Requirement: 测试模式边界必须清晰可追踪

系统 SHALL 明确区分默认基准测试、基础 LLM 黑盒测试和完整/详细 LLM 黑盒测试，避免开发者误读测试结果。

#### Scenario: 基础测试结果不得代表完整回归

- **WHEN** 开发者只执行 `npm run test:llm`
- **THEN** 系统 MUST 只运行基础 LLM 首页聊天黑盒流程
- **AND** 报告或说明文档 MUST NOT 表达为完整/详细套件已经通过
- **AND** 开发者 MUST 能从文档中确认完整/详细套件需要通过 `npm run test --detail` 单独执行

#### Scenario: 完整测试说明当前自动化边界

- **WHEN** 开发者查看详细 LLM 测试说明或 OpenSpec change 文档
- **THEN** 文档 MUST 说明详细套件覆盖 `LLM完整测试.md` 中的主要首页聊天能力域
- **AND** 文档 MUST 说明详细套件首版不等于 `LLM完整测试.md` 的所有流程和人工 UI 验收项已经全部自动化
- **AND** 文档 MUST 标出后续可继续补齐的方向，包括更真实的 HTTP/API runner、数据库 artifact 持久化链路和更细的语义断言

#### Scenario: 报告结果必须带有套件语义

- **WHEN** 任一手动 LLM 黑盒报告生成
- **THEN** 报告 MUST 能区分基础套件和详细套件
- **AND** 报告 MUST 让开发者看出该结果只代表最近一次运行
- **AND** 报告 MUST 保留 token 预估和真实 token 汇总，便于判断真实模型成本

