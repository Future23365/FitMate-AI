# manual-llm-consistency-tests Specification

## Purpose
TBD - created by archiving change add-manual-llm-consistency-tests. Update Purpose after archive.
## Requirements
### Requirement: Manual LLM consistency tests are isolated

项目 MUST 提供一套只在开发者手动执行时运行的真实 LLM 测试。该测试 MUST NOT 被 `npm run test` 自动发现、自动运行或作为常规 CI 风险门禁的一部分。专用手动命令的主验收目标 MUST 是首页聊天黑盒流程，而不是直接验证内部 LLM 调用点。

#### Scenario: Default test command excludes LLM consistency tests

- **WHEN** 开发者在项目根目录执行 `npm run test`
- **THEN** 系统 MUST NOT 运行任何真实 LLM 输入输出一致性测试或首页聊天黑盒 LLM 流程测试
- **AND** 系统 MUST NOT 因缺少 `DEEPSEEK_API_KEY` 或外部模型网络不可用而导致 `npm run test` 失败

#### Scenario: Manual command runs LLM blackbox flow tests

- **WHEN** 开发者执行专用手动 LLM 测试命令
- **THEN** 系统 MUST 运行首页聊天黑盒 LLM 流程测试
- **AND** 测试输出 MUST 明确显示被运行的流程用例、轮次名称和通过或失败结果
- **AND** 测试开始前 MUST 输出本次运行的粗略 token 消耗预估

#### Scenario: Missing model configuration is explicit

- **WHEN** 开发者执行专用手动 LLM 测试命令但缺少必需模型配置
- **THEN** 系统 MUST 输出缺失配置名称
- **AND** 系统 MUST NOT 静默改用 mock、旧快照或非真实模型结果
- **AND** 系统 MUST 生成或保留清晰的跳过摘要，说明真实模型测试未运行

### Requirement: Manual tests report actionable failures

手动 LLM 测试失败时 MUST 输出足够定位问题的信息，帮助开发者判断是聊天链路错误、模型输出漂移、stream 解析失败、卡片推送缺失还是用例预期过期。

#### Scenario: Visible reply assertion fails

- **WHEN** assistant 用户可见回复为空、不可展示或泄漏内部 trigger、JSON fenced block、raw payload 或后台流程字样
- **THEN** 测试失败报告 MUST 包含流程用例名称、轮次名称、用户输入、期望结果、实际回复摘要和失败原因

#### Scenario: Card expectation fails

- **WHEN** 预期卡片没有推送、推送了错误卡片类型或在不应推送时出现训练卡片
- **THEN** 测试失败报告 MUST 包含流程用例名称、轮次名称、期望卡片类型、实际卡片类型、conversationId 和 responseMessageId
- **AND** 测试失败报告 MUST 保留 assistant 用户可见回复摘要

#### Scenario: Manual run summary is emitted

- **WHEN** 专用手动 LLM 测试命令结束
- **THEN** 系统 MUST 输出流程用例总数、轮次总数、通过数、失败数和被跳过数
- **AND** 系统 MUST 输出模型返回的 `prompt_tokens`、`completion_tokens` 和 `total_tokens` 汇总
- **AND** 任一非跳过测试失败时命令 MUST 以非零退出码结束

#### Scenario: Acceptance report is written

- **WHEN** 专用手动 LLM 测试命令结束
- **THEN** 系统 MUST 生成一份测试后验收文档
- **AND** 验收文档 MUST 包含用例通过/失败数量、预计 token 消耗、真实 token 汇总和简要人工验收结果
- **AND** 简要人工验收结果 MUST 能展示用户输入、assistant 用户可见回复摘要、期望卡片类型、实际卡片类型和本轮验证结果

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

系统 SHALL 让手动 LLM 黑盒 runner 记录 Agent 引用讲解路径的工具读取状态，避免用户可见回复正确但报告缺少执行证据。

#### Scenario: 序号动作讲解 resolved 状态可见

