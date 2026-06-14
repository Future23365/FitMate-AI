## Context

当前 production `/api/chat` 使用 `LangChain Agent Runtime + DeepSeek native tool_calls`。`searchExerciseResources` 是动作库只读事实查询 tool，当前按 `suitabilities` 返回 `groups.<section>.exercises[]`，并在模型可见 observation 中暴露 `sectionSummary`、`availableSections`、`missingSections`、`groupSemantics.allowedSectionsRelation` 和每个动作的 `allowedSections`。

这个设计在完整 routine / plan 生成场景中曾用于提示 section coverage，但在“给我取出 N 个动作”这类动作集合请求中会带来过强的编排暗示：模型容易把只查询 `training` 的结果理解成仍缺 `warmup` / `stretch`，从而继续补查，而不是基于已返回动作候选收口。同时每个 section 固定返回 8 个候选，无法让模型根据用户明确数量要求一次取出 10 个或更多动作候选。

本 change 属于单个业务 tool 的执行合同和模型可见合同调整。允许触碰 `searchExerciseResources` wrapper、集中配置、tool-level tests、production catalog / model-visible contract tests 和相关 OpenSpec specs。禁止触碰 LangChain runtime 主循环、model factory provider payload、production response adapter 主流程、`/api/chat` 主链路、服务端关键词分流或具体 phrasing 特判。

## Goals / Non-Goals

**Goals:**

- 让 `searchExerciseResources` 的模型可见结果只表达按查询口径分组的动作候选事实，不再表达 section coverage 缺口或每个动作的 placement eligibility。
- 保留 `suitabilities` 作为模型主动选择候选用途的查询输入，模型需要主训练、热身或拉伸候选时仍通过结构化字段表达。
- 新增 `candidateCountPerSection`，让模型在受控上限内表达每个 section 需要多少候选动作；默认 8，最大 24。
- 保守保留最终 `visibleTrainingProposal` 服务端数据库事实校验，继续按数据库 `allowedSections` 复核最终 `exerciseItems[*].section`。
- 用 tool-level tests、catalog tests 和 model-visible contract gate 覆盖新合同，避免回归到固定 workflow、分页控制或模型可见 placement 暗示。

**Non-Goals:**

- 不移除数据库、repository、renderer、trace 或 validator 内部使用的 `allowedSections`。
- 不把 `candidateCountPerSection` 扩展成分页、offset、cursor、全库扫描或用户可控 SQL / 语义搜索能力。
- 不让服务端根据用户原文决定应该查询 `training`、`warmup` 或 `stretch`；该判断仍由模型通过 `suitabilities` 表达。
- 不改变 `submitVisibleTrainingProposal` 的 payload schema、最终结构化输出种类、保存事实流程或 response adapter。
- 不新增服务端关键词规则、自然语言模板路由、phrasing 特判或 runtime 中的具体业务 `toolName` 分支。

## Decisions

### 1. observation 使用 `candidateGroups[]` 保留查询口径，不再暴露旧 section coverage

`searchExerciseResources` 的 handler 可以继续按 `suitabilities` 分 section 查询和合并内部结果；模型可见 observation 改为 `candidateGroups[] = [{ suitability, returnedCount, truncated, zeroMatchMuscles, exercises[] }]`。每个 group 只表示本次查询输入中的候选用途来源，只包含实际请求到的 `suitability`，不填充缺失 section，也不表达完整 routine / plan coverage。每个动作摘要保留 `exerciseId`、`nameZh`、`nameEn`、`equipmentZh`、`homeRequirementZh`、`primaryMusclesZh`、`imageUrl` 等动作事实，不再包含 `allowedSections`。

理由：顶层拍平 `exercises[]` 会在多 `suitabilities` 查询时丢失候选来源；旧 `groups.<section>` 又容易和 `sectionSummary`、`missingSections` 一起被理解成训练编排 coverage。`candidateGroups[]` 只保留查询来源，不暴露 placement eligibility，让模型能知道“这些候选是按哪个 `suitability` 查出来的”，但不能从 tool result 推导“还缺哪个 section”或“这个动作还能放在哪里”。

备选方案一是使用顶层 `exercises[]`。不采用，因为它会丢失查询来源，尤其在 `suitabilities` 同时包含多个值时会让模型难以区分候选用途。备选方案二是保留旧 `groups` 并把 `allowedSections` 重命名为 `eligibleSections`。不采用，因为用户明确希望模型不要再从 tool result 中看到“应该放在哪里”的字段；保留同类字段仍容易让模型围绕 placement 继续推理。

