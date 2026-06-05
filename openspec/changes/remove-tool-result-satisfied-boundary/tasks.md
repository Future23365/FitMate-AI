## 1. 边界确认

- [x] 1.1 复核本 change 为 `agent-tool-change-governance` 的 Core Contract 变更，secondary 为 `agent-prompt-contract-governance` 的模型可见合同同步检查。
- [x] 1.2 确认允许触碰模块：Agent core contracts、action validator、observation、runtime duplicate feedback、response renderer、resource contract、terminal output validator wiring、Planner input 注释/投影、trace/replay 和相关 tests。
- [x] 1.3 确认禁止触碰模块：业务 tool handler 查询语义、服务端关键词/正则/同义词/用户 phrasing 分流、Agent core 内具体业务 `toolName` 语义分支、`/api/chat` 外部 stream contract 非必要变更。
- [x] 1.4 检查当前 Git 工作区，确认无关 diff 不进入本 change。
- [x] 1.5 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁审查，确认没有把本次 trace、用户原话、具体业务 toolName 或字段组合升格成 core 规则。
- [x] 1.6 读取当前真实代码路径并记录 `fulfillment.satisfied` 的全部读写点：contracts、executor、runtime、action-validator、observation、response-renderer、resource-contract、planner adapter、trace、tests。

## 2. Core Contract 调整

- [x] 2.1 将 `ToolResult.ok` 明确为 tool 执行成功的唯一 core gate：handler/schema/权限/执行合同成功即为 `ok=true`。
- [x] 2.2 删除或降级 `fulfillment.satisfied` 在普通 `final_answer` grounding 中的硬判断；`ok=true` 且 current-run 的 tool result 可以支撑普通事实回答。
- [x] 2.3 调整 `action-validator`：保留 unknown ref、failed tool result、跨 run/resource role 不合法等通用拒绝；删除 `ok=true` 但 `satisfied=false` 不能被普通 `final_answer` 引用的规则。
- [x] 2.4 调整 `observation` / Planner input：不再把 `satisfied=false` 作为成功事实与诊断事实的核心分流依据；0 条成功查询可进入事实通道。
- [x] 2.5 调整 `resource-contract` 相关文档和 tests，确认 `resource.role` 只表达可消费用途，不表达业务目标是否满足。
- [x] 2.6 如保留 `fulfillment.satisfied` 字段，添加注释或类型说明，明确它只是非阻断诊断信息；如删除字段，同步所有类型和 fixture。

## 3. Final Output Validation 收敛

- [x] 3.1 保留并加强 `TerminalOutputValidatorRegistry`：core 只按 `outputType + schemaVersion` 分发，不理解业务 payload。
- [x] 3.2 确认 `visibleTrainingProposal` 最终 validator 校验数量、数据库动作事实、发布态、section、prescription、schedule 和 payload.kind。
- [x] 3.3 确认 0 条 tool result 不能被用来伪造 `visibleTrainingProposal.exerciseItems`；失败必须来自最终 validator，而不是中间 tool result gate。
- [x] 3.4 确认正文 `content` 不会被解析、补全或保存成结构化训练事实。
- [x] 3.5 确认 fact bridge、renderer 和聊天历史只消费通过最终 validator 的 `visibleOutputs`。

## 4. Repair / Duplicate / Trace 调整

- [x] 4.1 将 `duplicate_tool_success` 重命名或迁移为不带业务成功含义的重复输入反馈，例如 `duplicate_tool_input`。
- [x] 4.2 duplicate feedback 只表达相同 input 已执行、既有 `toolResultId`、`ok` 状态、结果摘要和重复次数；不得指定具体业务 tool 或下一步 action。
- [x] 4.3 repair feedback 不再说 `satisfied=false` 不能支撑 `final_answer`；改为说明最终结构化输出必须通过对应 validator。
- [x] 4.4 trace / `/dev/ai-traces` 摘要区分 tool execution、fact result、diagnostics、duplicate input 和 terminal output validation。
- [x] 4.5 如需兼容旧 trace code，明确兼容入口和清理条件；不得保留旧 code 的业务语义。

## 5. Model-Visible Contract 同步

- [x] 5.1 更新 system prompt / model input 说明：tool result 是事实材料，0 条结果可用于普通事实回答。
- [x] 5.2 更新 tool manifest / observation / compressed tool result 说明：中间 tool result 不代表最终业务成功或失败。
- [x] 5.3 更新 final grounding 说明：普通文本回答引用 current-run ok tool result；结构化业务交付通过 `visibleOutputs` validator。
- [x] 5.4 更新 repair feedback 中文文案，保留 `toolName`、字段名、错误码等技术标识英文原样。
- [x] 5.5 确认模型可见合同没有要求固定调用 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或任何具体业务 tool。

## 6. 测试

- [x] 6.1 更新 agent-core action-validator tests：`ok=true` 且 0 条/diagnostic 摘要的 tool result 可以支撑普通 `final_answer`。
- [x] 6.2 更新 agent-core action-validator tests：`ok=false`、不存在 ref、跨 run resource、diagnostic resource 作为成功结构化 grounding 仍被拒绝。
- [x] 6.3 更新 visibleTrainingProposal validator tests：最终 payload 数量不足、缺 section、非法 `exerciseId`、section 不合法仍被拒绝。
- [x] 6.4 新增或更新 runtime duplicate tests：重复同 input 触发 duplicate input feedback，不再出现 `duplicate_tool_success` 业务成功语义。
- [x] 6.5 更新 observation / Planner input tests：0 条成功查询进入事实通道，repair/diagnostic 不再依赖 `satisfied` gate。
- [x] 6.6 更新 response renderer tests：普通 0 条结果回答可输出 content；未通过 final validator 的 visible output 不输出、不保存。
- [x] 6.7 更新 trace / replay tests：trace 可复盘 tool result、duplicate input 和 final validator 判定，不依赖中间 `satisfied` 作为业务成败。
- [x] 6.8 更新 prompt / model-visible contract tests：说明中不再把 `satisfied=true/false` 作为普通 final answer 的成功/失败 gate。
- [x] 6.9 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`，确认没有新增服务端关键词路由、phrasing 特判或具体业务 `toolName` 语义分支。
- [x] 6.10 运行与 core 合同相关的最窄测试文件，例如 action-validator、runtime、observation、response-renderer、terminal-output-validator、trace/replay、chat-service 相关测试。
- [x] 6.11 修改 TypeScript、schema、AI orchestration 或共享业务逻辑后运行 `npm run typecheck`。

## 7. OpenSpec 和收尾

- [x] 7.1 运行 `openspec validate remove-tool-result-satisfied-boundary --strict`。
- [x] 7.2 最终 diff 检查，确认没有混入当前工作区已有无关 diff。
- [x] 7.3 如果实现阶段修改核心架构或核心链路，在 `docs/方案变更历史/` 新增上海时间到秒的方案变更记录。
- [x] 7.4 如果实现阶段修改核心链路，在 `docs/项目演变历程.md` 末尾追加简要演变记录。
- [x] 7.5 最终总结改了什么、为什么 final-output-centered validation 优于中间 tool-result-centered gate、如何验证、是否存在未运行真实 LLM 的剩余风险。
