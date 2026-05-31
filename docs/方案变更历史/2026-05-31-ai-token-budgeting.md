# 2026-05-31 AI Token 预算编排

## 原方案为什么不合适

聊天链路逐步接入意图解析、动作候选、训练计划生成、summary 更新和 AI Trace 后，单轮请求可能触发多次 LLM 调用。原实现虽然已经用 `conversationSummary + latestUserMessage` 限制历史上下文，但每个服务各自决定 prompt 和候选 payload，缺少统一的预算视角：

- Trace 只能看到模型请求和总 token，难以判断成本来自意图解析、最终回复、summary 更新还是下游动作/计划生成。
- 候选动作 payload 仍混有部分展示和内部筛选字段，模型不需要完整动作对象也能完成选择。
- summary 更新每轮默认发起模型调用，确认、取消、换一批、查看详情等短操作没有稳定跳过路径。
- Prompt 以大段固定文本为主，无法在 trace 中说明本轮实际启用了哪些规则模块。

## 调整思路

新增服务端 `token-budget` 决策层，把“哪些 AI 阶段执行、哪些阶段跳过、使用哪些 prompt module、候选动作裁剪成什么字段、summary 是否更新”收敛成一个可记录的结构化对象。决策层只做纯判断和摘要，不直接访问数据库、不调用模型，避免把预算逻辑和业务执行耦合。

## 关键改动

- 新增 `lib/server/ai/token-budget.ts`，定义 AI 阶段、prompt module、模型可见上下文摘要、候选裁剪摘要和预算决策对象。
- `prompt-config.ts` 增加 `aiPromptModuleRegistry` 和 `buildPromptFromModules()`，聊天、动作推荐和训练计划请求按任务组合 prompt modules。
- `/api/chat` 在意图解析后生成预算决策，最终回复模型请求写入阶段、prompt modules、候选裁剪信息；确定性回复和 summary 更新跳过也写入 trace。
- 动作推荐和训练计划生成改用模型可见字段白名单：`exerciseId`、名称、目标肌群、器械或场地、难度、分类、匹配原因、必要限制和候选来源。
- `conversation-summary-service` 增加短操作 summary 更新跳过路径，失败兜底仍保留，不阻断用户可见回复。
- `/dev/ai-traces` 增加 `Token 预算` 阶段，展示跳过阶段、prompt module 数量和候选动作裁剪摘要。

## 怎么做的

预算决策由各入口在已有服务端事实基础上生成：

- `/api/chat` 使用解析后的 `ChatIntent`、候选动作状态、assistant action 和 summary 跳过判断生成决策。
- `/api/ai/exercise-recommendations` 在候选筛选后记录裁剪前后数量，并把完整候选保留在服务端校验与卡片补全链路。
- `/api/ai/workout-plan` 先记录意图抽取预算，再在候选生成后更新草稿生成预算；如果进入修复流程，再单独记录修复阶段预算。

当前没有新增测试 fixture 或真实 LLM 手测预算验收；验证以类型检查、自动化测试和构建为主。
