# 基础 LLM 首页聊天黑盒测试说明

生成时间：2026-06-05 17:46:05 +0800

## 目的

基础 LLM 首页聊天黑盒测试用于手动验证首页聊天入口的真实模型链路。它从根目录 `llm基础测试.md` 读取三轮流程用例，模拟用户连续输入，并只验收用户最终可见结果：assistant 文本、可见训练输出类型、建议回复、确认请求和安全错误文案。

当前基础套件是“链路可用性冒烟测试”：只要每轮请求正常结束、收到 `done`，并且最终存在任一用户可见回答面，就算通过。用户可见回答面包括大模型正文、大模型失败解释、服务端确定性兜底正文、安全错误文案、可见训练输出、建议提问或确认请求。`llm基础测试.md` 中的期望列仍会进入报告，供人工复核语义质量，但不再由基础命令自动判失败。

该测试会真实调用模型并消费 token。默认 `npm run test` 不会运行它，也不会因为任何模型相关环境变量而触发真实模型调用。

## 默认自动化边界

```bash
npm run test
```

默认命令只运行普通 Vitest 自动化测试，include 范围是 `tests/**/*.test.ts`。它用于日常单测、类型边界、服务边界和回归扫描，不允许消费真实模型 token。

真实模型测试必须使用下面的手动命令。

## 手动运行命令

运行全部基础 flow：

```bash
npm run test:llm:basic
```

只运行单个 flow：

```bash
npm run test:llm:basic -- --flow F01
```

只运行多个 flow：

```bash
npm run test:llm:basic -- --flow F01,F02
```

写入自定义报告路径：

```bash
npm run test:llm:basic -- --report docs/manual-llm-basic-blackbox-latest-report.md
```

查看参数说明：

```bash
npm run test:llm:basic -- --help
```

## 参数

| 参数 | 说明 |
|---|---|
| `--flow F01` | 只运行指定 flow id。可重复使用，也可用逗号传多个 id。 |
| `--report <path>` | 指定 Markdown 报告输出路径。 |
| `--help` / `-h` | 输出命令说明，不触发真实模型调用。 |

## 环境变量

| 环境变量 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | 真实模型回复需要。缺少时不会静默使用 mock，生产 `/api/chat` 会返回安全兜底；只要兜底可见且正常结束，基础冒烟仍通过。 |
| `DEEPSEEK_MODEL` | 可选。聊天模型默认使用 `deepseek-v4-flash`。 |
| `DEEPSEEK_API_URL` | 可选。DeepSeek endpoint 默认使用 `https://api.deepseek.com/chat/completions`。 |
| `MANUAL_LLM_BASIC_TIMEOUT_MS` | 可选。手动套件整体 timeout，默认 20 分钟。 |

本地运行还需要满足首页聊天真实链路依赖：`DATABASE_URL` 可连接、Prisma migration 已执行、基础动作数据已 seed、本地匿名 auth 能创建用户。`DEEPSEEK_API_KEY` 缺失或模型不可用时，如果生产 `/api/chat` 返回用户可见的安全兜底并正常结束，该轮仍按基础冒烟口径通过；真实模型配置问题会体现在报告的响应来源和安全错误列中。

## 报告

默认报告路径：

```bash
docs/manual-llm-basic-blackbox-latest-report.md
```

报告包含：

- 运行时间、模型和基础验收口径。
- 完整 flow/turn 数和本次实际执行范围。
- 预计 token 消耗、聊天 token 汇总和 token 来源诊断。
- 每轮用户输入、文档期望、assistant 用户可见回复摘要、可见输出类型、建议回复、确认请求和验证状态。
- 失败原因、`conversationId`、`responseMessageId`、hydration/save 诊断和 token 诊断摘要。
- 如果响应只生成了安全兜底文案或建议提问，报告会保留这些用户可见输出，供人工判断是否需要继续修语义质量。

报告不会保存完整 prompt、完整动作候选池、大段 raw provider response 或内部 tool payload。

## 通过判定

基础命令不再调用第二个 judge 模型做语义评分。自动通过条件如下：

- 响应必须能被生产 NDJSON parser 正常解析。
- 响应必须包含 `done`。
- 会话保存必须成功，以便后续轮次能走真实 hydration。
- 最终必须存在至少一个用户可见回答面：assistant 文本、可见训练输出、建议提问、确认请求或安全兜底文案。

如果请求异常、NDJSON 无法解析、缺少 `done`、会话保存失败，或响应结束后完全没有用户可见输出，则该轮失败。第 1 轮失败时，同一 flow 后续轮次继续跳过。

## 用例来源

基础套件唯一用例来源是：

```bash
llm基础测试.md
```

runner 会解析 `## 三轮流程用例` 下的 Markdown 表格，并在真实模型调用前校验必需列、重复 id 和空字段。修改用例时优先改该文档，再运行普通单测确认解析和报告合同没有破坏。

## 失败排查

常见失败类型：

- 缺少 `DEEPSEEK_API_KEY`：不会使用 mock；若生产 `/api/chat` 正常返回安全兜底，基础冒烟通过，但报告会显示响应来源和安全错误文案。
- 本地匿名 auth 或 Prisma 报错：先检查 `DATABASE_URL`、migration 和本地数据库。
- 首轮失败导致后续轮次 skipped：先修首轮基础能力，不要把后续 skipped 当成独立模型失败。
- 有安全兜底但语义不符合预期：基础命令仍会通过，查看报告中的用户可见输出摘要、可见输出类型、响应来源和文档期望后再决定是否升级到 detailed suite 或专项回归。
- 成本明显偏高：先看报告中的实际执行 turn 数和聊天 token 汇总。基础套件默认不跑 detailed 场景；如需定位单个问题，优先使用 `--flow <id>`。

该套件是手动成本测试。Codex 完成普通代码任务后的自动化验证应使用 `npm run test`、`npm run typecheck`、`npm run lint` 或相关普通测试，不应运行 `npm run test:llm:basic`，除非你明确要求真实模型验证。
