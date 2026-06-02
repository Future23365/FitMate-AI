## ADDED Requirements

### Requirement: Agent 读工具必须支持动作库统计和名称解析
系统 SHALL 在统一 `AgentToolRegistry` 中提供动作库统计和按名称解析动作详情的只读工具，并将其与执行型动作候选检索区分开。

#### Scenario: 注册动作库统计工具
- **WHEN** Agent registry 枚举只读动作工具
- **THEN** registry MUST 包含 `getExerciseLibrarySummary` 或等价动作库统计工具
- **AND** 该工具 MUST 只读取 `Exercise` 统计事实
- **AND** 该工具 MUST NOT 生成 candidate set、routine、plan、patch 或 conversation artifact

#### Scenario: 注册动作名称解析工具
- **WHEN** Agent registry 枚举只读动作工具
- **THEN** registry MUST 包含 `resolveExerciseByName`、`getExerciseDetailByName` 或等价名称解析工具
- **AND** 该工具输入 MUST 使用结构化名称字段表达待查动作
- **AND** 该工具 MUST 返回唯一动作详情、歧义候选或未找到诊断

#### Scenario: 名称解析不读取用户原文
- **WHEN** 名称解析工具执行
- **THEN** 工具 MUST 只使用通过 Schema 校验的结构化输入、动作库字段和当前权限上下文
- **AND** 工具 MUST NOT 从 latest user message、conversationSummary 或自由文本回复中自行解析动作名

#### Scenario: 与 searchExercises 区分用途
- **WHEN** 用户请求动作库统计或单个动作详情
- **THEN** Agent MUST 使用统计、名称解析或按 ID 读取工具
- **AND** Agent MUST NOT 为完成统计或单个详情问答而调用执行型 `searchExercises(candidateUse="recommendation"|"routine"|"plan"|"patch")`
- **AND** 系统 MUST NOT 把这类只读工具结果登记为可被 draft、validation、policy 或 save 消费的候选集合

### Requirement: 动作库只读查询工具必须提供可追踪摘要
系统 SHALL 为动作库统计、名称解析和详情读取工具返回稳定 tool result 摘要，供 Agent final result、trace、黑盒报告和 Response Writer 引用。

#### Scenario: 统计工具结果摘要
- **WHEN** 动作库统计工具成功执行
- **THEN** tool result MUST 包含稳定结果 id、统计口径、总动作数和可见动作数
- **AND** trace MUST 记录工具名、输入摘要、统计字段和读取来源

#### Scenario: 名称解析成功摘要
- **WHEN** 名称解析工具唯一命中动作
- **THEN** tool result MUST 包含 `exerciseId`、命中字段、动作名称、步骤摘要和可展示详情字段
- **AND** 模型可见摘要 MUST 限制在回答所需字段内，避免暴露完整动作库

#### Scenario: 名称解析歧义摘要
- **WHEN** 名称解析工具匹配多个动作
- **THEN** tool result MUST 返回有限候选列表、歧义原因和可用于追问的候选名称
- **AND** 该结果 MUST NOT 被标记为可消费的唯一动作详情

#### Scenario: 名称解析失败摘要
- **WHEN** 名称解析工具未找到动作
- **THEN** tool result MUST 返回结构化失败或诊断摘要
- **AND** 诊断 MUST 说明查找字段和可恢复建议
