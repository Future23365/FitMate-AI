## Context

当前 `visibleTrainingProposal` 是 `final_answer.visibleOutputs[]` 中承载动作推荐、单次训练和计划的用户可见训练事实。它的 payload schema 负责约束 `kind`、`exerciseItems`、`prescription` 和 `schedule`，但最终动作来源校验仍通过 `toolResults` 中的具体 `toolName` 分支完成：本轮 `searchExerciseResources` 返回的动作、或 `inspectVisibleTrainingProposals` / `visible_training_proposal_fact` 中的历史动作会被收集为允许输出的 `exerciseId`。

这个实现把两个边界混在一起：

1. 动作存在性和 section 合法性：应由 PostgreSQL / `Exercise` 事实决定。
2. 模型是否看过某个 tool result：应影响模型上下文和 grounding 解释，但不应成为 `visibleTrainingProposal` validator 识别动作合法性的唯一入口。

因此本 change 归类为 core contract 变更 + terminal output validation 边界调整。允许触碰 `visibleTrainingProposal` validator / renderer、terminal output validator 装配、动作事实读取服务和相关 tests；禁止修改 orchestrator 主循环语义、`PlannerPort`、`/api/chat` 关键词分流、`searchExerciseResources` 查询职责或新增业务端自然语言解析。

## Goals / Non-Goals

**Goals:**

- 让 `visibleTrainingProposal` 最终输出校验基于数据库动作事实，而不是具体 `toolName` 返回值。
- 移除 validator 和 renderer 中针对 `searchExerciseResources` / `inspectVisibleTrainingProposals` 的来源白名单分支。
- 保证最终训练卡片中的每个 `exerciseId` 都存在、发布态可用，并且输出 `section` 在该动作允许的 `allowedSections` 内。
- 让 renderer 和 fact bridge 复用同一份已校验的 canonical 动作详情，避免从具体 tool result 中拼展示字段。
- 保留 LLM 自主规划：服务端不读取用户原文拆动作名，不新增关键词、正则、同义词或短句模板。

**Non-Goals:**

- 不新增批量中文动作解析 tool。
- 不扩展 `searchExerciseResources` 的 input schema。
- 不改变 `visibleTrainingProposal.payload` 的业务结构。
- 不恢复旧 `assistant_action`、旧训练卡片事件或旧 `bubble*` 事实入口。
- 不新增持久化表或数据库迁移；如实现发现需要缓存校验详情，应另开 change。

## Decisions

### 1. 最终动作合法性由数据库事实服务校验

新增或调整一个服务端只读校验边界，例如 `validateVisibleTrainingProposalExercises()`，输入为 `visibleTrainingProposal.payload.exerciseItems`，按去重后的 `exerciseId` 批量读取 `Exercise`。校验必须覆盖：

- 动作存在；
- 动作 `isPublished = true`；
- 当前输出 `section` 属于动作 `allowedSections`；
- 返回前端展示和事实桥需要的有限 canonical 摘要，例如 `exerciseId`、`nameZh`、`nameEn`、`equipmentZh`、`primaryMusclesZh`、`allowedSections`、`imageUrl`。

选择这个方案，而不是继续读取 `searchExerciseResources` tool result，是因为数据库才是动作事实源。tool result 可以帮助模型发现动作，但最终输出是否合法不能依赖模型是否刚好调用了某个具体 tool。

### 2. Terminal output validation 需要支持数据库读取

当前 terminal output validator 是同步结构校验形态。实现阶段可以采用两种等价方式之一，但必须保证用户事件渲染前完成校验：

- 将 terminal output validator 改为 async，并由 Action Validator / Runtime 等待完成。
- 或在生产聊天装配层引入 final output validation service，在 runtime terminal action 进入 Response Renderer 前执行，并将失败归一为结构化 terminal error。

如果选择 async validator，必须证明 `agent-core` 仍不依赖 Prisma 或具体业务数据库模块；core 只持有 validator 接口，业务 validator 在生产装配层注册。如果选择后置 service，必须证明未经校验的 `visibleOutputs[]` 不会被 renderer、fact bridge 或聊天历史持久化消费。

