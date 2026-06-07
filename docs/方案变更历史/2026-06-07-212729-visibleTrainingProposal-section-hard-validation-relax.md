# 2026-06-07 21:27:29 CST visibleTrainingProposal support section 校验边界调整

## 背景

此前 `visibleTrainingProposal` 把“训练编排应优先包含热身、主训练、拉伸”同时写进模型可见合同和服务端 hard validation。模型如果只输出了主训练动作，即使 `exerciseId`、`section`、`prescription` 和计划结构都合法，也会被 terminal output validator 以 `section_coverage_missing` 拒绝，最终用户看到失败兜底而不是可展示训练卡片。

## 调整思路

本次把“完整度偏好”和“确定性安全边界”拆开：

- 模型可见合同继续正向引导 `routine` / `plan` 优先组织为 `warmup`、`training`、`stretch`。
- 服务端只把缺少 `training` 主训练事实作为 `routine` / `plan` 的 section hard fail。
- `warmup` / `stretch` 不由服务端自动补动作，也不通过正文解析生成结构化事实。
- 数据库动作事实、发布态、权限、`allowedSections`、`prescription`、`schedule` 仍保持 hard validation。

## 关键改动

- `visibleTrainingProposal` payload schema 改为要求 `routine` / `plan` 必须包含 `training` 动作项，不再要求 support section 全部存在。
- terminal output validator 只在缺少 `training` 时返回 `section_coverage_missing`。
- `outputContracts` 继续表达完整三段式的生成偏好，但不告诉模型可以省略热身或拉伸。
- 聊天富卡片 adapter 和共享 draft schema 支持只展示实际存在的 section，避免服务端放过后前端卡片消失。

## 验证

- `tests/visible-training-proposal-validator.test.ts` 覆盖 training-only routine 通过、缺 training routine 失败。
- `tests/visible-training-proposal-cards.test.ts` 覆盖 training-only routine / plan 能渲染且不伪造 support section。
- `tests/chat-service.test.ts` 覆盖 production 聊天链路中 training-only routine 输出 `visible_output`，缺 training 仍走安全失败收口。

## 边界

本次没有新增服务端关键词、正则、同义词、短句模板或具体 `toolName` 语义分支；也没有修改 `/api/chat` 主链路、Planner、Executor、Policy Guard 或 Response Renderer 主流程。
