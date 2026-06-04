## Context

当前生产聊天已经通过 `visibleTrainingProposal` 将用户可见训练内容收敛到 `final_answer.visibleOutputs[]`，并通过 `readRecentVisibleTrainingProposal` 读取上一轮可见训练方案事实。最新 trace 说明当前链路仍有两个合同缝隙：

1. 模型可见 prompt 把 `visibleOutputs[].schemaVersion` 表达成数字 `1`，而 `AgentAction` schema 要求字符串，导致合法语义的 `final_answer` 被结构校验拒绝。
2. 用户说出省略表达时，模型缺少一个可调用能力来查询“当前会话到底有没有可复用的用户可见训练方案事实”，于是直接把 `searchExerciseResources` 当成刷新入口。

本 change 不新增业务 tool，不增加 `/api/chat` 关键词分流，也不在服务端根据用户原文判断“换一批”是什么意思。修复方向是将现有 `readRecentVisibleTrainingProposal` 重命名并扩展为 `inspectVisibleTrainingProposals`，让模型通过 tool 查询当前事实状态，再自主决定下一步。

任务分类为：已有业务 tool 合同重命名与扩展 + prompt/model input 合同修复。允许触碰 `readRecentVisibleTrainingProposal` 到 `inspectVisibleTrainingProposals` 的 delete-only 重命名、新 tool bundle、模型可见说明、输出投影、trace summary、相关 tests、`visibleOutputs[].schemaVersion` 的 prompt / repair / examples；禁止触碰 Agent runtime 主循环、`PlannerPort`、`/api/chat` 语义分流和 `searchExerciseResources` 的动作查询职责。

## Goals / Non-Goals

**Goals:**
- 将现有 `readRecentVisibleTrainingProposal` 重命名并扩展为 `inspectVisibleTrainingProposals`，同一个 tool 支持 `list_recent` operation 和 `read_recent` operation。
- 让模型能通过 tool 查询当前 conversation 是否存在可引用的 `visibleTrainingProposal`，而不是依赖隐藏上下文投影或服务端语义判断。
- 保持 `list_recent` 只返回轻量事实索引，`read_recent` 才导入完整可消费事实。
- 修正 `visibleOutputs[].schemaVersion` 字符串合同，统一使用 `"1"`。
- 明确 `searchExerciseResources` 只查询动作库，不负责判断是否存在上一轮可见训练方案。
- 用回归测试覆盖一组省略 / 指代 / 上下文断裂表达，验证模型能够通过 tool-first 事实查询规划，而不是只修当前一句话。

**Non-Goals:**
- 不新增 `listRecentVisibleTrainingProposals` 或其他独立 tool。
- 不新增 `/api/chat`、handler、renderer 或 Agent core 的关键词、正则、同义词、短句模板分流。
- 不让服务端判断用户自然语言是否“适合”查询动作。
- 不把 `searchExerciseResources` 扩展成上下文引用解析、事实列表、事实读取或刷新编排 tool。
- 不放宽 `VisibleOutputEnvelopeSchema` 以长期兼容数字 `schemaVersion`。
- 不重新引入旧 `exercise_recommendation_*` 事实桥或旧事实读取入口。

## Decisions

### 1. 重命名并扩展现有 tool，而不是新增 reference projection 层

采用 `inspectVisibleTrainingProposals` 作为当前会话可见训练方案事实的唯一模型可调用入口。旧 `readRecentVisibleTrainingProposal` 名称只表达 read，不表达先 inspect 再决策的能力，容易让模型把它理解成只能读取已知引用；本 change 将其 delete-only 重命名为 `inspectVisibleTrainingProposals`，不保留旧 toolName alias。新 tool 使用显式操作字段：

```ts
type InspectVisibleTrainingProposalsInput =
  | { operation: "list_recent" }
  | { operation: "read_recent"; factRef?: string; messageId?: string };
```

`operation = "list_recent"` 查询当前 actor 和当前 conversation 可访问的最近 `visibleTrainingProposal` 轻量索引；`operation = "read_recent"` 读取 `list_recent` 返回的真实引用，并把具体事实导入当前 run。operation 中保留 `recent`，是为了让模型看到 input enum 时直接理解这是最近可见训练方案事实查询，不是任意列表或任意读取；`toolName` 本身不写 `recent`，避免把默认排序策略固化到能力名称里。

备选方案是新增一个 `listRecentVisibleTrainingProposals` tool。它语义清楚，但会把同一类事实查询能力拆成两个 tool，增加 Planner 选择面和 registry 面积。用户明确要求不新增 tool，因此本 change 使用同一个 tool 的两个 operation 表达同类只读能力。

