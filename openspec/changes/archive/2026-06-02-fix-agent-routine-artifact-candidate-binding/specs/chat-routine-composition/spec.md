## ADDED Requirements

### Requirement: 基于推荐 artifact 的 routine 必须保留推荐动作集合

当 Agent 通过结构化工具决策把 routine 生成绑定到 `exercise_recommendation` artifact 时，系统 SHALL 将该 artifact 中的主要 `exerciseIds` 作为 required candidate boundary。服务端 MUST 校验 artifact 归属、artifact kind、required 动作来源和最终 draft 覆盖，不得用重新裸搜得到的候选集合替代用户引用的推荐动作集合。

#### Scenario: 用户要求使用已显示推荐动作生成 routine

- **WHEN** Agent 决策将本轮 routine 生成绑定到一个当前用户可访问的 `exercise_recommendation` artifact
- **AND** 该 artifact 包含 1 个或多个主要 `exerciseIds`
- **THEN** `generateRoutineDraft` 输入 MUST 包含 `sourceArtifactId` 或等价 artifact 来源字段
- **AND** `generateRoutineDraft` 输入 MUST 包含来自该 artifact 的 `requiredExerciseIds`
- **AND** 服务端 MUST 校验全部 `requiredExerciseIds` 来自该 artifact 的 index 或 payload

#### Scenario: 生成 artifact-bound routine

- **WHEN** `generateRoutineDraft` 接收到合法的 `sourceArtifactId` 和 `requiredExerciseIds`
- **THEN** routine draft MUST 包含全部 required 动作
- **AND** required 动作 MAY 按服务端 routine section 规则重新分配顺序和阶段
- **AND** 系统 MUST NOT 因缺少热身或拉伸阶段而丢弃 required 动作

#### Scenario: 推荐动作缺少必要阶段

- **WHEN** required 动作集合不足以覆盖 `warmup`、`training` 或 `stretch` 必要 section
- **THEN** 服务端 MAY 从数据库动作库中补充必要阶段动作
- **AND** 补充动作 MUST 被加入最终 `candidateExerciseIds`
- **AND** 后续 Validator、Policy 和保存链路 MUST 使用包含 required 与 supplemental 动作的最终候选边界

#### Scenario: required 动作来源不合法

- **WHEN** `generateRoutineDraft` 输入的 `requiredExerciseIds` 不属于 `sourceArtifactId` 对应 artifact
- **OR** `sourceArtifactId` 不属于当前用户
- **OR** `sourceArtifactId` 不是可作为动作来源的推荐 artifact
- **THEN** 服务端 MUST 返回结构化工具失败
- **AND** 系统 MUST NOT 生成或保存 routine artifact

#### Scenario: 无 artifact 绑定的从零 routine

- **WHEN** Agent 没有结构化绑定已有推荐 artifact
- **THEN** 系统 MAY 继续通过 `searchExercises(candidateUse="routine")` 获取候选集合
- **AND** 服务端 MUST 继续校验草稿动作存在于数据库并属于本轮候选边界
