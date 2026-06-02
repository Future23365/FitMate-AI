## Context

当前 `/api/chat` 已切到 Tool-first `AgentOrchestrator`。进入主链前，`recentArtifactSummaries` 已能从 `ArtifactIndex` 读到推荐卡片的 `exerciseIds`；但 `buildAgentContextPackage()` 转成 `ContextPackage` 时只保留 `artifactId / kind / title / summary / updatedAt`，导致 Agent tool decision 看不到推荐卡片里的具体动作 id。

同时，Agent prompt 对 routine 生成有一个过强的通用约束：只要用户要求训练编排，就必须先 `searchExercises(candidateUse="routine")`。这在“从零生成 routine”场景合理，但在“基于已有推荐卡片生成 routine”场景会诱导模型重新裸搜。后续 `generateRoutineDraft` 和 Validator 只校验动作来自当前候选集合，无法证明该候选集合来自用户引用的推荐卡片。

## Goals / Non-Goals

**Goals:**

- 让 Agent 可见 recent artifact 摘要中的主要 `exerciseIds`，尤其是 `exercise_recommendation` artifact。
- 让 Agent 在结构化决策中可以把 routine 生成绑定到已有 recommendation artifact。
- 绑定 recommendation artifact 后，服务端必须把该 artifact 的动作集合作为 required candidate boundary。
- `generateRoutineDraft` 必须保留全部 required 动作，只允许为缺失阶段补充数据库内受控动作。
- trace 和测试能证明最终 routine 使用了 artifact 动作集合，而不是裸搜得到的无关候选。

**Non-Goals:**

- 不在服务端用关键词、正则或短句模板判断用户是否“引用卡片”。
- 不把自然语言 summary 当作完整事实源。
- 不改变数据库表结构或 artifact payload 格式。
- 不重写动作搜索排序系统。
- 不要求推荐动作顺序必须等于 routine 展示顺序。

## Decisions

1. `ContextPackage.recentArtifacts` 保留主要 `exerciseIds`。

   `ArtifactIndex` 已经保存主要动作 id，因此把这些 id 透传进 Agent 上下文属于结构化事实传递，不是服务端语义判断。为控制 token，只保留 id 列表，不追加图片、动作详情或展示字段；需要完整 payload 时仍通过 `getArtifactPayload` 读取。

   备选方案是强制模型每次先 `getArtifactPayload`。该方案事实更完整，但当 recent summary 已包含足够 id 时会增加一次 tool roundtrip；更合理的做法是 summary 暴露轻量 id，并在需要验证来源时由服务端读取 artifact/index 做确定性校验。

2. `generateRoutineDraft` 增加 artifact 来源和 required 动作输入。

   工具输入新增 `sourceArtifactId`、`requiredExerciseIds`、`requiredExerciseSource` 等结构化字段。模型只有在结构化决策绑定 artifact 后才传这些字段；服务端不从用户原文推断。工具执行时读取当前用户可访问的 artifact/index，校验 required ids 全部来自该 artifact，再调用 routine builder。

   备选方案是在 `searchExercises` 里支持 `allowedExerciseIds` 并先生成一个 candidate set。该方案也可行，但会把 artifact 绑定逻辑塞进通用检索工具，容易污染“从零搜索”的语义。将 required 边界放在 draft 工具更接近真实业务：routine 生成才需要证明必须保留哪些动作。

3. 候选边界分成 required 与 supplemental。

   required 动作来自绑定 artifact，必须全部进入 draft；supplemental 动作只允许用于补齐缺失的 `warmup` 或 `stretch`。`generateRoutineDraft` 输出的 `candidateExerciseIds` 继续代表最终可校验边界，包含 required 和 supplemental，供 `validateRoutineDraft`、Policy 和保存链路复用。

4. Prompt 只约束结构化流程，不做关键词分流。

   prompt 应说明：如果用户请求基于已有推荐 artifact 的动作生成 routine，应优先使用 recent artifact / `getArtifactPayload` 的动作 id，并在 `generateRoutineDraft` 中传入 `sourceArtifactId` 与 `requiredExerciseIds`；只有没有可绑定 artifact 或需要额外候选时，才使用 `searchExercises(candidateUse="routine")`。

## Risks / Trade-offs

- [Risk] recent artifact 的 `exerciseIds` 过多导致 token 增长。→ `ArtifactIndex` 主要动作数量有限，ContextPackage 只传 id，不传详情；如未来有大 payload，再在 builder 层做数量上限。
- [Risk] LLM 绑定了错误 artifact。→ 服务端只能校验 artifact 归属和 required ids 来源；若模型语义选错，应通过 prompt、ReferenceResolver、payload 读取或澄清改进，不引入服务端关键词纠偏。
- [Risk] 推荐卡片动作缺少热身/拉伸，routine 仍需要三段式。→ 服务端仅补齐必要阶段，并把补充动作加入最终候选边界和 trace。
- [Risk] 旧测试只断言 candidateSetId 来自 searchExercises。→ 更新测试为断言 artifact-bound routine 可不依赖裸搜，并且 required 动作全部保留。

## Migration Plan

1. 更新 OpenSpec delta spec 和 tasks。
2. 扩展 Agent artifact summary schema、上下文映射和 trace 摘要。
3. 扩展 `generateRoutineDraft` schema、描述和执行校验，读取 artifact/index 确认 required ids 来源。
4. 调整 Agent prompt 中 routine 候选获取规则。
5. 补充单元测试覆盖 artifact-bound routine，并运行相关测试和 typecheck。
6. 更新方案变更历史与项目演变历程。

## Open Questions

无。当前修复只处理结构化 artifact 绑定后的确定性契约，不新增服务端自然语言判断。
