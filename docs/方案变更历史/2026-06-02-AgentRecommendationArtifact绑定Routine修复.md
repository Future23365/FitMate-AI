# Agent Recommendation Artifact 绑定 Routine 修复

时间：2026-06-02 12:40:48 CST

## 背景

最新 AI Trace 中，用户说“就显示的这 8 个动作，生成 30 分钟的训练”。外层 `recentArtifactSummaries` 已经包含上一张推荐卡片的 8 个 `exerciseIds`，但进入 Agent `ContextPackage` 后只剩 artifact 标题和摘要，具体动作 id 被丢掉。

模型随后按通用 routine prompt 重新调用 `searchExercises(candidateUse="routine")`，并且没有传臀腿或卡片动作边界。搜索结果变成腹肌、肩部和肱三头肌动作，后续 `generateRoutineDraft -> validateRoutineDraft -> evaluatePolicy -> saveConversationArtifactRevision` 都在错误候选集上成功通过。

## 调整思路

- 不让服务端通过关键词判断“显示的动作”“这张卡片”等自然语言引用。
- Agent 仍负责通过结构化决策绑定 `sourceArtifactId` 和 `requiredExerciseIds`。
- 服务端只做确定性契约校验：artifact 是否可访问、kind 是否为 `exercise_recommendation`、required 动作是否来自该 artifact、最终 draft 是否保留全部 required 动作。
- 无 artifact 绑定时，保留原来的从零 `searchExercises(candidateUse="routine")` 流程。

## 关键改动

- `ContextPackage.recentArtifacts`
  - 增加轻量 `exerciseIds` 字段，让推荐卡片的动作 id 成为 Agent 可见结构化事实。
  - trace 摘要记录 artifact 的动作数量和前若干个动作 id，方便后续直接从 log 判断事实是否进入 Agent。
- `generateRoutineDraft`
  - 输入 Schema 增加 `sourceArtifactId` 和 `requiredExerciseIds`。
  - 绑定 artifact 时读取当前用户可访问的 artifact payload，并校验 required 动作来源。
  - artifact-bound routine 只以校验后的 required 动作为必须保留输入，缺少热身或拉伸时再由服务端受控补齐。
- Agent prompt
  - 明确“基于已有推荐 artifact 生成 routine”时不得用重新裸搜候选替代推荐动作集合。

## 验证重点

- recent recommendation artifact 的 `exerciseIds` 能进入 `ContextPackage`。
- 绑定 `exercise_recommendation` artifact 生成 routine 时，推荐卡片动作全部保留。
- `requiredExerciseIds` 包含非来源 artifact 动作时，工具返回结构化失败且不生成 routine。