- **WHEN** 用户在同一会话中基于最近训练卡片输入“第一个动作怎么做”
- **AND** Agent 通过工具读取 recent artifact 和动作库生成讲解
- **THEN** 黑盒 runner MUST 记录 artifact tool result、artifactId、artifactKind、payload 读取状态和目标 exerciseId
- **AND** 报告 MUST 记录这些证据来自 Agent tool results
- **AND** 该轮 MUST NOT 依赖 `assistant_action` 或旧 resolved intent 判断引用解析是否成功

#### Scenario: 确定性引用失败仍然失败

- **WHEN** 用户请求序号动作讲解
- **AND** Agent 无法读取当前用户可访问的 artifact payload 或无法定位具体 `exerciseId`
- **THEN** 黑盒 runner MUST 将该轮记录为语义断言失败或需要澄清
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

### Requirement: 详细 LLM 黑盒测试必须贴近真实首页请求链路

系统 SHALL 让完整/详细 LLM 黑盒测试尽量按真实首页聊天路径执行多轮流程，避免测试 runner 获得真实页面没有的上下文能力。

#### Scenario: 详细套件通过 API 形态执行聊天轮次

- **WHEN** 开发者执行完整/详细 LLM 黑盒测试
- **THEN** 系统 MUST 使用与首页聊天一致的请求字段执行每轮聊天
- **AND** 每轮 MUST 使用 `conversationId`、`responseMessageId`、`latestUserMessage` 和 `thinkingEnabled` 构造请求
- **AND** `conversationSummary` MAY 随历史兼容请求传入，但 MUST NOT 作为测试通过所需的执行事实源
- **AND** 每轮 MUST 通过测试专用 current user 触发与首页一致的鉴权边界
- **AND** 测试 MUST NOT 依赖手工注入完整历史 `conversationContext` 来通过真实页面无法通过的用例

#### Scenario: 同一流程内保存并延续会话状态

- **WHEN** 完整/详细 LLM 黑盒流程完成任一非失败轮次
- **THEN** 系统 MUST 通过会话保存边界保存该轮产生的用户消息、assistant 回复、后台 conversation summary、Agent metadata 和可见训练卡片
- **AND** 后续轮次 MUST 基于保存后的同一 `conversationId` 继续执行
- **AND** 不同流程用例之间 MUST 使用互相隔离的新会话

#### Scenario: 环境 preflight 不满足时明确跳过或失败

- **WHEN** 完整/详细 LLM 黑盒测试启动
- **THEN** 系统 MUST 检查真实模型 key、测试用户、数据库连接、必要 migration、`ConversationArtifact` / `ArtifactIndex` 表和基础 seed 数据是否满足详细套件运行条件
- **AND** 缺少真实模型 key 时 MUST 生成真实模型跳过摘要

### Requirement: 引用类详细用例必须验证真实 artifact 链路

系统 SHALL 在完整/详细 LLM 黑盒测试中验证最近卡片引用、局部修改和动作讲解依赖真实 artifact summary 与 payload。

#### Scenario: 生成卡片后写入 artifact 索引

- **WHEN** 完整/详细 LLM 流程轮次生成 `exercise_recommendation`、`workout_routine` 或 `workout_plan`
- **THEN** 系统 MUST 通过会话保存链路写入对应的 conversation artifact
- **AND** 后续轮次 MUST 能通过当前会话读取 recent artifact summary
- **AND** 报告 MUST 记录该轮是否成功产生可引用 artifact

#### Scenario: artifact 读取遵守测试用户隔离

- **WHEN** 完整/详细 LLM 流程进入后续引用轮次
- **THEN** 系统 MUST 只读取当前测试用户和当前会话可访问的 recent artifact
- **AND** 不同流程用例之间 MUST NOT 共享 recent artifact summary 或 payload
- **AND** 报告 MUST 能定位当前轮使用的 `conversationId` 和 artifact 诊断摘要

#### Scenario: 序号动作讲解读取真实 payload

