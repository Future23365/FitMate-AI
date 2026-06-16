## ADDED Requirements

### Requirement: Shadow Probe 必须提供可运行的 CLI 文件闭环

系统 SHALL 提供 dev-only CLI 或等价脚本，使开发者无需启动浏览器或真实模型调用即可为单条用户消息创建 shadow run、推进 Codex decision、执行 dev-safe tool，并生成报告。

#### Scenario: 启动单条消息 shadow run
- **WHEN** 开发者通过 CLI 为单条用户消息启动 Codex Shadow LLM Probe
- **THEN** 系统 MUST 创建 `codex_logs/shadow_llm_probe/<runId>/manifest.json`
- **AND** 系统 MUST 创建 `round-001-input.json`
- **AND** CLI MUST 输出 `runId`、下一步需要 Codex 写入的 decision 文件路径和报告路径
- **AND** CLI MUST NOT 调用 DeepSeek 或任何外部模型 provider

#### Scenario: Run 目录名使用本地可读时间
- **WHEN** 系统为 Shadow Probe 创建新的 `runId`
- **THEN** `runId` MUST 使用 `shadow-YYYY-MM-DD-HHmm-xxxxxxxx` 格式
- **AND** `YYYY-MM-DD-HHmm` MUST 按 `Asia/Shanghai` 时间生成
- **AND** 该格式 MUST 只用于人工可读目录名，不改变 manifest、input 或 report 内部结构化时间字段的 ISO 8601 UTC 语义

#### Scenario: 推进已有 shadow run
- **WHEN** 开发者通过 CLI 继续一个已有 shadow run
- **AND** 当前轮 `round-xxx-decision.json` 已存在
- **THEN** 系统 MUST 校验该 decision
- **AND** 合法 `call_tool` MUST 推进到真实 dev-safe tool 执行和下一轮 input
- **AND** `final_answer`、`contract_gap`、预算耗尽、decision 校验失败或 tool 执行失败 MUST 写入终态 manifest

#### Scenario: 生成或刷新报告
- **WHEN** 开发者通过 CLI 为已有 shadow run 生成报告
- **THEN** 系统 MUST 读取该 run 的 manifest、input、decision 和 tool result 文件
- **AND** 系统 MUST 生成或刷新 `report.md` 和 `report.json`
- **AND** 报告生成 MUST NOT 重新执行 tool handler 或调用模型 provider

### Requirement: Shadow Probe skill 必须作为决策执行说明落地

系统 SHALL 提供项目级 `aitest-shadow-llm-probe` Codex skill，指导 Codex 在隔离输入内扮演生产 LLM 决策方，并按稳定 decision schema 写入每轮决策。

#### Scenario: Skill 文件结构完整
- **WHEN** 实现 Codex Shadow LLM Probe
- **THEN** 系统 MUST 创建 `.codex/skills/aitest-shadow-llm-probe/SKILL.md`
- **AND** 系统 MUST 提供 shadow input contract、decision output schema 和 diagnosis rubric 的 references
- **AND** 系统 MUST 提供 `agents/openai.yaml` 或等价 skill metadata

#### Scenario: Skill 明确禁止外部知识污染
- **WHEN** Codex 使用该 skill 执行 Shadow 决策
- **THEN** skill MUST 要求 Codex 只读取当前轮 shadow input 和上一轮模型可见 tool result summary
- **AND** skill MUST 禁止把仓库源码、Codex memory、历史 trace、OpenSpec 说明、开发者解释或 debug-only 字段作为决策依据
- **AND** skill MUST 要求无法从 shadow input 推出的判断输出 `contract_gap`

#### Scenario: Skill 要求每轮写入结构化文件
- **WHEN** Codex 完成任一轮 Shadow 决策
- **THEN** skill MUST 要求 Codex 写入 `round-xxx-decision.json`
- **AND** skill MUST 要求 decision 包含证据、字段理由、缺失事实、合同疑点和污染审计

### Requirement: Shadow Probe 必须导出隔离的模型可见输入

系统 SHALL 为 Codex Shadow LLM Probe 生成隔离的 shadow input，使 Codex 只能看到当前生产 LLM 在等价请求中可见的 prompt、messages、tools schema、tool descriptions、schema descriptions、tool result summary 和预算边界。

#### Scenario: 导出首轮模型可见输入
- **WHEN** 开发者为一条用户消息启动 Codex Shadow LLM Probe
- **THEN** 系统 MUST 生成 `codex_logs/shadow_llm_probe/<runId>/round-001-input.json`
- **AND** 该文件 MUST 包含当前生产 LangChain 主链实际使用的 system prompt、用户消息、当前 request 暴露的 tool 名称、tool description、input schema 和 schema description
- **AND** 该文件 MUST 包含当前模型可见的 finalization tool description / schema
- **AND** 该文件 MUST 包含当前模型可见的运行预算摘要
- **AND** 该文件 MUST 包含可被 decision 引用的输入包内部 `sourceRefs` 或等价路径标识

