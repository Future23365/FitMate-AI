## Context

当前生产文本聊天链路已经允许 Planner 通过 `final_answer.visibleOutputs[]` 输出 `visibleTrainingProposal`。`visibleTrainingProposal` validator 会基于数据库动作事实复核 `exerciseId`、发布态和 `allowedSections`，因此它能正确拒绝把 `Pushups` 这类只允许 `training` 的动作放入 `warmup`。

最新 trace 暴露的问题在于前置模型可见合同不够清晰：Planner 看到了 `routine` 需要 `warmup / training / stretch`，也看到了 `searchExerciseResources` 返回的 `groups.training.exercises`，但模型可见输入没有把 `groups.<section>` 与 `visibleTrainingProposal.exerciseItems[*].section` 的对应关系表达成足够稳定的合同，导致模型把 training 组当作通用动作池使用。repair feedback 能拦截结果，但它只是保底，不应承担主要修复责任。

本 change 属于 prompt / model input / tool manifest / observation projection / repair feedback 合同修复。实现前必须保留 Agent 边界：服务端只表达确定性事实、结构合同和校验结果，不根据用户原文或具体 phrasing 替 Planner 决定下一步。

## Goals / Non-Goals

**Goals:**

- 让 Planner 在第一次生成 `visibleTrainingProposal` 前更清楚 `exerciseId + section` 必须由当前 run 可见动作事实支撑。
- 让 `searchExerciseResources` 的模型可见说明表达 `groups.<section>` 与最终 `exerciseItems[*].section` 的对应关系。
- 在 `searchExerciseResources` model observation 中加入短小 `groupSemantics`，解释本次 `groups` 分组语义，不复制动作候选或新增重复证据表。
- 让 `section_not_allowed` 进入下一轮 repair observation 时保留稳定字段：`path`、`exerciseId`、输出的 `section`、数据库 `allowedSections` 和错误 code。
- 增加测试，覆盖模型可见合同、projection、validator feedback 和 runtime repair observation。

**Non-Goals:**

- 不强制 Planner 必须调用 `searchExerciseResources` 或任何具体 tool。
- 不在 `/api/chat`、Agent core、runtime 主循环或业务 handler 中新增关键词、正则、同义词或固定短语分流。
- 不自动把非法 `section` 改成合法 `section`。
- 不把非法 `routine` 自动降级成 `exercise_selection` 或纯文本回答。
- 不放宽 `visibleTrainingProposal` validator。
- 不新增重复的完整证据表、候选池 resource 或 `candidate_set` resource。

## Decisions

### 1. 前置合同优先，repair feedback 作为保底

本次主修复点是模型可见合同和 tool observation，不是扩大 repair loop。默认 prompt / model input 应表达：`visibleTrainingProposal.exerciseItems[*]` 中的 `exerciseId` 与 `section` 需要由当前 run 可见动作事实支撑，其中 `allowedSections` 是动作可进入哪些 section 的事实字段。

取舍：只增强 repair feedback 可以让第二轮更容易修正，但第一次仍容易生成非法方案；仅靠 prompt 文案也不够稳定，因此需要同时增强 tool manifest 和 observation 的结构化摘要。

### 2. `searchExerciseResources` 只补 `groupSemantics`，不新增重复证据表

`searchExerciseResources` 已返回 `groups.<section>.exercises[*].allowedSections`。实现时只在 model observation 投影中补一个短小字段，例如：

```json
{
  "groupSemantics": {
    "groupKey": "groups.<section>",
    "sectionRelation": "每个 groups.<section>.exercises[] 条目表示该动作在本次查询中作为该 section 的动作事实返回；生成 visibleTrainingProposal.exerciseItems[] 时，section 应与使用的 group key 和动作 allowedSections 保持一致。"
  }
}
```

该字段只解释现有 `groups` 的分组语义，不复制 `exerciseId` 列表、不新增 `sectionEvidence`、不注册 resource，也不改变 handler output。

取舍：重复证据表更显眼，但会扩大模型上下文、产生第二套事实来源，并增加 projection/trace/测试维护成本。短 `groupSemantics` 能修复语义缺口，同时保持 `groups` 仍是唯一候选事实结构。

### 3. Manifest 说明表达对应关系，不写固定流程

`searchExerciseResources.whenToUse` / `whenNotToUse` / output 说明应增加：`groups.<section>` 是本次查询返回的 section 分组事实，`visibleTrainingProposal.exerciseItems[*].section` 应对应所使用动作事实所在的 section，并同时满足该动作 `allowedSections`。

说明中不得写成“遇到缺少 warmup/stretch 时必须调用某 tool”。可以表达 tool 的能力范围，例如可按 `suitabilities` 查询不同 section 的动作事实，但是否调用由 Planner 基于当前可见 tools、observations 和用户目标决定。

### 4. 结构化 repair feedback 只反馈违规事实

当 `visibleTrainingProposal` 因 `section_not_allowed` 被拒绝时，validator 应返回适合模型消费的结构化 details：

```json
{
  "code": "section_not_allowed",
  "path": "visibleOutputs[0].payload.exerciseItems[0].section",
  "exerciseId": "Pushups",
  "section": "warmup",
  "allowedSections": ["training"]
}
```

runtime 的 invalid action observation 继续透传脱敏后的错误信息，不加入业务流程建议。模型下一轮可以自行选择合法 `final_answer`、`ask_user`、`tool_call` 或其他当前 AgentAction 合同允许的动作。

### 5. 通用 prompt 不写业务 toolName 特例

`agent-llm-prompt-config.ts` 可以描述 `visibleTrainingProposal` 的通用事实合同，但不应把 `searchExerciseResources` 的具体恢复流程写入通用 prompt。业务 tool 相关说明留在 tool manifest、schema description、examples 和 observation projection。

## Risks / Trade-offs

- [Risk] 模型仍可能忽略合同并输出非法 section。→ Mitigation：validator 保持严格，repair feedback 保留结构化 violation，测试覆盖非法输出进入下一轮 observation。
- [Risk] `groupSemantics` 说明过长，挤占上下文或变成流程指令。→ Mitigation：限制为短字段，只解释 `groups.<section>` 语义，不包含固定下一步。
- [Risk] 将业务 tool 说明写进通用 prompt。→ Mitigation：测试断言通用 prompt 不新增具体 toolName 恢复流程，业务说明在 manifest/projection 层验证。
- [Risk] 实现时不小心新增重复证据表。→ Mitigation：任务和测试明确不新增 `sectionEvidence`、`exerciseSectionEvidence` 或 candidate resource。
- [Risk] 只改文案没有覆盖真实模型输入。→ Mitigation：必须测试 `serializeForPlanner()`、model observation projection、prompt config 和 runtime invalid action observation。

## Migration Plan

本 change 不涉及数据迁移、API 迁移或持久化格式迁移。实现可按以下顺序落地：

1. 增强 `visibleTrainingProposal` prompt / model input 合同。
2. 增强 `searchExerciseResources` manifest 和 model observation `groupSemantics`。
3. 增强 `section_not_allowed` 结构化 repair feedback。
4. 补齐单元测试、manifest/model input 测试和 runtime repair observation 测试。

如需回滚，删除新增 prompt/manifest/projection 说明和 repair details 字段即可；validator 的严格业务边界保持不变。

## Open Questions

无。