备选方案二是在 model input 里新增通用 referent projection。该方案会变成一条隐藏上下文系统，模型不能主动查询，也不符合 tool-first 的扩展方向。本 change 不采用。

### 2. `list_recent` 返回事实状态，不返回可消费事实

`list_recent` 的成功输出表达“当前有哪些可引用的可见训练方案事实”，例如：

```ts
{
  status: "succeeded",
  operation: "list_recent",
  facts: [
    {
      factRef: "fact_xxx",
      messageId: "assistant_xxx",
      proposalKind: "exercise_selection",
      visibleOutputSchemaVersion: "1",
      factSchemaVersion: 1,
      status: "active",
      trainingExerciseCount: 8,
      sectionSummary: { training: 8, warmup: 0, stretch: 0 },
      reusableTrainingExercises: [
        { exerciseId: "Power_Stairs", order: 1, nameZh: "上台阶负重" }
      ]
    }
  ]
}
```

`list_recent` 不登记 `visible_training_proposal_fact` consumable resource，不返回完整 `payload`、完整处方、完整 schedule、未展示候选、handler 内部输出或跨用户数据。`list_recent` 空结果也是成功事实查询，可以支撑模型说明“当前没有可引用方案”或发起澄清，但不能支撑训练方案生成。

### 3. `read_recent` 只接受 `list_recent` 或真实上下文中的引用

`read_recent` 必须按 `factRef` 或 `messageId` 读取具体事实。引用来源必须是当前 run 可见的 `list_recent` result、当前受控 metadata 中真实存在的引用，或同等确定性上下文；不能使用 example 占位值、模型猜测值或历史正文中的自然语言。

`read_recent` 成功后可以登记 `visible_training_proposal_fact` consumable resource，并在 observation 中说明该事实已经导入当前 run，后续不要重复读取同一引用。`read_recent` 失败必须返回结构化失败 output，例如 `status = "failed"`，而不是退化为通用 `handler_error`。

### 4. `schemaVersion` 字段拆清模型可复制语义

`final_answer.visibleOutputs[].schemaVersion` 是 visible output envelope 版本，模型输出时必须是字符串 `"1"`。这不同于数据库事实行或内部 fact payload 可能存在的数字版本。

为减少模型误复制，`inspectVisibleTrainingProposals` 的模型可见 `list_recent` / `read_recent` observation 不应把内部数字版本以泛名 `schemaVersion` 暴露为可复制字段。模型可见摘要使用更明确的字段名：

- `visibleOutputSchemaVersion: "1"`：模型写 `final_answer.visibleOutputs[]` 时可参考的字符串版本。
- `factSchemaVersion: 1`：服务端事实存储版本，仅用于说明事实兼容性，不应复制到 `visibleOutputs[].schemaVersion`。

prompt、examples、schema summary 和业务 observation 必须统一告诉模型：`visibleTrainingProposal` 的 `visibleOutputs[].schemaVersion` 要写 `"1"`，不是 `1`。通用 `AgentAction` 结构校验的 repair feedback 只说明 `visibleOutputs[].schemaVersion` 必须是字符串，具体版本值按 `outputType` 的模型可见合同和业务 validator 支持版本填写，避免 `agent-core` 硬编码业务版本。

### 5. `searchExerciseResources` 保持动作库查询职责

`searchExerciseResources` 不查询当前 conversation 的历史事实，不判断用户是否已有上一轮推荐，不承担 `list_recent` / `read_recent` 事实导入。它只在模型已经决定需要查询动作库时，按结构化筛选条件返回发布态动作摘要。

模型可见说明应表达：需要确认当前是否有可引用 `visibleTrainingProposal` 时，应使用 `inspectVisibleTrainingProposals(operation: "list_recent")`；需要复用具体方案时，应使用 `operation: "read_recent"`；需要查询新的动作候选时，才使用 `searchExerciseResources`。

这不是把“换一批”写死为某条路径，而是给模型一套可用能力：先查事实状态，再自主规划。

### 6. 测试按语义类别覆盖，不按单句补丁覆盖

测试不应只覆盖“换一批”。实现阶段至少覆盖：