#### Scenario: Shadow input 禁止包含 debug-only 内容
- **WHEN** 系统生成任一轮 shadow input
- **THEN** shadow input MUST NOT 包含源码实现、Prisma raw payload、完整数据库记录、cookie、环境变量、密钥、服务端调用栈、debug-only trace 字段、历史 OpenSpec 说明、Codex memory 或开发者解释
- **AND** shadow input MUST NOT 包含生产 LLM 在对应 provider request 中不可见的诊断字段

#### Scenario: 后续轮次只追加模型可见 tool result summary
- **WHEN** Codex decision 触发一次合法 tool call 并由 runner 执行完成
- **THEN** 系统 MUST 生成下一轮 `round-xxx-input.json`
- **AND** 下一轮 input MUST 包含上一轮真实 tool handler 输出后产生的模型可见 tool result summary
- **AND** 下一轮 input MUST NOT 把完整 tool raw output、debug-only diagnostics 或用户不可见投影补给 Codex

### Requirement: Codex Shadow 决策必须结构化并可校验

系统 SHALL 要求 Codex Shadow LLM Probe 每轮输出结构化 decision 文件，明确决策类型、tool input、证据来源、字段理由、缺失事实、合同疑点和污染审计。

#### Scenario: 输出 call_tool 决策
- **WHEN** Codex 判断当前模型可见输入需要调用工具
- **THEN** Codex MUST 写出 `round-xxx-decision.json`
- **AND** `decision` MUST be `call_tool`
- **AND** decision MUST 包含当前 shadow input 中暴露的 `toolName`
- **AND** decision MUST 包含待校验的 `toolInput`
- **AND** decision MUST 为关键 tool input 字段记录模型可见证据来源和字段理由

#### Scenario: 输出 final_answer 决策
- **WHEN** Codex 判断当前模型可见事实足以收口
- **THEN** Codex MUST 写出 `decision=final_answer`
- **AND** decision MUST 说明最终回答依赖的模型可见事实
- **AND** decision MUST 说明为什么不再需要继续调用业务 tool

#### Scenario: 输出 contract_gap 决策
- **WHEN** Codex 无法仅凭 shadow input 可靠判断下一步
- **THEN** Codex MUST 写出 `decision=contract_gap`
- **AND** decision MUST 记录缺失事实或合同疑点
- **AND** decision MUST NOT 伪造 tool call 或 final answer 来继续推进 loop

#### Scenario: 每轮决策必须包含污染审计
- **WHEN** Codex 写出任一轮 decision
- **THEN** decision MUST 包含 `contaminationAudit`
- **AND** `contaminationAudit` MUST 声明是否只使用 shadow input
- **AND** 如果存在疑似外部记忆、源码知识、历史经验或开发者视角，decision MUST 标记污染风险并说明对应判断

### Requirement: Shadow runner 必须确定性校验并执行真实 tool handler

系统 SHALL 提供 dev-only shadow runner，读取 Codex decision，进行确定性 schema 校验，调用真实 dev-safe tool handler，并生成下一轮模型可见输入或终止状态。

#### Scenario: 拒绝不存在的 tool
- **WHEN** Codex decision 中的 `toolName` 不存在于当前 shadow input 暴露的 tools
- **THEN** runner MUST 拒绝执行该 decision
- **AND** runner MUST 记录 `tool_not_available` 或等价错误
- **AND** runner MUST NOT 改写 `toolName` 或替 Codex 选择其他 tool

#### Scenario: 拒绝不符合 schema 的 tool input
- **WHEN** Codex decision 的 `toolInput` 不符合对应 tool input schema
- **THEN** runner MUST 拒绝执行该 tool call
- **AND** runner MUST 记录 schema validation issues
- **AND** runner MUST NOT 自动修复、补齐或语义归一化 Codex 输入

#### Scenario: 执行真实 dev-safe tool handler
- **WHEN** Codex decision 通过 tool availability 和 schema 校验
- **THEN** runner MUST 调用项目当前真实 tool wrapper 或等价生产 handler
- **AND** runner MUST 使用与生产模型可见 summary 等价的投影方式生成 tool result summary
- **AND** runner MUST 记录 tool 执行状态、错误码和下一轮输入路径

#### Scenario: 支持完整首版 tool 推进范围
- **WHEN** Shadow runner 执行首版支持的 tool
- **THEN** runner MUST 支持 `inspectVisibleTrainingProposals` 的只读事实导入
- **AND** runner MUST 支持 `searchExerciseResources` 的只读动作资源查询
- **AND** runner MUST 支持 `submitVisibleTrainingProposal` 的非持久化结构校验和 visible output validator path
- **AND** runner MUST 支持 `fitmate_final_response` 或等价 finalization 终态记录

#### Scenario: 禁止诊断 run 写入业务事实
- **WHEN** Shadow runner 执行 `submitVisibleTrainingProposal` 或等价结构化收口校验
- **THEN** runner MUST NOT 保存聊天消息
- **AND** runner MUST NOT 写入 visible training proposal facts
- **AND** runner MUST NOT 改变用户真实会话状态
- **AND** runner MUST 只保留诊断 run 文件中的校验结果和模型可见 summary

