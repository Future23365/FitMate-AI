## ADDED Requirements

### Requirement: `searchExerciseResources` 多肌群查询必须均衡返回候选

`searchExerciseResources` SHALL 在输入包含多个 `muscles` 时，在每个请求的 `groups.<section>` 内尽量均衡返回各请求肌群的发布态动作候选。该行为 MUST 只改变候选选择和摘要事实，不改变 tool 的只读动作库事实查询职责。

#### Scenario: 多肌群 training 查询均衡返回候选
- **WHEN** 模型调用 `searchExerciseResources`，输入包含 `suitabilities = ["training"]`
- **AND** 输入包含多个合法 `muscles`
- **AND** 当前过滤条件下至少两个请求肌群存在匹配候选
- **THEN** `groups.training.exercises[]` MUST 尽量包含多个请求肌群的候选动作
- **AND** 系统 MUST NOT 只因默认 `name_asc` 排序而让返回候选集中在单一请求肌群
- **AND** 返回候选 MUST 继续满足 section hard filter、`level`、`equipment`、`homeRequirement`、`category`、`goalTag`、`riskTag`、`requiredExerciseIds` 和 `excludeExerciseIds` 等既有筛选合同

#### Scenario: 候选数量受上限约束
- **WHEN** 多肌群查询命中候选数量超过服务端 `maxReturnedPerSection`
- **THEN** `groups.<section>.returnedCount` MUST 不超过服务端配置的返回上限
- **AND** `groups.<section>.truncated` MUST 表达该 section 是否仍存在未返回候选
- **AND** 模型 MUST NOT 能通过 `limit`、`offset`、`page`、`pageSize`、`take` 或等价字段控制返回数量

#### Scenario: requiredExerciseIds 优先于均衡填充
- **WHEN** 输入同时包含多个 `muscles` 和合法 `requiredExerciseIds`
- **THEN** `searchExerciseResources` MUST 继续把 `requiredExerciseIds` 作为正向锚点处理
- **AND** 可纳入当前 section 的 required 动作 MUST 优先进入对应 `groups.<section>.exercises[]`
- **AND** 均衡候选选择 MUST 只用于填充剩余名额
- **AND** required 动作无法纳入时 MUST 继续产生既有 required diagnostics

### Requirement: `searchExerciseResources` section group 必须表达 0 命中请求肌群

`searchExerciseResources` SHALL 在每个返回的 `groups.<section>` 中提供 `zeroMatchMuscles` 字段，用于表达该 section 在当前过滤条件下匹配数量为 0 的请求肌群。`zeroMatchMuscles` MUST 是简单字符串数组，MUST 使用与输入 `muscles` 相同的 canonical facet 值。

#### Scenario: 当前过滤条件下某个请求肌群没有候选
- **WHEN** 模型调用 `searchExerciseResources`，输入包含多个合法 `muscles`
- **AND** 某个请求肌群在当前 section、当前其他过滤条件和当前排除条件下独立匹配数量为 0
- **THEN** 对应 `groups.<section>.zeroMatchMuscles` MUST 包含该肌群
- **AND** 该肌群 MUST NOT 出现在 `zeroMatchMuscles` 之外的同义词、自然语言短语或高层身体区域字段中

#### Scenario: 没出现在返回列表不等于 0 命中
- **WHEN** 某个请求肌群在当前过滤条件下存在匹配候选
- **AND** 该肌群没有出现在最终 `groups.<section>.exercises[]` 中
- **THEN** 系统 MUST NOT 将该肌群加入 `zeroMatchMuscles`
- **AND** `zeroMatchMuscles` MUST NOT 从最终返回动作列表倒推生成
- **AND** 系统 MUST 使用独立 count 或等价可验证统计判断该肌群是否为 0 命中

#### Scenario: 没有多肌群输入时字段保持简单
- **WHEN** `searchExerciseResources` 输入没有 `muscles`
- **OR** 输入只包含一个合法肌群
- **THEN** `groups.<section>.zeroMatchMuscles` MUST 返回空数组或在模型可见摘要中省略
- **AND** 系统 MUST NOT 为未请求的肌群生成 0 命中诊断

#### Scenario: zeroMatchMuscles 不表示用户目标失败
- **WHEN** `groups.<section>.zeroMatchMuscles` 包含一个或多个肌群
- **THEN** 模型可见说明 MUST 表达这些值只表示当前 section 和当前过滤条件下没有候选
- **AND** 模型可见说明 MUST NOT 表达数据库永久缺失该肌群
- **AND** 模型可见说明 MUST NOT 表达用户训练目标已经失败
- **AND** 模型可见说明 MUST NOT 要求固定继续调用 `searchExerciseResources` 或任何特定 tool

### Requirement: `searchExerciseResources` 多肌群覆盖增强必须保持既有边界

系统 SHALL 将多肌群均衡返回和 `zeroMatchMuscles` 作为 `searchExerciseResources` 的局部查询事实增强。该增强 MUST 不改变 Agent runtime、provider tool calling、production route、终态训练方案校验或动作保存职责。

#### Scenario: 输出主结构保持兼容
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** output MUST 继续包含 `status`、`query`、`groups` 和 `diagnostics`
- **AND** `query.totalMatches` MUST 继续表示整体 OR 查询命中数量
- **AND** `query.totalMatches` MUST NOT 改为各肌群独立 count 的求和
- **AND** `groups.<section>.exercises[]` MUST 继续只包含有限动作摘要
- **AND** output MUST NOT 新增 `coverageByMuscle`、`missingMuscles`、`uncoveredMuscles` 或其他复杂覆盖报表

#### Scenario: 不新增服务端语义分流
- **WHEN** `/api/chat` 处理用户自然语言输入
- **THEN** route、handler、renderer、LangChain runtime 和 production response adapter MUST NOT 根据用户原文关键词、正则、同义词表、短句模板或固定 phrasing 选择或改写 `searchExerciseResources`
- **AND** Planner MUST 仍基于当前 LangChain tool catalog、上下文、模型可见 observation 和 tool result 自主选择工具

#### Scenario: Tool 仍不生成训练结构
- **WHEN** `searchExerciseResources` 返回均衡后的多肌群候选
- **THEN** 该 tool result MUST NOT 生成 `visibleTrainingProposal`、routine、plan、patch、prescription、schedule、保存结果或 NDJSON 业务事件
- **AND** 结构化训练输出 MUST 继续通过 `submitVisibleTrainingProposal` 或等价终态校验工具提交并由服务端 validator 校验
