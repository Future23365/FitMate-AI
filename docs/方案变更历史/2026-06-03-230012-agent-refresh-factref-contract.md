# Agent 动作刷新 factRef 合同修复

时间：2026-06-03 23:00:12 CST

## 当前真实问题

动作刷新事实桥落地后，`readRecentExerciseRecommendationFact` 的模型可见 example 使用了 `factRef: "cbf_previous_response"`。当当前 run 的 `recentExerciseRecommendationFacts` 为空时，模型仍可能照抄这个 example，把一个不存在于上下文的占位引用当作真实 factRef。

最新 trace 中，“换一批”请求没有恢复到任何 recent fact，但模型两轮都调用同一个 read/import tool 和同一个占位 factRef。第一次读取异常被 executor 归一为 `handler_error`，第二次重复调用触发 `duplicate_tool_failure`，最终前端只收到错误事件。

## 调整思路

这不是服务端需要接管“换一批”语义，而是工具合同需要更清楚地约束可引用事实来源。自然语言语义仍由模型负责；服务端只做确定性边界：引用必须来自当前 run metadata 中真实可见的 `recentExerciseRecommendationFacts`，读取失败必须结构化返回。

## 关键改动

- 收紧 `readRecentExerciseRecommendationFact` 的 description、`whenToUse`、`whenNotToUse`、input schema 描述和 example。
- 删除 `cbf_previous_response` 这类容易被照抄的占位引用，改成说明真实运行时必须从 run metadata 复制 factRef 或 messageId。
- 在 tool handler 内捕获 fact store / DB 读取异常，归一为 `status: "failed"` 和稳定 code，而不是让 executor 退化成 `handler_error`。
- 增加 tool-level、manifest 和 chat service 回归测试，覆盖 store 异常、manifest 占位引用和空 recent fact 下的模型错误调用。

## 怎么做的

实现保持 `/api/chat`、Agent runtime、PlannerPort、Executor、Policy Guard 和 Response Renderer 不变。测试使用 `ReplayPlanner` 模拟模型先错误调用无效 factRef，再由模型自己输出合法 terminal action；服务端只负责把工具失败变成可观察的结构化结果，不根据“换一批”做关键词分流。

## 结果

修复后，动作事实读取异常会成为 unsatisfied 的结构化 tool output；模型可见 manifest 不再包含 `cbf_previous_response`；空 recent fact 下的错误引用不会再直接形成 `handler_error -> duplicate_tool_failure` 的硬失败链。