#### Scenario: Shadow runner 不替代 LLM 语义判断
- **WHEN** runner 推进 Shadow Probe loop
- **THEN** runner MUST NOT 基于用户自然语言、关键词、正则、同义词、短句模板或历史摘要替 Codex 选择 tool、改写 tool input、改变调用顺序或生成 final answer

#### Scenario: 终态 manifest 可复现
- **WHEN** Shadow Probe loop 到达任一终态
- **THEN** runner MUST 在 manifest 中记录终态类型、终态轮次、失败原因或 final / contract gap 摘要
- **AND** 后续报告生成 MUST 能仅凭该 run 目录中的文件复现报告

### Requirement: Shadow 报告必须按轮次解释决策和合同问题

系统 SHALL 为每次 Shadow Probe 生成 Markdown 和 JSON 报告，逐轮记录 Codex 决策、模型可见证据、tool result 消费、停止理由、合同问题归因和污染审计。

#### Scenario: 生成最终报告
- **WHEN** Shadow Probe loop 结束
- **THEN** 系统 MUST 生成 `report.md` 和 `report.json`
- **AND** 报告 MUST 包含 run id、输入来源、轮次数、最终状态和每轮 decision 摘要
- **AND** 报告 MUST 记录每轮使用的模型可见证据、关键字段来源、缺失事实、合同疑点和污染审计结果

#### Scenario: 报告归因到稳定合同层
- **WHEN** Shadow Probe 发现合同问题
- **THEN** 报告 MUST 将问题归因到稳定类别
- **AND** 类别 MUST 至少覆盖 prompt conflict、tool selection ambiguity、schema source ambiguity、tool result summary insufficiency、stop condition ambiguity、finalization contract ambiguity、debug-only leakage、case-specific rule smell、runtime budget mismatch 和 contamination risk
- **AND** 报告 MUST NOT 把具体用户短句、具体 trace 个例或具体字段组合升格成生产通用规则

#### Scenario: Shadow 报告和开发者诊断分段
- **WHEN** 报告包含后续修改建议
- **THEN** 报告 MUST 区分 Shadow 决策报告和开发者诊断建议
- **AND** Shadow 决策报告 MUST 只引用 shadow input、decision 和模型可见 tool result summary
- **AND** 开发者诊断建议 MAY 引用源码、测试和 OpenSpec，但 MUST 明确它不属于 Shadow 决策依据
- **AND** 开发者诊断建议 MUST 面向人说明诊断结论、固定类别命中情况、运行阻断和不可判断项

#### Scenario: Tool 执行失败时报告诊断未完成
- **WHEN** Shadow Probe 因真实 dev-safe tool 执行失败进入 `tool_execution_failed`
- **THEN** 报告 MUST 标明诊断未完成
- **AND** 报告 MUST 说明失败阻断了哪些后续判断
- **AND** 报告 MUST NOT 将数据库连接、环境变量或 tool handler 异常误归因为确定的 prompt / tool description 合同问题

### Requirement: Shadow Probe 必须与生产和默认测试隔离

系统 SHALL 将 Codex Shadow LLM Probe 保持为 dev-only 诊断能力，不改变生产 `/api/chat` 行为，不进入默认自动化测试，不依赖浏览器或 dev server。

#### Scenario: 生产聊天不依赖 Shadow Probe
- **WHEN** 用户正常调用生产 `/api/chat`
- **THEN** 系统 MUST 继续使用当前 LangChain Agent Runtime 和配置的模型 provider
- **AND** 系统 MUST NOT 调用 Codex skill、读取 shadow decision 或等待 shadow report

#### Scenario: 默认测试不运行 Shadow Probe
- **WHEN** 开发者运行 `npm run test`
- **THEN** 系统 MUST NOT 启动 Codex Shadow LLM Probe
- **AND** 系统 MUST NOT 因缺少 Codex 会话、shadow input、DeepSeek 配置或外部网络而导致默认测试失败

#### Scenario: 首版不接 UI
- **WHEN** 实现本 change 的首版任务
- **THEN** 系统 MUST 通过文件型 CLI / script 闭环完成诊断
- **AND** 系统 MUST NOT 要求启动 dev server、打开浏览器或修改 `/dev/ai-traces`、`/dev/llm-blackbox` 页面

#### Scenario: 首版交付不得只是静态导出
- **WHEN** 实现本 change 的首版任务完成
- **THEN** 系统 MUST 能从一条用户消息生成首轮 shadow input
- **AND** 系统 MUST 能读取 Codex 写出的合法 `call_tool` decision 并执行 dev-safe tool
- **AND** 系统 MUST 能生成下一轮 input
- **AND** 系统 MUST 能在终态生成 report
- **AND** 只有 prompt 导出、skill 空壳或静态文档 MUST NOT 被视为完成
