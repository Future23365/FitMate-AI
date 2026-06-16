## ADDED Requirements

### Requirement: 模型可见合同必须表达训练编排前的缺口自检

模型可见合同 SHALL 为 `routine` 和 `plan` 生成表达结构化交付前的缺口自检。该自检 MUST 引导模型区分数据库动作事实缺口、训练编排字段缺口和用户必须确认的约束缺口。只有数据库动作事实缺口 MAY 继续调用动作查询 tool；训练编排字段缺口 MUST 由模型基于当前可见候选事实、用户目标和保守默认构造后通过 `submitVisibleTrainingProposal` 提交结构化训练方案。系统 MUST NOT 通过服务端关键词、正则、同义词表、固定用户短句或具体 tool result 字段组合替模型决定是否提交。

#### Scenario: 再次查询动作库前先自检缺口类型

- **WHEN** 模型准备再次调用动作查询 tool
- **THEN** 模型可见合同 MUST 要求模型先判断当前缺口属于数据库动作事实、训练编排字段或用户必须确认的约束
- **AND** 模型可见合同 MUST 表达只有新的查询会返回当前可见事实中不存在且交付结构必需的数据库动作事实时，才继续查询动作库
- **AND** 模型可见合同 MUST 表达动作取舍、动作顺序、组数次数、休息、section 编排、`prescription` 和 `schedule` 不属于动作库查询缺口

#### Scenario: routine 候选足够时提交结构化编排

- **WHEN** 模型判断用户目标需要一次可执行 `routine`
- **AND** 当前 run 可见动作事实已经包含可选择的 `training` 候选，且这些候选能覆盖本轮主要训练目标
- **AND** 当前 run 可见动作事实已经包含可用 `warmup` 或 `stretch` 辅助候选，或用户目标允许只交付当前可支撑的 section
- **THEN** 模型可见合同 MUST 引导模型从候选池选择子集并调用 `submitVisibleTrainingProposal`
- **AND** 模型可见合同 MUST 表达 `prescription` 应由模型基于用户目标、单次时长、候选动作事实和保守训练编排构造
- **AND** 模型可见合同 MUST 表达不需要为了扩大候选数量、逐个肌群补齐辅助候选或排除未选候选继续调用动作查询 tool

#### Scenario: plan 候选足够时提交周期计划

- **WHEN** 模型判断用户目标需要多天、每周、周期、训练日或休息日安排
- **AND** 当前 run 可见动作事实已经足以组成一套可重复 `routine template`
- **THEN** 模型可见合同 MUST 引导模型先在同一个 `payload.exerciseItems[]` 中构造该 `routine template`
- **AND** 模型可见合同 MUST 引导模型补充 `schedule.assignments` 表达周期内 `training` / `rest` 日
- **AND** 模型可见合同 MUST 表达 `schedule` 不来自动作库查询，缺少 `schedule` 本身不得作为继续查询动作库的理由

#### Scenario: 缺少周期信息时优先交付 routine

- **WHEN** 用户目标包含训练目标、单次时长或器械条件
- **AND** 用户没有表达多天、每周、周期、训练日或休息日安排
- **THEN** 模型可见合同 MUST 引导模型优先交付 `payload.kind = "routine"`
- **AND** 模型可见合同 MUST NOT 要求模型为缺少周期信息的单次编排强行生成 `plan`
- **AND** 如果缺失信息会改变核心结果，模型可见合同 MUST 引导模型最多提出一个阻塞澄清问题

#### Scenario: 辅助阶段候选不要求逐肌群覆盖

- **WHEN** 当前可见候选已经包含可用 `warmup` 或 `stretch` 动作
- **AND** 用户没有明确要求热身或拉伸覆盖特定肌群、动作或限制
- **THEN** 模型可见合同 MUST 表达 warmup / stretch 辅助阶段不需要为每个目标肌群都存在 primary 候选
- **AND** 模型可见合同 MUST 表达辅助阶段局部缺口不得阻止模型基于已有事实交付可校验的 `routine` 或 `plan`

#### Scenario: 交付判据不得变成服务端语义分流

- **WHEN** 实现本交付判据
- **THEN** `/api/chat`、LangChain runtime、tool handler、validator、policy、response adapter 和 renderer MUST NOT 新增基于用户原文短语、关键词、正则或同义词表的条件分支
- **AND** 系统 MUST NOT 根据具体 `toolName` 或 tool result 字段组合替模型改写 provider `tool_calls`、`payload.kind` 或最终回答策略
