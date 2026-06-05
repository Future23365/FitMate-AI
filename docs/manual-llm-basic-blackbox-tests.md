# 基础 LLM 首页聊天黑盒测试说明

生成时间：2026-06-05 17:46:05 +0800

## 目的

基础 LLM 首页聊天黑盒测试用于手动验证首页聊天入口的真实模型链路。它从根目录 `llm基础测试.md` 读取三轮流程用例，模拟用户连续输入，并只验收用户最终可见结果：assistant 文本、可见训练输出类型、建议回复、确认请求和安全错误文案。

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
| `DEEPSEEK_API_KEY` | 必需。缺少时不会静默使用 mock，会生成配置失败摘要。 |
| `DEEPSEEK_MODEL` | 可选。聊天模型默认使用 `deepseek-chat`。 |
| `DEEPSEEK_API_URL` | 可选。DeepSeek endpoint 默认使用 `https://api.deepseek.com/chat/completions`。 |
| `DEEPSEEK_JUDGE_MODEL` | 可选。Judge 模型优先使用该值，其次使用 `DEEPSEEK_MODEL`，最后默认 `deepseek-chat`。 |
| `MANUAL_LLM_BASIC_TIMEOUT_MS` | 可选。手动套件整体 timeout，默认 20 分钟。 |

本地运行还需要满足首页聊天真实链路依赖：`DATABASE_URL` 可连接、Prisma migration 已执行、基础动作数据已 seed、本地匿名 auth 能创建用户。

## 报告

默认报告路径：

```bash
docs/manual-llm-basic-blackbox-latest-report.md
```

报告包含：

- 运行时间、模型、Judge 模型。
- 完整 flow/turn 数和本次实际执行范围。
- 预计 token 消耗、聊天 token 汇总和 Judge token 汇总。
- 每轮用户输入、文档期望、assistant 用户可见回复摘要、可见输出类型、建议回复、确认请求和验证状态。
- 失败原因、`conversationId`、`responseMessageId`、hydration/save 诊断和 token 诊断摘要。

报告不会保存完整 prompt、完整动作候选池、大段 raw provider response 或内部 tool payload。

## 用例来源

基础套件唯一用例来源是：

```bash
llm基础测试.md
```

runner 会解析 `## 三轮流程用例` 下的 Markdown 表格，并在真实模型调用前校验必需列、重复 id 和空字段。修改用例时优先改该文档，再运行普通单测确认解析和报告合同没有破坏。

## 失败排查

常见失败类型：

- 缺少 `DEEPSEEK_API_KEY`：配置失败，不会使用 mock。
- 本地匿名 auth 或 Prisma 报错：先检查 `DATABASE_URL`、migration 和本地数据库。
- 首轮失败导致后续轮次 skipped：先修首轮基础能力，不要把后续 skipped 当成独立模型失败。
- Judge 失败：查看报告中的用户可见输出摘要、可见输出类型和 missing expectations。

该套件是手动成本测试。Codex 完成普通代码任务后的自动化验证应使用 `npm run test`、`npm run typecheck`、`npm run lint` 或相关普通测试，不应运行 `npm run test:llm:basic`，除非你明确要求真实模型验证。
