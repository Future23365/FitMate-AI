## ADDED Requirements

### Requirement: `searchExerciseResources` 模型可见说明必须表达 group 与 section 的对应关系
系统 SHALL 在 `searchExerciseResources` 的模型可见 manifest、schema description、examples 或等价 output 说明中表达 `groups.<section>` 的分组语义。说明 MUST 明确 `groups.<section>.exercises[]` 是该查询结果中对应 section 的动作事实来源，`visibleTrainingProposal.exerciseItems[*].section` 应与使用的 group key 和动作 `allowedSections` 保持一致。说明 MUST 使用中文描述业务含义，`groups`、`section`、`visibleTrainingProposal`、`exerciseItems`、`allowedSections` 等技术标识保持英文原样。

#### Scenario: manifest 表达 groups section 语义
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** manifest 中的 `whenToUse`、`whenNotToUse`、schema description 或 examples description MUST 表达 `groups.<section>` 与 `visibleTrainingProposal.exerciseItems[*].section` 的对应关系
- **AND** manifest MUST 表达 `allowedSections` 是动作可进入哪些 section 的动作事实字段
- **AND** manifest MUST NOT 要求 Planner 在特定失败或缺口下必须调用某个固定 tool
- **AND** manifest MUST NOT 将 `searchExerciseResources` 描述成 routine、plan、patch、训练卡片或保存工具

### Requirement: `searchExerciseResources` model observation 必须包含短 `groupSemantics`
系统 SHALL 在 `searchExerciseResources` 成功结果的模型可见 observation 中加入短小 `groupSemantics` 摘要，用于解释当前 observation 的 `groups.<section>` 分组含义。`groupSemantics` MUST 只解释已有 `groups` 结构，不得复制动作列表、不得新增重复证据表、不得注册 resource，也不得改变 handler output 合同。

#### Scenario: observation 投影包含 groupSemantics
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 包含 `groupSemantics`
- **AND** `groupSemantics` MUST 表达 `groups.<section>.exercises[]` 中的动作是该 section 分组下返回的动作事实
- **AND** `groupSemantics` MUST 表达生成 `visibleTrainingProposal.exerciseItems[]` 时 `section` 与使用的 `groups.<section>` 和动作 `allowedSections` 之间存在事实对应关系
- **AND** `groupSemantics` MUST NOT 包含完整 handler output、完整数据库对象、secret 或跨用户 payload

#### Scenario: observation 不新增重复证据表
- **WHEN** `searchExerciseResources` model observation 生成 `groupSemantics`
- **THEN** observation MUST NOT 新增 `sectionEvidence`、`exerciseSectionEvidence`、`visibleTrainingProposalEvidence` 或等价重复动作证据表
- **AND** observation MUST NOT 复制 `groups.<section>.exercises[]` 中的 `exerciseId` 列表到第二套证据结构
- **AND** observation MUST NOT 产出 `candidate_set` resource 或其他训练生成消费 resource

