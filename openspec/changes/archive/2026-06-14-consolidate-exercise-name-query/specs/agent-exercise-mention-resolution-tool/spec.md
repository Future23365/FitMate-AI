## REMOVED Requirements

### Requirement: `resolveExerciseResourceMentions` 必须解析用户点名动作到数据库动作资源
**Reason**: `resolveExerciseResourceMentions` 与 `searchExerciseResources` 在点名动作数据库查询职责上重叠，会诱导模型先解析 mention 再查询动作资源，增加重复 tool call 和失败归因复杂度。

**Migration**: 使用 `searchExerciseResources.exerciseNames` 查询模型已经结构化提取出的动作名称；名称命中候选进入 `groups.<section>.exercises[]`，未命中或冲突进入 `diagnostics`。

### Requirement: `resolveExerciseResourceMentions` 输入必须保持结构化和有界
**Reason**: 点名动作文本输入不再由独立 tool 承接，结构化和有界输入边界迁移到 `searchExerciseResources.exerciseNames`。

**Migration**: 在 `searchExerciseResources` input schema 中限制 `exerciseNames` 的数量、长度和字段含义，并继续拒绝完整用户消息、分页、任意 SQL、用户 id 或训练生成参数。

### Requirement: `resolveExerciseResourceMentions` 必须提供安全投影和模型可见说明
**Reason**: 独立 mention 解析 tool 被移除后，安全投影和模型可见说明应随动作资源查询事实一起由 `searchExerciseResources` 承载，避免同一资源出现两套 observation 合同。

**Migration**: 将点名动作名称命中、歧义、未命中、筛选冲突和 section 冲突表达迁移到 `searchExerciseResources` 的 `query`、`groups`、`diagnostics`、model-visible summary、user projection 和 trace summary。

### Requirement: `resolveExerciseResourceMentions` 必须具备 tool-level 验证
**Reason**: 该独立 tool 不再是 production 可见 tool，保留独立 handler 测试会把废弃能力误认为仍需支持。

**Migration**: 将多点名动作、未命中、歧义候选、非法 input、projection / redaction、trace summary 和 handler 失败归一化测试迁移到 `searchExerciseResources.exerciseNames` 的 tool-level tests。

### Requirement: `resolveExerciseResourceMentions` 模型可见说明必须聚焦点名动作解析
**Reason**: 点名动作解析不再是独立模型可见 tool 能力；继续维护该 manifest 会与 `searchExerciseResources.exerciseNames` 产生重复职责。

**Migration**: 在 `searchExerciseResources` 的 tool description、schema description 和 examples 中表达 `exerciseNames` 的点名动作名称查询边界，并明确不支持完整自然语言搜索或语义搜索。

### Requirement: `resolveExerciseResourceMentions` observation 必须保留解析结果和后续衔接边界
**Reason**: 独立 observation 会让模型先获取 mention 解析事实，再通过 `requiredExerciseIds` 二次查询，继续保留两段式链路。

**Migration**: `searchExerciseResources.exerciseNames` 直接返回 section-scoped 动作事实；后续衔接边界由 `groups.<section>.exercises[]`、`allowedSections` 和 `diagnostics` 表达。

