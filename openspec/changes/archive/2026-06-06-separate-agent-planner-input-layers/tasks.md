## 1. 输入分层合同

- [x] 1.1 新增或调整模型无关 Planner 输入 envelope，明确 `protocol`、`context` 和可选 `repairContext` 的类型边界。
- [x] 1.2 调整 `DeepSeekModelAdapter` 请求构造，使稳定协议进入 system / 等价高优先级 message，当前 run 事实保留在 user payload。
- [x] 1.3 更新 request trace summary，记录协议层、当前事实层和 repair 层是否存在，但不泄漏完整敏感 payload。
- [x] 1.4 补 adapter 请求体测试，断言首轮 user payload 不再顶层平铺完整 `actionContract`，且 system / protocol 中包含稳定 AgentAction 合同。

## 2. Repair 独立化

- [x] 2.1 在 runtime validation failure 后构造脱敏 `repairContext`，包含 failed action、错误 code、字段路径、expected、actual、allowedFields、requiredFields 或 allowedValues。
- [x] 2.2 调整 adapter，使只有存在 `repairContext` 时才追加 repair-only prompt / 指令。
- [x] 2.3 保留现有 repair budget 和 validator 校验流程，确保 repair 轮返回的新 action 仍经过完整 schema、resource、policy、grounding 和 terminal validator。
- [x] 2.4 补 repair loop 测试，覆盖首轮无 repair prompt、校验失败后有 repair prompt、repair payload 含错误路径、repair 不触发服务端语义改写。

## 3. Output Contract 示例收敛

- [x] 3.1 调整 `AgentVisibleOutputContractExample` 或等价类型，将自然语言决策说明从 `expectedAction` 迁移到 `expectedDecision`。
- [x] 3.2 更新 `visibleTrainingProposalOutputContract.examples`，确保 `expectedAction` 只用于完整 `AgentAction` object。
- [x] 3.3 补 output contract 测试，断言 `expectedAction` 不能是 string，且 `expectedDecision` 可承载中文决策说明。

## 4. Tool 局部模型可见说明

- [x] 4.1 收紧 `inspectVisibleTrainingProposals(operation = "read_recent")` 的 schema description、manifest 说明和 examples，只暴露本轮 `list_recent` 返回 `factRef` / `messageId` 作为 `ref.value` 来源。
- [x] 4.2 确认 `read_recent` handler 的当前 run 可见性校验不变，不接受 metadata-only、历史消息文本、示例或编造引用。
- [x] 4.3 补 manifest 测试，断言 `read_recent.ref` 说明不包含 `diagnostic index resource` 作为输入来源，且 examples 不含可复制 fake 引用值。

## 5. Observation 投影瘦身

- [x] 5.1 瘦身 `inspectVisibleTrainingProposals.toModelObservation()`，保留索引 / consumable 导入事实、事实等级、resource 边界和必要缺口字段，移除长篇固定下一步说明。
- [x] 5.2 瘦身 `resolveExerciseResourceMentions.toModelObservation()`，保留 matched / ambiguous / not_found、`requiredExerciseIds` 边界和有限动作候选事实。
- [x] 5.3 瘦身 `searchExerciseResources.toModelObservation()`，保留 `groups.<section>.exercises[]`、`querySpecificity`、`availableSections`、`missingSectionsForRoutineOrPlan`、`supportsOutputKinds` 和 diagnostics。
- [x] 5.4 如需下一步提示，使用 `nextActionHints` 或等价短枚举表达可选恢复出口，不写固定 tool flow 或用户短语。
- [x] 5.5 补 observation 投影测试，断言不包含“必须调用某 tool”、固定用户短语、答案模板或重复全局禁止项，同时保留必要事实字段。

## 6. 抽象层级门禁

- [x] 6.1 审查最终 diff，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
- [x] 6.2 确认 `visibleTrainingProposal`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`searchExerciseResources` 等业务名只出现在 tool manifest、schema description、observation projection、resource / output contract 或测试中。
- [x] 6.3 更新或补充 architecture boundary 测试，证明 `/api/chat`、runtime、validator、tool handler 和 renderer 没有新增自然语言语义分流。

## 7. 验证

- [x] 7.1 运行 `openspec validate separate-agent-planner-input-layers --strict`。
- [x] 7.2 运行相关 prompt / adapter / repair / manifest / observation 单测。
- [x] 7.3 运行 `npm run typecheck`。
- [x] 7.4 运行 `npm test`，或在无法运行时记录具体原因和剩余风险。
