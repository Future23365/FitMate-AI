## ADDED Requirements

### Requirement: `searchExerciseResources` 宽泛候选查询必须使用内部低门槛器械默认
系统 SHALL 在 `searchExerciseResources` 的宽泛候选查询中，为未显式指定 `equipment` 的输入应用内部低门槛器械默认。该默认 MUST 使用现有无外部器械兼容筛选条件，而不是严格匹配单一 `no_equipment` 字面值。该默认 MUST NOT 自动附加 `homeRequirement`、不得根据用户原文做关键词分流，也不得改变模型可见 input schema。

#### Scenario: 宽泛 training 查询未传 equipment
- **WHEN** Planner 调用 `searchExerciseResources`
- **AND** 输入包含 `suitabilities = ["training"]`
- **AND** 输入包含 `muscles`
- **AND** 输入未包含 `equipment`
- **AND** 输入未包含 `exerciseNames`
- **AND** 输入未包含 `requiredExerciseIds`
- **THEN** repository MUST 使用现有无外部器械兼容筛选条件构造候选查询
- **AND** 该筛选条件 MUST 覆盖自重或等价无外部器械数据库字段
- **AND** 该筛选条件 MUST NOT 严格只匹配 `equipment = "no_equipment"`
- **AND** 该筛选条件 MUST NOT 自动添加 `homeRequirement`

#### Scenario: 点名动作查询不应用内部低门槛默认
- **WHEN** Planner 调用 `searchExerciseResources`
- **AND** 输入包含 `exerciseNames`
- **AND** 输入未包含 `equipment`
- **THEN** repository MUST NOT 因缺少 `equipment` 自动应用内部低门槛器械默认
- **AND** repository MUST 继续按动作名称字段执行确定性名称匹配
- **AND** 器械类点名动作 MUST NOT 仅因未传 `equipment` 被默认无外部器械口径过滤

#### Scenario: requiredExerciseIds 查询不应用内部低门槛默认
- **WHEN** Planner 调用 `searchExerciseResources`
- **AND** 输入包含合法 `requiredExerciseIds`
- **AND** 输入未包含 `equipment`
- **THEN** repository MUST NOT 因缺少 `equipment` 自动应用内部低门槛器械默认
- **AND** 可纳入当前 section 和排除边界的 required 动作 MUST 继续优先进入候选列表
- **AND** required 动作无法纳入时 MUST 继续产生既有 required diagnostics

#### Scenario: 显式 equipment 覆盖内部默认
- **WHEN** Planner 调用 `searchExerciseResources`
- **AND** 输入包含合法 `equipment`
- **THEN** repository MUST 使用 Planner 显式输入的 `equipment` 构造查询
- **AND** repository MUST NOT 再叠加内部低门槛器械默认
- **AND** 显式 `equipment = "no_equipment"` MUST 继续复用现有无外部器械兼容筛选条件

#### Scenario: 内部默认不进入模型可见 query
- **WHEN** 内部低门槛器械默认在 `searchExerciseResources` 查询中生效
- **THEN** 模型可见 observation MUST NOT 将该内部默认回显为 `query.equipment`
- **AND** 模型可见 observation MUST NOT 将该内部默认回显为 Planner 显式 `appliedFilters.equipment`
- **AND** 模型可见 observation MUST NOT 新增可供模型复制的内部默认字段
- **AND** trace summary MAY 记录内部默认是否生效，用于服务端调试复盘

### Requirement: `searchExerciseResources` 肌群查询必须优先返回主肌群命中候选
系统 SHALL 在 `searchExerciseResources` 输入包含 `muscles` 时，优先返回请求肌群作为主肌群命中的动作候选。候选排序 MUST 先按请求肌群输入顺序确定肌群优先级，再按主肌群命中优先于辅助肌群命中排序，最后使用现有 `sort` 和稳定 `id` 排序作为 tie-breaker。多肌群查询 MUST 继续保持代表性覆盖。

#### Scenario: 单肌群查询主肌群命中优先
- **WHEN** Planner 调用 `searchExerciseResources`
- **AND** 输入包含 `muscles = ["腹肌"]`
- **AND** 当前查询口径同时存在 `primaryMusclesZh` 命中腹肌的动作和仅 `secondaryMusclesZh` 命中腹肌的动作
- **THEN** 返回候选 MUST 优先包含 `primaryMusclesZh` 命中腹肌的动作
- **AND** 仅辅助肌群命中的动作 MUST 排在同等条件下主肌群命中动作之后
- **AND** 同优先级候选 MUST 继续使用现有 `sort` 和稳定 `id` 排序

#### Scenario: 多肌群查询按输入顺序和代表性覆盖返回
- **WHEN** Planner 调用 `searchExerciseResources`
- **AND** 输入包含多个合法 `muscles`
- **AND** 当前过滤条件下至少两个请求肌群存在匹配候选
- **THEN** 返回候选 MUST 尽量覆盖多个请求肌群
- **AND** 请求肌群的候选优先级 MUST 遵循 `muscles` 输入顺序
- **AND** 每个肌群桶内 MUST 优先返回该肌群作为主肌群命中的动作
- **AND** 系统 MUST NOT 只因默认 `name_asc` 排序而让辅助命中或单一肌群候选挤占全部返回名额

#### Scenario: requiredExerciseIds 优先于肌群排序
- **WHEN** 输入同时包含 `muscles` 和合法 `requiredExerciseIds`
- **THEN** `searchExerciseResources` MUST 继续把 `requiredExerciseIds` 作为正向锚点处理
- **AND** 可纳入当前查询口径的 required 动作 MUST 优先进入对应候选列表
- **AND** 肌群优先排序 MUST 只用于填充剩余名额

### Requirement: `searchExerciseResources` 默认候选策略不得变成服务端语义分流
系统 SHALL 将低门槛默认和肌群优先排序作为 `Exercise` 资源查询的内部候选策略，而不是自然语言意图识别规则。Route、runtime、handler 和 repository MUST NOT 根据用户原文、关键词、短句模板、同义词表或具体 phrasing 改写 provider tool call、`toolName`、调用顺序或最终回答策略。

#### Scenario: 不新增自然语言分流
- **WHEN** `/api/chat` 处理用户自然语言输入
- **THEN** route、LangChain runtime、tool wrapper 和 response adapter MUST NOT 根据用户原文选择或改写 `searchExerciseResources`
- **AND** `searchExerciseResources` handler MUST NOT 读取完整用户原文来决定是否应用内部低门槛默认
- **AND** 内部低门槛默认 MUST 只基于结构化 tool input 是否包含 `equipment`、`exerciseNames` 和 `requiredExerciseIds` 等稳定字段判断
- **AND** tests MUST prove no new keyword, regex, synonym table or fixed phrase routing is introduced for this behavior

#### Scenario: 模型可见说明不引入固定短句规则
- **WHEN** production registry 序列化 `searchExerciseResources` manifest、schema description 或 examples
- **THEN** 模型可见说明 MUST NOT 表达“当用户说某个短句时必须省略或填写 `equipment`”
- **AND** 模型可见说明 MUST NOT 把宽泛动作推荐写成固定 tool workflow
- **AND** 模型可见说明 MAY 保持 `equipment = "no_equipment"` 作为显式无外部器械查询的 canonical input 值
- **AND** 模型可见说明 MUST NOT 暴露内部低门槛默认为模型应复制的工具参数
