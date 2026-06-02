## ADDED Requirements

### Requirement: 服务端不得语义重写 LLM 的高层意图
系统 SHALL 将 LLM 输出的高层语义意图作为自然语言理解结果，只允许服务端做确定性契约校验和执行门控。服务端 MUST NOT 使用关键词、正则、短句模板、历史摘要推断或其他写死自然语言条件来判断 LLM 的高层意图是否准确，也 MUST NOT 因这些规则改写 `type`、`action.kind` 或 `workoutIntent.intentType`。

#### Scenario: LLM 输出引用型替换意图
- **WHEN** LLM 输出的 resolved intent 表达 `exercise_replacement` 或 `workout_patch`
- **AND** 用户文本包含“换成”、“改成”、“调整”或其他可能被旧规则命中的词
- **THEN** 服务端 MUST NOT 将该意图改写为 `routine`、`workout_plan` 或 `exercise_recommendation`
- **AND** 服务端 MUST 按引用型动作的契约校验引用需求、目标 artifact、目标动作和 patch 范围

#### Scenario: LLM 输出生成型意图
- **WHEN** LLM 输出的 resolved intent 表达 `exercise_recommendation`、`workout_routine` 或 `workout_plan`
- **THEN** 服务端 MUST NOT 根据当前用户消息中的写死关键词重新判断该意图是否应该变成另一个高层动作
- **AND** 服务端 MAY 校验该意图是否具备当前 action 所需的确定性字段
- **AND** 确定性字段缺失时，服务端 MUST 进入 repair、澄清或拒绝执行

#### Scenario: LLM 输出和契约字段冲突
- **WHEN** LLM 输出的 `type`、`action.kind`、`responseMode`、`workoutIntent.intentType` 或 `referenceRequirement` 存在结构冲突
- **THEN** 服务端 MUST 记录契约冲突
- **AND** 服务端 MUST 使用 repair、澄清或拒绝执行处理该冲突
- **AND** 服务端 MUST NOT 通过写死自然语言规则把该 intent 改写成另一个高层 action 作为修复

#### Scenario: LLM 输出解析失败
- **WHEN** LLM 意图输出无法通过 JSON、schema 或 resolved intent 契约校验
- **THEN** 服务端 MAY 使用 fallback 构造安全回复、澄清或保留非执行建议
- **AND** fallback MUST NOT 基于用户文本关键词生成可执行的 `exercise_recommendation`、`routine` 或 `workout_plan`
- **AND** fallback MUST NOT 将 `canTriggerAction` 或 `action.shouldTrigger` 设置为 true

### Requirement: 服务端契约归一化只能处理确定性边界
系统 SHALL 保留服务端契约归一化，但该归一化只能处理不依赖自然语言语义判断的确定性边界，包括 schema 解析、空值规范化、枚举合法性、字段一致性、引用需求、权限隔离、数据库存在性、候选动作来源、patch 范围和 artifact 校验。

#### Scenario: 服务端处理结构化空值和默认值
- **WHEN** LLM 输出包含 `null`、缺省数组、缺省字段或可规范化的旧字段
- **THEN** 服务端 MAY 将其规范化为 schema 允许的结构
- **AND** 服务端 MUST NOT 因该规范化改变 LLM 输出的高层语义动作类型

#### Scenario: 服务端校验生成型 action
- **WHEN** resolved intent 的 action 需要生成动作推荐、routine 或 plan
- **THEN** 服务端 MUST 校验生成所需的确定性字段、候选动作来源和 artifact generator 输出
- **AND** 服务端 MUST NOT 使用自然语言关键词判断该生成型 action 是否语义正确

#### Scenario: 服务端校验引用型 action
- **WHEN** resolved intent 的 action 需要读取、替换或 patch 历史 artifact
- **THEN** 服务端 MUST 校验当前用户是否可访问目标 artifact
- **AND** 服务端 MUST 校验目标动作或目标 item 是否存在于 artifact payload
- **AND** 服务端 MUST 校验最终 patch 只影响目标范围
- **AND** 服务端 MUST NOT 要求该类 action 必须具备新生成 routine 或 plan 所需的 `workoutIntent`

#### Scenario: 服务端补齐生成字段
- **WHEN** LLM 已经输出生成型 action
- **AND** 服务端拥有来自历史 artifact、结构化会话事实或 schema default 的确定性字段
- **THEN** 服务端 MAY 补齐该 action 执行所需字段
- **AND** 服务端 MUST NOT 使用这些字段反推或改写高层 action 类型

#### Scenario: 服务端处理引用型 artifact kind
- **WHEN** resolved intent 的 action 是 `exercise_replacement` 或 `workout_patch`
- **THEN** 服务端 MUST 只允许可 patch 的 `routine` 或 `plan` artifact
- **AND** 服务端 MUST 在 artifact kind 不支持时进入澄清或失败恢复
- **WHEN** resolved intent 的 action 是 `exercise_explanation`
- **THEN** 服务端 MAY 读取 `exercise_recommendation`、`routine` 或 `plan` 中的目标动作

### Requirement: 局部替换不得退化为整套重新生成
系统 SHALL 将明确指向已有 artifact 中单个动作或局部内容的替换请求执行为引用型 patch 流程，而不是重新生成整个 routine 或 plan。

#### Scenario: 用户只要求替换一个动作
- **WHEN** resolved intent 表达用户要替换已有 artifact 中的一个动作
- **AND** ReferenceResolver 能解析到当前用户可访问的目标 artifact
- **AND** 目标动作存在于 artifact payload
- **THEN** 系统 MUST 调用对应 patch 或替换流程
- **AND** 输出 patch MUST 保持非目标动作、非目标 section 和原训练结构不变
- **AND** 系统 MUST NOT 调用 routine 或 plan 生成器重新生成整套训练

#### Scenario: 替换目标不明确
- **WHEN** resolved intent 表达替换请求
- **AND** 引用对象、目标动作或目标位置无法确定
- **THEN** 系统 MUST 进入澄清或引用选择流程
- **AND** 系统 MUST NOT 根据历史摘要或关键词自行选择要修改的 artifact 或动作

#### Scenario: 关键词不能单独触发 Patch
- **WHEN** resolved intent 表达生成型 action 或普通回答
- **AND** 用户文本包含“换成”、“改成”、“调整”、“删除”等可能被旧规则命中的词
- **THEN** 系统 MUST NOT 仅因为这些关键词进入 `workout_patch` 或 `exercise_replacement` 执行流程
- **AND** 系统 MAY 在最终回复中澄清用户是否要修改已有训练内容
