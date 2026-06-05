## 1. 现状确认与抽象边界

- [x] 1.1 运行 `git status --short`，确认实现前工作区状态，并确保不混入无关前端、runtime、测试或生成文件改动。
- [x] 1.2 读取本 change 的 `proposal.md`、`design.md` 和 specs，确认任务分类为 production 接入变更 + terminal output validation repair 合同补强，不是新增业务 tool。
- [x] 1.3 读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认允许触碰 production chat adapter、用户可见错误投影、prompt / observation / repair 合同和相关测试；禁止修改 PlannerPort、Executor 主流程、Policy Guard、Resource Contract Validator 主流程或新增服务端自然语言分流。
- [x] 1.4 使用 Agent 修复方案抽象层级门禁审查实现方案，确认没有把具体 trace、用户原话、具体 `toolName`、字段组合或 phrasing 升格为通用 runtime / prompt / 服务端生产规则。
- [x] 1.5 读取最新 `codex_logs/ai_trace_log.js` 和必要的 `ai_trace_texts.jsonl` 摘要，确认失败证据仍是 terminal validation / repair exhausted 类问题；如果日志已被覆盖，改用当前可复现测试 fixture 或重新导出的 trace。

## 2. Production terminal failure 投影

- [x] 2.1 在 production chat adapter 或等价边界中新增统一 terminal failure projection helper，输入只来自 `AgentRunResult`、terminal error code、validation details、budget / repair trace、registry/tool capability 和 provider/config 状态等确定性事实。
- [x] 2.2 为 `repair_limit_exceeded` + terminal output validation / terminal reference / resource coverage 失败输出安全 `content` 和可恢复 `assistant_suggestions`，不得输出用户可见“聊天生成失败，请稍后重试。”。
- [x] 2.3 保留 unsupported capability fallback，但确保它只基于 registry、tool capability、validation code 或 runtime trace 事实，不基于用户原文关键词或短句模板。
- [x] 2.4 为配置缺失、provider 不可用、HTTP / stream / NDJSON 解析失败、timeout / budget exhausted 类失败定义稳定中文用户文案，并保留错误 code 供内部诊断。
- [x] 2.5 确保 trace / response summary 能区分 `final_answer` 成功、unsupported fallback、visible output validation fallback、transport/config failure 和未分类 error event。
- [x] 2.6 确认默认 `agent-core` Response Renderer 仍保持通用脱敏错误边界；production adapter 的用户体验投影不改变 runtime 主循环语义。

## 3. visibleTrainingProposal repair 合同

- [x] 3.1 检查 `visibleTrainingProposal` validator 对 `payload.kind = "routine" | "plan"` 的 section 覆盖失败诊断，确保包含稳定 code、失败 path、`payloadKind`、当前输出覆盖 section 和缺失 section。
- [x] 3.2 确保正文中的热身、拉伸或处方建议不能替代 `visibleTrainingProposal.exerciseItems[]` 中可校验的 `warmup` / `stretch` 动作事实。
- [x] 3.3 补强 repair observation / compressed tool result / model-visible feedback，使模型能看到当前 run 可见事实覆盖哪些 section、缺少哪些 section，以及可恢复方向：继续获取缺失 section、输出当前事实可支撑结构、澄清或安全失败收口。
- [x] 3.4 如需修改 prompt、tool manifest、schema description、examples、observations 或 compressed tool results，使用 Agent prompt contract governance 检查模型实际可见输入，并保持描述性自然语言为中文、技术标识为英文。
- [x] 3.5 确认 `visibleTrainingProposal` validator 不新增具体业务 `toolName` 白名单，不根据用户原文或正文自然语言自动补 exerciseId、section、prescription 或 schedule。

## 4. 前端错误消费边界

- [x] 4.1 更新 chat client 的 error mapping，使 production chat 用户可见区域不再把未知 Agent terminal failure 映射为“聊天生成失败，请稍后重试。”。
- [x] 4.2 确保前端仍不原样展示 `event.error.message`、HTTP body、provider 原文、validator details、stack 或内部英文错误。
- [x] 4.3 确保收到后端 fallback `content` / `assistant_suggestions` / `done` 时，当前 assistant message 正常落地，loading / reasoning / activity 状态正确清理。
- [x] 4.4 保留 abort、timeout、HTTP failure、NDJSON parse failure 的安全兜底文案，并确保这些文案给出可恢复方向。

## 5. 测试与验证

- [x] 5.1 新增或更新 chat service 测试，覆盖 `repair_limit_exceeded` + `section_coverage_missing` 被投影为安全 `content` / `assistant_suggestions` / `done`，并且 response summary 保留原始 error code。
- [x] 5.2 新增或更新 chat service 测试，覆盖 unsupported capability、service unavailable、timeout / budget exhausted 和未分类 error event 的分类投影。
- [x] 5.3 新增或更新 `visibleTrainingProposal` validator 测试，覆盖 `routine` 只含 `training`、正文包含热身/拉伸但结构缺 section、以及合法 `warmup` / `training` / `stretch` 结构通过。
- [x] 5.4 新增或更新 prompt / observation / repair feedback 测试，证明 section coverage failure 的模型可见输入包含稳定 code、缺失 section、当前可见 section 覆盖和恢复方向，且不指定固定 tool 调用顺序。
- [x] 5.5 新增或更新 client API / controller 测试，覆盖 error event、fallback content、stream parse failure、abort / timeout 和 loading 状态清理。
- [x] 5.6 运行 `npm test -- tests/chat-service.test.ts tests/client-api.test.ts`。
- [x] 5.7 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`，确认没有新增服务端关键词、正则、同义词表、自然语言模板路由、旧 Agent 链路或具体业务 `toolName` 语义分支。
- [x] 5.8 按实际触碰范围运行 `npm test` 的相关 validator / prompt / contract 测试；如果修改 manifest 或 schema summary，运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts` 和 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [x] 5.9 运行 `npm run typecheck`。
- [x] 5.10 运行 `openspec validate stabilize-agent-terminal-failure-fallback --strict`。

## 6. 文档与收口

- [x] 6.1 若实现改变生产聊天失败收口、Agent repair 合同或核心链路投影，按项目规则在 `docs/方案变更历史/` 新增上海时间记录，并在 `docs/项目演变历程.md` 追加简要演变记录。
- [x] 6.2 检查最终 diff，确认未混入无关脏文件、生成物、其他 OpenSpec change、`next-env.d.ts` 或用户已有改动。
- [x] 6.3 总结实现时说明：改了什么、为什么优于只改前端文案、如何验证、剩余风险，以及是否仍存在无法归类的 terminal failure。
- [x] 6.4 按项目规则使用中文 commit message 提交本 change 的实现改动。
