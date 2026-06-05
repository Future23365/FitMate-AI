## 1. 现状确认与范围锁定

- [x] 1.1 读取根目录 `llm基础测试.md`，确认“三轮流程用例”表的列名、flow id、三轮输入和三轮期望是本次基础套件唯一用例来源。
- [x] 1.2 检查 `app/api/chat/route.ts`、`features/chat/api/chat-client.ts`、`lib/server/chat/agent-text-chat-service.ts`，确认 runner 应复用的请求体字段、NDJSON 事件类型和最终用户可见输出边界。
- [x] 1.3 检查 `vitest.config.ts`、`scripts/run-tests.mjs`、`package.json`，确认默认 `npm test` 只运行 `tests/**/*.test.ts`，本次手动 LLM 文件不得放入默认 include 范围。
- [x] 1.4 运行 `git status --short`，识别已有无关改动；实现和提交不得混入 `next-env.d.ts` 或其他无关文件。
- [x] 1.5 明确本 change 不修改 `/api/chat` 业务行为、Agent planner、tool manifest、response renderer、训练生成规则、数据库模型或权限模型。

## 2. 基础用例解析与 fixture 预检

- [x] 2.1 在 `manual-tests/llm` 或等价手动测试目录新增基础黑盒 fixture/parser 模块，解析 `llm基础测试.md` 的 Markdown 表格。
- [x] 2.2 将每一行转换为 `{ id, goal, turns: [{ index, userInput, expectation }] }` 结构，并保持 flow 顺序与文档一致。
- [x] 2.3 实现 fixture preflight：校验必需列、重复 id、空输入、空期望、非三轮 flow、解析 flow 数和 turn 数。
- [x] 2.4 在 preflight 失败时阻止真实模型调用，并输出具体文档错误。
- [x] 2.5 增加不调用真实模型的 fixture/parser 单元测试，覆盖正常解析、缺列、重复 id、空字段和报告规模统计。

## 3. 请求层黑盒 runner

- [x] 3.1 新增基础 LLM 黑盒 runner，按 flow 从新 `conversationId` 开始，并在同一 flow 内串行执行第 1、2、3 轮。
- [x] 3.2 runner 每轮使用与首页聊天客户端等价的 `latestUserMessage`、`conversationId`、conversation summary/context 输入，不增加测试专用绕过字段。
- [x] 3.3 runner 消费 `/api/chat` 等价 NDJSON 响应，等待 `done` 或等价完成边界后再进入判定。
- [x] 3.4 runner 只从 `content` 和 `visible_output` 事件构造最终 assistant 用户可见输出；忽略 `agent_progress`、`tool_result`、trace、planner action 和内部 runtime 事件。
- [x] 3.5 第 1 轮基础输出失败时跳过同 flow 后续轮次，并在报告中记录跳过原因。
- [x] 3.6 支持至少按 flow id 运行子集，降低真实模型排查成本；未知 flow id 必须失败并输出可用 id。

## 4. 最终输出语义 judge

- [x] 4.1 新增结构化 judge schema，包含 `passed`、`status`、`reason`、`matchedExpectations`、`missingExpectations`、`visibleOutputKinds` 等字段。
- [x] 4.2 实现 judge prompt / model input，只传入 flow id、流程目标、轮次、该轮用户输入、该轮文档期望、最终 assistant 文本和最终用户可见训练输出摘要。
- [x] 4.3 确保 judge input 不包含 prompt、完整 tool payload、trace、Agent loop、raw provider response、服务端内部错误栈或 token diagnostics。
- [x] 4.4 judge 输出必须通过 Zod 或 JSON Schema 校验；非法 judge 输出应记录为 judge 失败，不能当作通过。
- [x] 4.5 judge 规则必须按用户可见语义判断，不要求文档未声明的动作 ID、组数、精确时长、计划细节或数据库内部字段完全匹配。
- [x] 4.6 增加 judge input 构造和 schema 校验测试，确认中间事件不会进入判定输入。

## 5. 手动命令、报告与隔离