### 2. 从模型可见 observation 删除 section coverage 字段

模型可见 summary 删除 `sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation` 和 `groupSemantics`。`query.suitabilities`、`candidateGroups[].suitability`、`returnedCount`、`truncated`、`appliedFilters`、`filterApplications` 和 diagnostics 仍可作为查询事实存在，但不得表达缺失 section、固定补查流程或最终输出禁令。

理由：`missingSections` 的词义天然像“任务缺口”，在动作集合请求中会误导模型继续补查。是否需要完整 routine / plan 结构应由模型根据用户目标判断，并通过后续 `suitabilities` 查询或 finalization validator 的反馈修正，而不是由 `searchExerciseResources` observation 主动提示缺口。

### 3. 新增 `candidateCountPerSection`，而不是开放 `limit` / `pageSize`

新增 input 字段 `candidateCountPerSection?: number`，默认来自集中配置 `defaultCandidateCountPerSection = 8`，最大值来自集中配置 `maxCandidateCountPerSection = 24`。handler 将该值映射到 repository 内部 `maxReturned`，repository hard cap 仍保留。

理由：用户明确数量诉求是候选规模，不是分页能力。`candidateCountPerSection` 表达每个请求 section 的候选预算；它不会提供 offset、cursor 或跨页读取，也不会让模型复制 output-only 的 `maxReturned`。

备选方案是把默认 8 直接改成 10 或 24。拒绝原因是固定默认值不能覆盖不同用户数量诉求，还会无条件放大模型上下文。

### 4. 最终 validator 继续使用数据库 `allowedSections`

虽然 `searchExerciseResources` 的模型可见 observation 不再返回 `allowedSections`，最终 `visibleTrainingProposal` validator 仍继续通过数据库动作事实复核 `exerciseItems[*].section` 是否被该动作的 `allowedSections` 覆盖。模型若需要某类 section 候选，应通过 `suitabilities` 查询对应候选；若最终 section 不合法，仍进入现有 validator / repair 路径。

理由：删除模型可见 placement 字段是减少 tool result 对模型编排的干扰，不等于放弃服务端确定性校验。保守保留 validator 能避免模型把明显不适合拉伸或热身的动作写入对应 section。

### 5. 只改单个业务 tool 和相关模型可见合同

本 change 不修改 LangChain runtime、provider payload、response adapter 或 `/api/chat`。`searchExerciseResources` 的 tool description / schema description / model-visible summary 由该 tool 自己承担，通用 prompt 不新增具体短句或 toolName 触发规则。

抽象层级门禁结论：

1. 抽象问题类型：tool result summary 把动作候选事实和 section 编排诊断混在一起。
2. 通用合同修复：query tool 只暴露资源候选事实和受控候选规模，不表达最终编排缺口。
3. 业务 tool 局部说明：`searchExerciseResources` 返回按查询口径分组的动作候选；`suitabilities` / `candidateGroups[].suitability` 是查询来源，不是最终 placement；最终编排由模型决定，服务端复核。
4. 回归测试样例：覆盖“取 10 个动作”“推荐 12 个练胸动作”“生成完整训练 routine”三类语义。
5. 服务端语义分流检查：不新增关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支。

## Risks / Trade-offs

- [Risk] 模型不再看到 `allowedSections`，生成完整 routine 时可能把动作放进不合法 section。  
  → Mitigation: 保留最终 `visibleTrainingProposal` 数据库校验和 repair 反馈；需要 section 候选时模型通过 `suitabilities` 查询对应动作。

- [Risk] `candidateCountPerSection = 24` 会放大模型上下文。  
  → Mitigation: 默认仍是 8；24 是显式上限；tool result summary 继续只返回有限动作摘要，不返回完整 handler output 或数据库对象。

- [Risk] 旧 specs / tests 中仍断言旧 `groups`、`missingSections` 或 `allowedSections` 存在，或新测试误把 `candidateGroups[].suitability` 当成 placement eligibility。  
  → Mitigation: 本 change 明确修改 `agent-exercise-resource-query-tool`、`agent-tool-production-hardening` 和 `ai-token-budgeting` specs，并要求更新 tool-level、catalog 和 contract gate 测试。

- [Risk] 将 `candidateCountPerSection` 误用为分页。  
  → Mitigation: schema description 和 production hardening spec 明确禁止 `limit`、`page`、`pageSize`、`offset`、`take`、`maxReturned`、`cursor` 等分页 / offset 字段，Action Validator 继续拒绝未知字段。