- 无可见训练方案时：`换一批`、`再来一组`、`不要这个` 等省略表达先通过 `list_recent` 得到空事实，再由模型合法收口。
- 有 `exercise_selection` 时：模型 `list_recent` / `read_recent` 后可用 `excludeExerciseIds` 调用 `searchExerciseResources` 刷新动作。
- 有 `routine` 或 `plan` 时：模型 `list_recent` / `read_recent` 后能复用已有结构，按用户目标决定是否补动作、补 schedule 或澄清。
- 用户明确提出新目标时：例如“推荐几个胸部动作”，模型仍可直接调用 `searchExerciseResources`，不被强制先 `list_recent`。
- `schemaVersion: "1"` 能通过，`schemaVersion: 1` 产生明确 repair feedback。

## Risks / Trade-offs

- [Risk] 一个 tool 同时支持 `list_recent` / `read_recent` 后 input 语义变宽。→ Mitigation：使用显式 `operation` discriminated union，两个 operation 的 required fields 分开测试。
- [Risk] `list_recent` result 被模型当成完整训练方案消费。→ Mitigation：`list_recent` 不产出 consumable resource，observation 明确 facts 只是索引；terminal output validator 仍要求动作来自 `read_recent` 导入的 fact 或本轮 satisfied search result。
- [Risk] 模型继续绕过 `list_recent` / `read_recent` 直接 search。→ Mitigation：不做服务端拦截，只通过 manifest、examples、黑盒/replay 测试提升模型可见合同；明确 search tool 不负责历史事实状态。
- [Risk] `factSchemaVersion` 和 `visibleOutputSchemaVersion` 仍让模型混淆。→ Mitigation：模型可见 examples 只在 `visibleOutputs[]` 中展示 `"1"`；通用 repair feedback 针对数字 `1` 明确指出应改为字符串，业务 prompt / manifest / observation 继续声明 `visibleTrainingProposal` 使用字符串 `"1"`。
- [Risk] 删除 metadata 投影会降低模型可见事实。→ Mitigation：本 change 不要求先删除 metadata；实现可先保留安全摘要，但 `inspectVisibleTrainingProposals(operation = "list_recent")` 必须成为权威事实查询能力。后续如果要移除 metadata，应另开 change 或在本 change 实现阶段明确验证。
- [Risk] 测试用 ReplayPlanner 不能完全代表真实 LLM。→ Mitigation：先用确定性 replay 覆盖执行合同，再保留真实模型黑盒用例作为手动或 opt-in 验证。

## Migration Plan

1. 先更新 OpenSpec 与测试计划，确认不新增 tool、不改 `/api/chat` 语义分流、不放宽 `schemaVersion` schema。
2. 将 `readRecentVisibleTrainingProposal` delete-only 重命名为 `inspectVisibleTrainingProposals`，更新注册、manifest、examples、tests 和 trace/replay 引用，不保留旧 toolName alias。
3. 更新 `inspectVisibleTrainingProposals` input/output schema，引入 `operation: "list_recent" | "read_recent"`。
4. 实现 `list_recent`，并确保空列表是成功事实查询但不产出 consumable resource。
5. 调整 `read_recent`，只从真实 `list_recent`/metadata 引用读取事实，读取成功后登记当前 run consumable resource。
6. 更新模型可见 manifest、schema description、examples、observations、compressed tool results 和 repair feedback。
7. 修正 `visibleOutputs[].schemaVersion` 的 prompt、examples、schema summary 和业务 observation，统一声明 `visibleTrainingProposal` 使用字符串 `"1"`；通用 repair feedback 只保留字符串类型边界。
8. 更新 `searchExerciseResources` manifest 边界，说明它不承担可见训练方案事实 `list_recent` / `read_recent`。
9. 补齐 tool-level、manifest、prompt、chat service、validator 和 architecture boundary tests。
10. 运行 `openspec validate extend-visible-proposal-reference-tool --strict`、相关单测和 `npm run typecheck`。

回滚策略：如果 `list_recent` / `read_recent` operation 上线后真实模型表现不稳定，可以临时在 manifest 中弱化 `list_recent` 使用频率，让模型回到明确目标直接 `final_answer` / `ask_user`；不得回滚到服务端关键词分流，也不得新增同义词表拦截。

## Open Questions

- 实现阶段是否完全移除 `run.metadata.recentVisibleTrainingProposals` 的轻量投影，还是先保留作为兼容可见摘要。当前建议先保留但不让它成为唯一事实查询入口。
- `read_recent` 是否要求 `factRef` 和 `messageId` 二选一，还是只保留 `factRef`。当前建议二选一，避免只拿到 messageId 的历史场景无法恢复。
- `list_recent` 默认返回最近几条事实。当前建议使用服务端固定上限，例如 3 条，不暴露分页参数给模型。
