# agent-model-visible-contract-gate Specification

## Purpose
TBD - created by archiving change add-agent-regression-contract-audit-gate. Update Purpose after archive.
## Requirements
### Requirement: 模型可见 summary 必须通过严格白名单合同
系统 SHALL 为 Agent model-visible summary、tool result summary、repair feedback 和 trace summary 提供严格白名单合同或等价结构校验，使模型只能看到事实、资源覆盖、诊断、validator 边界和中性可恢复反馈。

#### Scenario: 允许事实和诊断字段
- **WHEN** LangChain tool wrapper、finalization tool、repair feedback 或 trace summary 生成模型可见 summary
- **THEN** 自动化测试 MUST 验证该 summary 只包含白名单允许的字段族
- **AND** 白名单字段族 MUST 被归类为事实查询、过滤条件、资源覆盖、候选分组、缺失信息、诊断、validator 边界、policy 边界、projection 边界或中性重复输入反馈

#### Scenario: 未声明字段失败
- **WHEN** 模型可见 summary 出现白名单未声明字段
- **THEN** 合同测试 MUST 失败
- **AND** 新字段必须先在 OpenSpec、schema 或测试 fixture 中说明其稳定语义和所属字段族

#### Scenario: 禁止业务目标满足度混入只读事实 summary
- **WHEN** 只读查询 tool 返回模型可见 summary
- **THEN** summary MUST NOT 包含业务目标是否满足、最终输出是否可交付、下一步应调用哪个 tool、固定 workflow 或结构化卡片收口要求
- **AND** summary MUST 保持为当前 run 的事实材料、覆盖信息和诊断信息

### Requirement: Production tool catalog 必须被枚举验证
系统 SHALL 通过生产 LangChain tool catalog 或等价生产注册入口枚举真实 tool，验证每个 tool 的模型可见合同不会在迁移或重构后回归。

#### Scenario: 枚举生产 tool
- **WHEN** Agent model-visible contract gate 运行
- **THEN** 测试 MUST 从 production tool catalog 或等价生产注册入口获取 tool 列表
- **AND** 测试 MUST 验证每个 tool 的 description、schema description、model-visible summary、user projection 和 trace summary 符合合同边界

#### Scenario: 覆盖代表性状态
- **WHEN** tool 具备成功、空结果、候选不足、schema 拒绝、validator 拒绝、policy 拒绝、重复输入或 terminal failure 状态
- **THEN** catalog contract tests MUST 覆盖该 tool 能力族的代表性状态
- **AND** 测试 MUST 证明失败或诊断状态不会被描述成成功业务目标满足

#### Scenario: 新增 tool 缺少 contract fixture
- **WHEN** production tool catalog 新增 tool 但没有对应 contract fixture 或能力族默认 fixture
- **THEN** Agent model-visible contract gate MUST 失败
- **AND** 实现者 MUST 补充 fixture、白名单字段说明或明确该 tool 复用的能力族合同

### Requirement: 模型可见文本必须通过风险类别 linter
系统 SHALL 对实际组装后会进入模型的描述性文本运行 linter，发现服务端指导模型行为、固定 tool workflow、业务目标满足度、case-specific 生产规则和过时协议。

#### Scenario: 检查实际模型可见文本
- **WHEN** Agent model-visible contract gate 运行
- **THEN** linter MUST 检查实际会进入模型的 system prompt、tool description、schema description、examples description、tool result summary、repair feedback、finalization tool description 和 trace summary
- **AND** 源码字符串扫描 MAY 作为补充，但不能替代实际组装后的模型输入检查

#### Scenario: 拦截服务端指导模型下一步流程
- **WHEN** 模型可见文本要求模型下一步必须调用某个 tool、按固定 workflow 补查、或将普通文本回答强制改成结构化 finalization
- **THEN** linter MUST 报告失败
- **AND** 实现者 MUST 将该信息移出模型可见文本，或改写为中性能力边界、事实边界、validator 边界或局部 tool 能力说明

