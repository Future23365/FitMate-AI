## MODIFIED Requirements

### Requirement: Agent 动作检索必须使用受控 facet 合同
Agent 通过动作检索 tool 查询动作候选或动作资源时，系统 SHALL 区分动作库真实 facet、高层身体区域和模型可见示例，不得要求模型把不存在的精确筛选值写入数据库 facet 字段。

#### Scenario: 用户表达高层身体区域
- **WHEN** 用户请求“上肢”“下肢”“腿部”“核心”或“全身”训练
- **THEN** Agent MUST 使用 `bodyRegions` 表达高层身体区域
- **AND** Agent MUST NOT 将 `upper body`、`lower body`、`full body`、`腿部`、`下肢` 或等价范围词写入 `targetMuscles` 或 `muscle`

#### Scenario: 用户表达具体肌群
- **WHEN** 用户明确请求胸部、肩部、背部、肱二头肌、臀部、股四头肌、腘绳肌、小腿或腹部等具体训练重点
- **THEN** Agent MAY 使用动作库真实 `targetMuscles` 或 `muscle` facet
- **AND** `targetMuscles` 或 `muscle` MUST 使用动作库中存在的肌群字段值

#### Scenario: 模型可见精确 facet 说明
- **WHEN** Agent 构造 `searchExerciseResources` 的模型可见 manifest、schema 描述或 examples
- **THEN** `homeRequirement`、`equipment`、`level` 等精确 facet 字段 MUST 说明它们按当前动作库真实 facet 精确过滤
- **AND** 模型可见 examples MUST NOT 包含当前动作库不存在的精确 facet 值
- **AND** `homeRequirement` 示例 SHOULD 使用 `none` 或 `无器械` 表达无器械居家条件，而不是 `home_friendly` 或 `no_equipment`
- **AND** 系统 MUST NOT 通过服务端 alias、关键词、正则、同义词表或用户原文判断把不存在的 facet 自动改写成另一个 facet

#### Scenario: searchExerciseResources 暴露真实 facet 提示
- **WHEN** Planner 可见 `searchExerciseResources` tool manifest
- **THEN** 模型可见合同 MUST 包含当前 `homeRequirement` 可用值摘要：`none`、`floor`、`support`、`small_equipment`、`gym_equipment`、`partner`、`outdoor` 及其中文含义
- **AND** 模型可见合同 MUST 包含当前常用 `equipment` 可用值摘要，例如 `body only`、`dumbbell`、`barbell`、`bands`、`machine`、`cable` 等
- **AND** 模型可见合同 MUST 包含当前 `level` 可用值：`beginner`、`intermediate`、`expert`
- **AND** 这些说明 MUST 作为 tool 合同提示，不得改变 repository 的确定性精确过滤语义
