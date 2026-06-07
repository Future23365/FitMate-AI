## Context

当前生产链路使用 `final_answer.visibleOutputs[]` 承载 `visibleTrainingProposal`。模型可见 `outputContracts` 要求 `routine` / `plan` 具备 `warmup`、`training`、`stretch` 三类动作事实；终态 validator 和 payload schema 也会因为缺少任一 section 返回 `section_coverage_missing` 或 schema failure。

用户希望保留模型侧完整编排偏好：生成时仍应优先包含热身和拉伸。但当模型没有生成 `warmup` 或 `stretch` 时，不希望服务端直接判定整张训练卡片失败。这个边界必须保持在合同和 validator 层，不能通过服务端自然语言分流或自动补动作实现。

## Goals / Non-Goals

**Goals:**

- 模型可见合同继续正向要求 `routine` / `plan` 优先组织为 `warmup`、`training`、`stretch`。
- 服务端只把缺少 `training` 视为 `routine` / `plan` section hard fail。
- 缺少 `warmup` 或 `stretch` 时，只要动作事实、section、处方和计划结构合法，`visibleTrainingProposal` 可以通过校验、渲染和保存。
- 富卡片 adapter 支持只展示实际存在的 section，不伪造缺失 section。
- 保留 `searchExerciseResources` support section 查询和受控补齐能力。

**Non-Goals:**

- 不告诉模型“可以不生成热身或拉伸”。
- 不让服务端自动选择、生成或补入 `warmup` / `stretch` 动作。
- 不改变 `exercise_selection` 语义。
- 不修改 `/api/chat` 主链路、PlannerPort、Executor、Policy Guard、ResourceStore 或 Response Renderer 主流程。
- 不引入用户原文关键词、正则、同义词表或 phrasing 特判。

## Decisions

1. **把 support section 完整度从 hard validation 降级为模型可见偏好。**

   - 选择：validator 只 hard fail 缺少 `training`，`warmup` / `stretch` 不再触发 `section_coverage_missing`。
   - 理由：`training` 是训练编排的主事实；`warmup` / `stretch` 是完整度和质量偏好，但缺失时不应让已合法主训练卡片整体失败。
   - 备选：继续 hard fail，然后扩大 repair。该方案会保留当前失败体验，不符合用户目标。

2. **模型可见合同只写正向偏好，不写“可省略”。**

   - 选择：`outputContracts` 改为“应优先组织为完整三段式”“不要在已有 support 候选时只输出主训练”，不出现“热身/拉伸可选”或等价说明。
   - 理由：用户明确要求不要告诉模型可以不生成热身或拉伸。
   - 备选：直接把 `warmup/stretch optional` 写进 schema summary。该方案会降低模型生成完整编排的倾向，拒绝。

3. **富卡片 schema 与 validator 对齐。**

   - 选择：`WorkoutRoutineDraft` 和非休息训练日 sections 改为 1 到 3 个 section，必须包含 `training`，`warmup` / `stretch` 有则展示。
   - 理由：否则服务端放过的合法 `visibleTrainingProposal` 会在前端 adapter 中变成空卡片。
   - 备选：adapter 静默丢弃缺 support 的 routine。该方案会让“通过校验”但“用户看不到卡片”，拒绝。

4. **保留动作来源和 section hard boundary。**

   - 选择：`exerciseId`、发布态、权限、`allowedSections`、`prescription`、`schedule` 仍由 schema 和数据库事实校验。
   - 理由：本次只拆分完整度偏好和 hard validation，不放松训练动作事实安全边界。

## Risks / Trade-offs

- [Risk] 某些输出只包含主训练，训练质量不如完整三段式。
  - Mitigation: 模型可见合同仍保持完整三段式正向要求，并保留 support section 查询能力。
- [Risk] 旧测试或 schema 假设 routine 一定有 3 个 section。
  - Mitigation: 更新共享 schema、富卡片 adapter 和相关测试，保持 `training` 必需和 section 顺序稳定。
- [Risk] 合同文案如果写成“可省略”，模型会更容易省略热身/拉伸。
  - Mitigation: 模型可见内容只表达正向完整度偏好，不使用“optional / 可选 / 可以不生成”。
- [Risk] 终态 validator 和 output contract 不一致。
  - Mitigation: 自动化测试同时覆盖 validator 行为、output contract 文案和聊天富卡片适配。