### 3. Renderer 消费已校验动作详情

`visibleTrainingProposal` renderer 不再按 `toolResult.toolName === "searchExerciseResources"` 或 `toolResult.toolName === "inspectVisibleTrainingProposals"` 收集展示详情。它应消费终态校验服务产出的 canonical 动作详情，或从同一数据库事实服务读取详情。

选择这个方案是为了让展示来源与校验来源一致。否则 validator 虽然解耦了，renderer 仍会保留对具体 tool 输出形态的隐性依赖。

### 4. 历史可见训练事实仍需复核当前数据库

`visible_training_proposal_fact` 继续用于跨 run 引用用户已经看到的训练方案，但读取历史事实后不能绕过当前动作事实校验。历史 payload 中的 `exerciseId` 必须在最终输出时重新确认存在、发布态可用且 section 合法。若历史动作已下架或 section 边界变化，系统必须返回可恢复错误、澄清或失败收口，而不是渲染过期卡片。

### 5. Tool result 仍可用于模型上下文和普通 grounding

本 change 不否定 `searchExerciseResources` 的价值。它仍是模型发现动作、回答动作库问题和构造训练方案的事实来源之一；`usedToolResultIds` 仍可支撑普通文本回答的 grounding。变化只发生在 `visibleTrainingProposal` 的最终动作合法性：最终是否合法由数据库事实服务确认，而不是由 toolName 白名单确认。

## Risks / Trade-offs

- [Risk] 数据库校验引入 async 边界，可能扩大 `agent-core` 接口改动。→ Mitigation：core 只暴露泛化 validator 接口，不导入 Prisma；生产装配层注入业务 validator，并补 architecture boundary test。
- [Risk] 模型可能凭空输出数据库里存在但本轮没查过的动作。→ Mitigation：这是产品取舍：最终安全边界由数据库保证；模型可见 prompt 和 tool manifest 仍应引导模型先查询动作事实，黑盒测试覆盖“点名动作必须全部查询或全部输出可解释结果”。
- [Risk] 历史事实中的动作下架后，旧方案无法继续渲染。→ Mitigation：这是正确的安全行为；返回结构化校验失败或要求重新选择动作，不用过期事实绕过当前数据库。
- [Risk] renderer 和 fact bridge 需要拿到校验详情，可能形成重复查询。→ Mitigation：实现时将校验结果封装为当前 terminal action 的 validated metadata 或上下文缓存，renderer / fact bridge 复用同一份摘要。
- [Risk] 只改 validator 但漏掉错误信息、prompt 或 tests，会让模型继续认为必须依赖 `searchExerciseResources`。→ Mitigation：tasks 必须包含 prompt/model-visible 合同检查、错误信息更新和 architecture scan。

## Migration Plan

1. 先补测试复现当前耦合：新增一个 fake / future tool result 返回合法 `exerciseId` 时，旧 validator 不应因 toolName 未识别失败；最终目标是 validator 不再读取具体 toolName。
2. 实现数据库事实校验服务，并在终态输出校验前批量读取动作。
3. 调整 `visibleTrainingProposal` validator 和 renderer 使用校验服务输出的 canonical 详情。
4. 更新事实桥读取历史方案后的复核逻辑。
5. 删除 validator / renderer 中具体业务 `toolName` 分支和错误文案。
6. 运行最窄相关测试、architecture boundary test、OpenSpec strict validate 和 `npm run typecheck`。

## Open Questions

- terminal output validation 应直接改为 async，还是在生产聊天装配层增加 final output validation service？实现前需要根据当前 `runAgentRuntime()` 和 Action Validator 调用点确定改动范围。
- 校验后的 canonical 动作详情应挂在 `AgentRunResult`、terminal action metadata，还是通过 renderer context 传递？实现时必须避免把完整数据库对象暴露给模型或 trace。
