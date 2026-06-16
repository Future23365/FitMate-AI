## ADDED Requirements

### Requirement: `searchExerciseResources` 模型可见说明必须短结构化并表达批量候选查询边界

`searchExerciseResources` description SHALL 使用短结构表达该 tool 的动作库候选查询职责。说明 MUST 让模型知道该 tool 支持一次性查询多个 `suitabilities`，查询结果是可消费候选事实，不是训练方案本身；当已有候选足以支撑当前输出时，模型不应继续为了完整 inventory 拆分查询。

#### Scenario: Description 使用固定短结构

- **WHEN** production LangChain tool catalog 序列化 `searchExerciseResources`
- **THEN** tool description SHOULD 使用 `Purpose`、`Use When`、`Do Not Use When`、`Input Source`、`Output Meaning` 和 `Grounding Rules` 或等价短结构
- **AND** 每个分段 SHOULD 只保留少量高优先级边界，避免重复 system prompt、schema description 或 finalization tool 的完整 workflow
- **AND** description MUST 使用中文描述业务含义，`searchExerciseResources`、字段名和枚举值保持英文原样

#### Scenario: 支持一次性批量 section 候选查询

- **WHEN** 模型需要为一次 `routine` 或 `plan` 获取热身、主训练和拉伸候选
- **THEN** `searchExerciseResources` 模型可见说明 MUST 表达可在同一次调用中传入多个 `suitabilities`
- **AND** 示例或说明 MAY 展示 `suitabilities = ["warmup", "training", "stretch"]`
- **AND** 模型可见说明 MUST 表达 `candidateGroups[]` 按 `suitability` 返回候选动作
- **AND** 模型可见说明 MUST NOT 暗示必须分别为 `warmup`、`training` 和 `stretch` 连续调用该 tool

#### Scenario: 候选足够时不继续 inventory 查询

- **WHEN** `searchExerciseResources` 已返回与当前用户目标、执行条件和 `suitabilities` 对齐的可消费候选
- **THEN** 模型可见说明 MUST 表达这些候选可用于普通文本回答或后续结构化收口
- **AND** 模型可见说明 MUST 表达不应为了完整覆盖动作库、补全所有肌群或扩大 inventory 而继续拆分查询
- **AND** 模型可见说明 MUST NOT 把 broad query 已返回候选描述成必须升级为更窄查询后才可消费

### Requirement: `searchExerciseResources` 可消费候选事实等级必须与查询宽窄分离

`searchExerciseResources` model-visible summary SHALL 使用独立语义表达候选可消费性和查询边界。成功结果只要包含可供模型选择并可被服务端复核的 `candidateGroups[].exercises[]`，就 MUST 被表达为候选事实；broad query、默认查询、诊断信息或查询宽窄 MUST 使用单独查询边界字段或诊断字段表达，不得把可消费候选降级为 `diagnostic`。

#### Scenario: Broad query 返回动作候选仍是 candidate

- **WHEN** `searchExerciseResources` 成功返回一个或多个 `candidateGroups[].exercises[]`
- **AND** 这些动作来自发布态动作库且可被服务端按 `exerciseId` 复核
- **THEN** model-visible summary MUST 将结果表达为可消费候选事实
- **AND** 如果 summary 暴露 `factLevel` 或等价字段，该字段 MUST NOT 因查询未填写 `muscles`、查询较宽、使用默认执行条件或候选数量较多而设为 `diagnostic`
- **AND** 查询宽窄、默认条件、空过滤或 broad query MAY 通过 `queryScope`、`queryBoundary`、`diagnostics` 或等价非候选等级字段表达

#### Scenario: diagnostic 只用于不可消费或诊断性结果

- **WHEN** `searchExerciseResources` 没有返回可消费动作候选
- **OR** 工具结果只包含 schema 拒绝、空结果解释、服务端失败、不可执行诊断或与动作候选无关的调试信息
- **THEN** model-visible summary MAY 使用 `diagnostic` 或等价非候选语义
- **AND** summary MUST 清楚说明该结果不能直接支撑 `visibleTrainingProposal.exerciseItems[*].exerciseId`
- **AND** summary MUST NOT 要求模型通过更窄查询“升级”已有可消费候选

#### Scenario: 旧 diagnostic broad query 断言被替换

- **WHEN** 实现本 change 的测试覆盖 `searchExerciseResources` broad query
- **THEN** 测试 MUST 断言 broad query 命中候选时模型可见事实等级仍表达为 candidate 或等价可消费候选语义
- **AND** 测试 MUST 断言查询宽窄通过独立字段或文本边界表达
- **AND** 测试 MUST 删除或更新“default-only searches are diagnostic instead of fulfilled facts”这类把 broad query 与不可消费诊断绑定的断言
