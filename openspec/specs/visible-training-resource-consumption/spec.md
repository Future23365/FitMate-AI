# visible-training-resource-consumption Specification

## Purpose
TBD - created by archiving change harden-visible-training-resource-consumption-contract. Update Purpose after archive.
## Requirements
### Requirement: 可见训练资源必须声明消费语义和结构覆盖
当前 run 中可见的训练资源 SHALL 通过模型可见合同表达其资源角色、可正向消费范围、负向约束边界、section coverage 和 output support。系统 MUST NOT 根据用户原文、关键词、短句模板、同义词表、具体 `toolName` 或字段组合替 Planner 选择资源操作类型。

#### Scenario: 引用资源操作由模型基于可见事实推理
- **WHEN** Planner 处理依赖已有可见对象的请求
- **THEN** 模型可见合同 MUST 引导 Planner 基于 `messages`、`metadata`、`observations`、`toolResults` 和 consumable resource 判断资源操作属于 `reuse`、`derive`、`modify`、`replace` 或 `clarify`
- **AND** `/api/chat`、Agent runtime、validator、tool handler 和 renderer MUST NOT 根据用户原文替 Planner 选择这些操作
- **AND** 这些操作标签 MUST NOT 成为服务端 action schema 的强制字段

#### Scenario: 正向消费和负向排除必须区分
- **WHEN** 当前 run 已有可消费训练资源
- **THEN** 模型可见合同 MUST 表达该资源可以作为正向事实来源被复用、派生或调整
- **AND** 模型可见合同 MUST 表达只有替换、排除或避免重复目标才能把资源内动作作为负向排除约束
- **AND** 系统 MUST NOT 把已导入资源内动作默认转成 `excludeExerciseIds`

#### Scenario: 输出结构受 section coverage 约束
- **WHEN** 当前 run 的可见训练资源或动作查询结果只覆盖部分 section
- **THEN** 模型可见合同 MUST 表达 `availableSections`
- **AND** 模型可见合同 MUST 表达生成 `routine` 或 `plan` 时缺少的 section
- **AND** Planner MUST NOT 把未覆盖的 section 伪造成已获得事实

#### Scenario: 资源消费合同不引入服务端语义分流
- **WHEN** 实现本能力
- **THEN** `/api/chat`、Agent runtime、validator、tool handler、`Policy Guard`、`ResourceStore` 和 `Response Renderer` MUST NOT 新增用户短语、关键词、正则、同义词表或业务 `toolName` 语义分支
- **AND** 回归测试 MUST 覆盖原始失败 case 和至少一个等价表达
- **AND** 测试样例 MUST NOT 反向决定生产规则

### Requirement: 可见训练资源缺口必须以可恢复方式反馈给 Planner
当最终训练输出所需事实超出当前可见资源覆盖范围时，系统 SHALL 向 Planner 暴露结构化、可恢复的合同反馈。Feedback MUST 说明当前事实覆盖和缺口，但 MUST NOT 固定下一步 tool 调用、action 或回复模板。

#### Scenario: 缺少结构覆盖时反馈事实缺口
- **WHEN** Planner 试图输出需要 `warmup`、`training`、`stretch` 的结构
- **AND** 当前可见事实缺少其中一个或多个 section
- **THEN** repair 或 observation MUST 表达当前 `availableSections`
- **AND** repair 或 observation MUST 表达缺失 section
- **AND** repair 或 observation MUST 表达可恢复方向包括继续获取缺失 section、输出当前事实可支撑结构、澄清或失败收口

#### Scenario: Feedback 不替模型选择固定流程
- **WHEN** 系统生成资源缺口或校验失败反馈
- **THEN** feedback MUST NOT 包含“必须调用 `searchExerciseResources`”或等价固定 tool 流程
- **AND** feedback MUST NOT 包含固定用户短语或答案模板
- **AND** feedback MUST NOT 根据具体 `toolName` 和字段组合改写 Planner 的语义目标

