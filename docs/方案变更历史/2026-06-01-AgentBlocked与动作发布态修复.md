# 2026-06-01 18:37:13 CST Agent blocked 与动作发布态修复

## 背景

真实日志中，用户请求“推荐几个适合新手的臀腿动作，我只有弹力带，不想做跳跃”时，`searchExercises` 连续返回空候选，Agent 最终又输出了缺少 `blockReason` 的 `blocked` 结果，导致系统把可恢复阻塞误判为 `model_output_invalid`，用户只能看到通用失败文案。

## 原方案的问题

- 动作种子数据默认 `isPublished = false`，而 Agent 面向用户检索时使用 `visibility: "published"`，导致动作库已有弹力带动作也无法被召回。
- Agent final result prompt 只给了 `answered` 示例，缺少 `blocked` 示例，模型容易把阻塞说明写进 `replyContext.reply`。
- 解析层没有对旧形态 `blocked.replyContext.reply` 做契约级迁移，候选为空这类可解释停止会退化为模型输出非法失败。

## 调整思路

- 数据层恢复发布态检索能力：静态动作数据和 seed 默认值统一发布。
- 契约层明确 `blocked` 的唯一阻塞说明字段是 `blockReason`。
- 解析层只做字段位置规范化，不基于用户原文改写语义，也不改变工具结果引用。

## 关键改动

- 将 `data/exercises.zh.json` 中 873 条动作全部设为 `isPublished: true`。
- 将 `scripts/seed-exercises.mjs` 的默认 `isPublished` 改为 `true`。
- 更新 Agent final result prompt 和 `/api/chat` 模型格式提示，增加 `blocked` 示例。
- 在 Agent tool decision 解析边界把旧形态 `blocked.replyContext.reply` 规范化为 `blockReason`。
- 增加动作检索和 Agent blocked 投影测试。

## 结果

本地静态动作数据校验结果为：873 条动作，873 条发布，0 条未发布。发布态弹力带新手下肢动作可以被 `searchExercises` 召回；候选为空后的旧形态 `blocked` 不再直接退化为 `model_output_invalid`。
