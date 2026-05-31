# 手动 LLM 首页聊天黑盒流程测试报告

生成时间：2026-05-31T16:03:29.413Z
模型：deepseek-v4-flash
套件：详细
运行命令：npm run test --detail
runner 类型：api_route
真实/跳过状态：skipped

## 汇总

- 流程用例数：53
- 轮次数：159
- 通过：0
- 失败：0
- 跳过：159
- 需复核：0
- 预计输入 token：1956696
- 预计输出 token：200470
- 预计总 token：2157166
- 估算来源：recent_real_report
- 估算口径：基于 manual-llm-blackbox-flow-latest-report.md 的真实 token 均值校准：27 轮、total_tokens=366311。
- prompt_tokens：0
- completion_tokens：0
- total_tokens：0
- token 偏差摘要：本次因缺少 DEEPSEEK_API_KEY 跳过真实模型，没有真实 token usage。

## Preflight

- 状态：skipped
- 模型 key：不可用
- 数据库：未检查
- artifact 表：未检查
- seed 数据：未检查
- 原因：缺少 DEEPSEEK_API_KEY，真实模型黑盒流程未运行。

## 最终状态枚举

- `passed`：卡片类型断言和语义断言都通过。
- `failed`：P0/P1/P2 自动断言失败。
- `skipped`：缺少 key、preflight 未满足或前序轮次失败导致未执行。
- `needs_review`：仅 P3 内容质量或自动断言无法稳定判断，需要人工复核，不计为通过。

## 流程轮次结果

- 跳过：缺少 DEEPSEEK_API_KEY，真实模型黑盒流程未运行；命令没有使用 mock、旧快照或非真实模型结果。