- **WHEN** 完整/详细 LLM 流程中的用户输入引用“第一个动作”“最后一个动作”或等价序号动作
- **THEN** 系统 MUST 验证引用解析结果指向真实 artifact
- **AND** 系统 MUST 验证服务端能够读取 artifact payload 并定位到具体 `exerciseId`
- **AND** 如果 assistant 回复表示没有安全读取到动作详情，该轮 MUST 判定为语义断言失败，而不是仅因无训练卡片而通过

#### Scenario: 歧义引用必须澄清

- **WHEN** 当前会话存在多个可引用训练卡片且用户使用无法唯一定位的“这个”“它”等表达
- **THEN** 系统 MUST 验证 assistant 没有擅自选择其中一个 artifact 执行修改
- **AND** assistant MUST 以用户可回答的方式澄清引用对象

### Requirement: 详细套件必须支持分级语义断言

系统 SHALL 在完整/详细 LLM 黑盒测试中区分流程级断言和语义级断言，使测试结果能解释真实用户目标是否达成。

#### Scenario: 卡片类型通过但语义目标失败

- **WHEN** 某轮回复非空且卡片类型符合预期
- **AND** 该轮声明了额外语义目标
- **THEN** 系统 MUST 继续执行语义断言
- **AND** 语义断言失败时该轮 MUST 记录为 failed
- **AND** 报告 MUST 同时显示卡片类型断言状态和语义断言状态

#### Scenario: 最终状态和失败等级映射稳定

- **WHEN** 完整/详细 LLM 测试汇总每轮结果
- **THEN** 系统 MUST 使用 `passed`、`failed`、`skipped`、`needs_review` 之一作为最终状态
- **AND** P0、P1、P2 自动断言失败 MUST 记录为 `failed`
- **AND** 缺少模型 key、preflight 不满足或前序轮次失败导致未执行 MUST 记录为 `skipped`
- **AND** 仅内容质量或自动断言无法稳定判断的 P3 问题 MAY 记录为 `needs_review`，且不得计入通过

#### Scenario: 条件覆盖语义被校验

- **WHEN** 用例期望当前消息覆盖历史目标、器械、时长、频率或限制
- **THEN** 系统 MUST 验证 assistant 摘要、卡片 intent 或 artifact payload 不再沿用被覆盖的旧条件
- **AND** 如果无法从可见结果或诊断字段确认覆盖成功，报告 MUST 标记为需要人工复核或语义断言失败

#### Scenario: 排除动作和安全边界被校验

- **WHEN** 用例期望排除某类动作或保持安全边界
- **THEN** 系统 MUST 验证 assistant 可见回复和训练卡片没有继续强化被排除动作或危险承诺
- **AND** 医疗诊断类输入 MUST NOT 触发训练卡片
- **AND** 高风险训练请求 MUST 以保守建议、追问或降级方案处理

### Requirement: 详细套件必须补齐完整用例文档的高价值缺口

系统 SHALL 将 `LLM完整测试.md` 中未自动化但回归价值高的流程补入完整/详细 LLM fixture。

#### Scenario: 计划和上下文缺口被补齐

- **WHEN** 完整/详细 LLM fixture 更新
- **THEN** 系统 MUST 覆盖目标变化重排计划和长期计划解释修改场景
- **AND** 系统 MUST 覆盖新目标覆盖旧目标、记住时长、条件缺口不重复追问和用户否定前一轮场景

#### Scenario: 引用修改缺口被补齐

- **WHEN** 完整/详细 LLM fixture 更新
- **THEN** 系统 MUST 覆盖局部修改不重生成整套、重复动作确认范围、修改计划某一天、刷新与修改区分和确认式执行场景

#### Scenario: 安全和异常缺口被补齐

- **WHEN** 完整/详细 LLM fixture 更新
- **THEN** 系统 MUST 覆盖高强度请求、疼痛中止、年龄或特殊人群场景
- **AND** 系统 MUST 覆盖模型无故拒答后的恢复场景

### Requirement: 详细测试报告必须支持成本校准和失败排错

系统 SHALL 让完整/详细 LLM 测试报告同时服务人工验收、成本判断和失败排查。

