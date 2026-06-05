# 基础 LLM 首页聊天黑盒测试报告

生成时间：2026-06-05T00:08:24+08:00
状态：failed
用例来源：/Users/liusongbai/.codex/worktrees/22f5/AITest/llm基础测试.md
报告路径：/Users/liusongbai/.codex/worktrees/22f5/AITest/docs/manual-llm-basic-blackbox-latest-report.md

## 运行摘要

- 模型：deepseek-chat
- Judge 模型：deepseek-chat
- 筛选条件：F01
- 完整 flow 数：19
- 完整 turn 数：57
- 实际执行 flow 数：0
- 实际执行 turn 数：0
- 通过 turn 数：0
- 失败 turn 数：0
- 跳过 turn 数：0
- 预计 token 消耗：约 8462
- 聊天 token 汇总：未获取
- Judge token 汇总：未获取
- 开始时间：2026-06-05T00:08:24+08:00
- 结束时间：2026-06-05T00:08:24+08:00

## Flow 结果

| Flow | 轮次 | 状态 | 用户输入 | 文档期望 | 最终 assistant 回复摘要 | 可见输出类型 | Judge / 失败原因 |
|---|---:|---|---|---|---|---|---|
| (suite) | 0 | error |  |  | (无文本输出) | (无) | 本地匿名登录失败： Invalid `prisma.user.create()` invocation in /Users/liusongbai/.codex/worktrees/22f5/AITest/lib/server/auth/local-anonymous-auth.ts:180:34    177 const prisma = getPrismaClient();   178 const providerAccountId = randomUUID();   179 const signedToken = signLocalAnonymousToken(providerAccountId); → 180 const user = await prisma.user.create( |

## 用例规模

| Flow | 目标 | Turn 数 |
|---|---|---:|
| F01 | 纯动作推荐到刷新推荐 | 3 |