- [x] 5.1 在 `package.json` 新增专用手动命令，例如 `test:llm:basic`，运行基础 LLM 黑盒套件；默认 `npm test` 不调用该命令。
- [x] 5.2 命令启动时输出模型、judge 模型、flow 数、turn 数、运行筛选条件、报告路径和 token 粗略预估。
- [x] 5.3 缺少真实模型或 judge 配置时，命令必须输出缺失配置名称，不得回退到 mock、旧快照、固定答案或非真实模型结果。
- [x] 5.4 生成 Markdown 报告，记录上海时区生成时间、运行摘要、token 汇总、每轮用户输入、文档期望、最终 assistant 回复摘要、最终可见输出类型、judge 结果和失败原因。
- [x] 5.5 报告不得保存完整 prompt、完整 raw provider response、完整 tool input/output、完整动作候选池或大段 trace payload。
- [x] 5.6 任一已执行 turn 判定失败时，专用命令必须以非零退出码结束，并在控制台指向失败 flow、轮次和报告路径。
- [x] 5.7 增加默认测试隔离检查，确认 `manual-tests/llm` 或等价目录不会被 `npm test` 自动包含。

## 6. 架构边界与验证

- [x] 6.1 增加或更新架构扫描，确认 `/api/chat`、Agent core、tool handler、response renderer 未新增自然语言关键词、正则、同义词表、固定短句分流或测试专用业务 fallback。
- [x] 6.2 运行 `openspec validate add-llm-basic-chat-blackbox-tests --strict`。
- [x] 6.3 运行 `npm test -- tests/<新增或更新的非真实模型测试文件>.test.ts`，覆盖 parser、judge input、报告和隔离检查。
- [x] 6.4 运行 `npm run typecheck`。
- [x] 6.5 在具备真实模型配置时，手动运行 `npm run test:llm:basic -- --flow F01` 或等价单 flow 命令，验证请求层 runner、judge 和报告链路可用；如果未运行，说明缺少的环境条件。
- [x] 6.6 检查最终 diff，确认没有混入无关文件、没有启动 dev server、没有浏览器验证产物、没有把手动 LLM 测试纳入默认自动化测试。
- [x] 6.7 完成任务后提交本次变更，提交消息使用中文。

## 7. 黑盒边界收紧补充

- [ ] 7.1 收紧基础 runner 请求体：每轮只发送首页聊天客户端公开字段，移除完整历史 `messages`，并增加单元测试证明请求体不包含测试专用绕过字段。
- [ ] 7.2 补齐多轮保存/hydration：每轮成功后按首页保存边界保存会话和最终可见输出，后续轮次通过同一 `conversationId + current user` 触发服务端 hydration；报告只记录保存/hydration 诊断摘要，不把诊断送入 judge。
- [ ] 7.3 复用生产 NDJSON parser 或抽取共享解析模块：未知事件、非法事件字段和生产页面会失败的格式错误必须让 runner 失败，不能被手写宽松 parser 静默忽略。
- [ ] 7.4 扩展 `visibleUserOutput` judge 投影：纳入最终 assistant 正文、`visible_output`、`assistant_suggestions`、`confirmation_request` 和用户安全错误文案；继续排除 `agent_progress`、`tool_result`、trace、planner action、raw provider response、token diagnostics 和内部错误栈。
- [ ] 7.5 将 token usage 降级为可选诊断：读取不到 token 或开发态 trace store 不可用时不影响 flow 判定；报告必须标明 token 来源和缺失状态。
- [ ] 7.6 放松非真实模型单测中的 fixture 硬编码：验证文档结构、ID 唯一、三轮完整和非空字段，不再把当前 flow 总数、完整固定 id 列表或当前顺序当作长期合同。
- [ ] 7.7 更新报告生成：展示建议回复、确认请求、安全错误、保存/hydration 诊断和 token 来源摘要，同时继续避免保存完整 prompt、raw provider response、tool payload、候选池或大段 trace。
- [ ] 7.8 补充或更新自动化测试，覆盖请求体不含 `messages`、parser 复用、judge input 排除内部字段、token 缺失不失败、fixture parser 不锁死当前用例数量。
- [ ] 7.9 运行 `npm run test -- tests/manual-llm-basic-blackbox.test.ts` 和新增相关非真实模型测试。
- [ ] 7.10 运行 `openspec validate add-llm-basic-chat-blackbox-tests --strict`。
- [ ] 7.11 在真实模型配置可用且用户确认 token 成本后，运行 `npm run test:llm:basic -- --flow F01` 验证单 flow 链路；若未运行，报告缺失环境或未确认原因。