#### Scenario: 报告记录运行上下文和断言分层

- **WHEN** 完整/详细 LLM 测试运行结束
- **THEN** 报告 MUST 记录运行命令、套件名、runner 类型、生成时间、模型和真实/跳过状态
- **AND** 每轮结果 MUST 记录卡片类型断言状态、语义断言状态、最终状态和失败分级
- **AND** 失败记录 MUST 包含 `conversationId`、`responseMessageId`、`traceId`、用户输入、期望摘要、实际 assistant 摘要和失败原因

#### Scenario: 报告记录 artifact 诊断摘要

- **WHEN** 某轮用例涉及引用、修改或动作讲解
- **THEN** 报告 MUST 记录是否存在 recent artifact summary
- **AND** 报告 MUST 记录是否读取到 artifact payload
- **AND** 报告 MUST 记录引用解析状态，且不得保存完整 prompt、完整候选池或大段原始模型 payload

#### Scenario: token 预估基于真实运行校准

- **WHEN** 系统输出基础套件或完整/详细套件 token 预估
- **THEN** 预估 MUST 使用可解释口径
- **AND** 如果存在最近一次真实运行报告，预估 MUST 基于该报告的真实 token 均值或总量校准
- **AND** 报告 MUST 同时记录预计 token、真实 token 和偏差摘要

#### Scenario: token 预估在缺少真实报告时使用 fallback

- **WHEN** 系统没有可用真实运行报告、最近报告是跳过报告或报告字段缺失
- **THEN** 预估 MUST 基于 fixture 数量、轮次数和保守均值生成
- **AND** 报告 MUST 标明本次 token 预估来源为 fallback
- **AND** 系统 MUST NOT 把跳过报告的 `total_tokens=0` 当成真实成本均值

### Requirement: 黑盒测试不得依赖旧 intent 事件
系统 SHALL 让手动 LLM 黑盒 runner 和报告以用户可见闭环、`AgentExecutionResult`、Agent tool dependency graph、artifact / patch / suggestion 事件和 done metadata 作为验收事实源。

#### Scenario: 旧事件缺失
- **WHEN** `/api/chat` 响应不包含 `assistant_action`、`intent_resolved`、旧 resolved intent、`workoutIntent` 或 trigger JSON
- **THEN** 黑盒 runner MUST NOT 因这些旧字段缺失而判失败
- **AND** runner MUST 从 `AgentExecutionResult` 和可见事件推导卡片类型、澄清、失败或阻断状态

#### Scenario: 旧事件仍被输出
- **WHEN** 测试环境中仍出现 `assistant_action`、`intent_resolved` 或旧 trigger JSON
- **THEN** 报告 MUST 标记为 legacy field leakage
- **AND** 除历史兼容测试外，新黑盒用例 MUST 将其视为架构清理失败

#### Scenario: 执行证据缺失
- **WHEN** 用户可见回复声称已经生成、修改或保存训练内容
- **THEN** 黑盒 runner MUST 校验存在对应 `AgentExecutionResult`、tool result、validation / policy / revision 或 artifact / patch 事件
- **AND** 仅有自然语言承诺 MUST 判定为失败

#### Scenario: Agent-only failure handling 可见
- **WHEN** 真实多轮流程中出现工具失败、候选不足、引用不可解析、validation 失败或 policy blocked
- **THEN** 黑盒 runner MUST 从 `AgentExecutionResult.status`、blocking reason、tool evidence metadata 和用户可见回复判断该轮结果
- **AND** runner MUST NOT 因缺少旧 intent 架构、`assistant_action` 或旧 trigger JSON 而把 failure handling 判为失败

#### Scenario: 核心流程验收矩阵
- **WHEN** 基础或详细黑盒套件覆盖 routine、长期计划、动作推荐、局部 Patch、序号动作讲解和短指令调整
- **THEN** 每类流程 MUST 校验用户可见结果与 `AgentExecutionResult`、tool dependency graph、artifact / patch / suggestion 事件或 done metadata 一致
- **AND** 每类流程 MUST 校验 legacy path absence

