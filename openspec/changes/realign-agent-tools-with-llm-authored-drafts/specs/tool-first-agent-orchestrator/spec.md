## ADDED Requirements

### Requirement: Tool-first Agent Loop 必须保持 LLM 语义决策边界

Tool-first Agent Loop SHALL 由 LLM 做语义决策和结构化草稿输出，由 Tool 执行确定性读取、检索、校验、资源登记、Policy 和持久化。服务端 MUST NOT 在 Tool 内部替 LLM 决定训练编排语义。

#### Scenario: LLM 生成训练草稿
- **WHEN** 用户请求生成 routine 或 plan
- **THEN** LLM MUST 通过纯搜索工具读取可用动作和 artifact 事实
- **AND** LLM MUST 在生成工具输入中提交完整 structured draft
- **AND** 生成工具 MUST 只登记和校验该 structured draft

#### Scenario: Tool 执行确定性步骤
- **WHEN** Agent Tool 执行
- **THEN** Tool MUST 只执行其合同声明的确定性能力
- **AND** Tool MUST NOT 通过本地规则生成训练语义
- **AND** Tool MUST NOT 把搜索结果或动作元数据直接转成最终编排

#### Scenario: 搜索工具不承担编排职责
- **WHEN** Agent 调用 `searchExercises` 或 `searchArtifacts`
- **THEN** Tool MUST 只返回搜索结果资源和事实摘要
- **AND** Tool MUST NOT 接收 `candidateUse` 或 routine / plan 覆盖要求
- **AND** Tool MUST NOT 返回生成前置成功状态

### Requirement: Agent 生成链路必须避免服务端自动编排逃逸

系统 SHALL 禁止生产链路继续使用服务端自动 routine / plan 编排器作为 `generateRoutineDraft` 或 `generatePlanDraft` 的成功路径。

#### Scenario: 旧 routine 自动编排路径
- **WHEN** `generateRoutineDraft` 只收到 `candidateExerciseIds` 而没有收到 LLM-authored routine draft
- **THEN** Tool MUST 返回结构化失败
- **AND** 系统 MUST NOT 调用服务端 helper 自动生成 routine draft

#### Scenario: 旧 plan 自动展开路径
- **WHEN** `generatePlanDraft` 只收到 `strategy` 和候选动作而没有收到 LLM-authored plan draft
- **THEN** Tool MUST 返回结构化失败
- **AND** 系统 MUST NOT 调用 `DomainPlanEngine` 自动生成完整 plan draft

#### Scenario: Trace 可审计
- **WHEN** 训练生成链路成功
- **THEN** trace MUST 能证明 draft 来自 LLM-authored tool input
- **AND** trace MUST 能证明服务端只执行了 schema、候选、validation、policy 和 persistence 边界