#### Scenario: 拦截 case-specific 生产规则
- **WHEN** 通用 prompt、runtime、adapter、repair feedback 或 tool wrapper 模型可见文本包含用户短句触发、关键词路由、具体 phrasing、具体业务 toolName 语义分支或字段组合触发规则
- **THEN** linter MUST 报告失败
- **AND** 具体用户输入和 trace 条件只能作为回归测试样例或历史证据出现

### Requirement: 禁止项扫描只能作为补充门禁
系统 SHALL 保留历史明确禁止字段和高风险短语扫描，但不得把固定黑名单视为充分验收。

#### Scenario: 扫描历史禁止项
- **WHEN** Agent model-visible contract gate 运行
- **THEN** 测试 MUST 扫描历史明确禁止字段、过时协议字段、固定 workflow 文案和高风险 action 建议文案
- **AND** 扫描项 MUST 包含从相关归档 OpenSpec 和演进记录提取的禁止项

#### Scenario: 黑名单扫描通过但白名单失败
- **WHEN** 固定禁止项扫描通过但白名单 schema、catalog contract tests 或文本 linter 失败
- **THEN** Agent model-visible contract gate MUST 视为失败
- **AND** 实现者 MUST 修正违反通用合同的同类新字段或新文案

#### Scenario: 不能只检测字段原名
- **WHEN** 新增模型可见字段表达业务目标满足度、最终交付准备度、固定下一步动作或服务端建议 workflow
- **THEN** 即使该字段没有使用历史字段原名，白名单合同和文本 linter 也 MUST 能够失败

### Requirement: 模型可见门禁必须覆盖肌群匹配角色合同
系统 SHALL 通过 model-visible contract gate 或等价测试验证肌群匹配角色合同不会退化为 case-specific 生产规则、固定 workflow、业务目标满足度或服务端语义分流。测试 MUST 检查实际组装后的 system prompt、`searchExerciseResources` description、schema description 和相关模型可见 summary。

#### Scenario: 允许稳定的主练和参与语义说明
- **WHEN** Agent model-visible contract gate 运行
- **THEN** 测试 MUST 允许模型可见文本表达 `muscleMatchRole = "primary"` 用于主练肌群匹配
- **AND** 测试 MUST 允许模型可见文本表达 `muscleMatchRole = "any"` 用于主/辅任意参与匹配
- **AND** 测试 MUST 允许目标肌群推荐默认主练口径、候选池选择子集和停止同类查询的稳定规则

#### Scenario: 拦截用户短句和具体字段组合触发规则
- **WHEN** Agent model-visible contract gate 运行
- **THEN** 测试 MUST 失败于通用 prompt、tool description、schema description 或 tool result summary 中出现基于原始用户短句、关键词、正则、同义词、具体 phrasing、具体业务 `toolName` 或字段组合的固定触发规则
- **AND** 具体用户输入和 trace 条件 MUST 只允许出现在回归测试样例、OpenSpec 证据或人工说明中

#### Scenario: 拦截固定补查和结构化收口 workflow
- **WHEN** Agent model-visible contract gate 运行
- **THEN** 测试 MUST 失败于模型可见文本要求模型为了肌群匹配角色、候选池纯净度或未确认偏好必须继续调用同一查询 tool
- **AND** 测试 MUST 失败于模型可见文本把成功查询结果包装成固定下一步 workflow、业务目标满足度或结构化训练结果交付准备度

#### Scenario: 拦截服务端语义分流文案
- **WHEN** Agent model-visible contract gate 运行
- **THEN** 测试 MUST 失败于模型可见文本要求服务端根据用户自然语言、关键词、正则、同义词、短句模板或具体 phrasing 自动选择 `muscleMatchRole`
- **AND** 测试 MUST 验证 `muscleMatchRole` 的选择属于模型基于当前模型可见合同构造 tool input，而不是 `/api/chat`、repository 或 handler 的自然语言分流
