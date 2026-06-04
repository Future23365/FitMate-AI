## ADDED Requirements

### Requirement: Terminal output validation 不得硬编码业务 toolName
系统 SHALL 保持 terminal output validation 的通用边界：core validator / renderer / ResourceStore / Response Renderer 不得通过具体业务 `toolName` 白名单决定最终用户可见结构化输出是否合法。业务输出合法性 MUST 由 outputType 对应的 validator、数据库事实、权限和资源合同共同校验。

#### Scenario: 结构化输出校验不认具体 toolName
- **WHEN** Runtime 校验 `final_answer.visibleOutputs[]`
- **THEN** terminal output validation MUST 根据 `outputType` 分发到对应 validator
- **AND** 通用 core MUST NOT 包含 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或其他具体业务 toolName 分支来决定 terminal output 是否可渲染
- **AND** 业务 validator MUST NOT 要求新增 tool 时同步添加 toolName 白名单

#### Scenario: 新增业务 tool 不修改 terminal output core
- **WHEN** 后续新增动作查询、动作详情、候选推荐或训练辅助 tool
- **AND** 该 tool 不改变 `AgentAction` 或 `visibleOutputs[]` envelope
- **THEN** 系统 MUST NOT 要求修改 `PlannerPort`、Executor 主流程、Policy Guard、Resource Contract Validator、Response Renderer 主流程或 terminal output core 才能让最终输出完成校验

#### Scenario: 业务 validator 通过注入边界读取事实
- **WHEN** 某个 `outputType` 的 validator 需要数据库、权限或领域事实完成校验
- **THEN** 该 validator MUST 通过生产装配层注入的服务或 validator context 读取事实
- **AND** `agent-core` MUST NOT 直接导入 Prisma、业务 repository 或具体业务 tool 模块
- **AND** 测试 MUST 证明替换或新增业务 tool 不需要修改 core validator 分发逻辑
