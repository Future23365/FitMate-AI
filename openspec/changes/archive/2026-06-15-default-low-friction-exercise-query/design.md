## Context

最新 trace 显示，宽泛核心减脂动作推荐先以 `muscles = ["abdominals"]` 和 `suitabilities = ["training"]` 查询，返回候选混有绳索、健身房固定设施、药球和搭档辅助动作；随后模型用 `executionProfile = "no_equipment"` 补查同一目标。当前 tool 已经有高层执行场景封装，`no_equipment` 不是旧 `equipment` 字符串，而是“无外部器械，允许地面或瑜伽垫”的稳定查询口径。

现有 prompt 允许模型在缺少器械、场地、时长、经验等偏好时使用保守默认，但没有说明宽泛动作推荐的执行条件默认是什么。模型因此可能先避免假设，再从混杂候选中自行补一个低门槛条件，造成重复查询。

## Goals / Non-Goals

**Goals:**

- 让宽泛动作推荐、动作筛选和结构化训练候选在缺少器械 / 场地偏好时，第一次查询就使用 `executionProfile = "no_equipment"`。
- 明确该默认只服务当前请求，不写成用户长期偏好。
- 明确 `no_equipment` 允许地面或瑜伽垫，`home_support` 只在用户明确可用椅子、墙面、台阶等常见居家支撑时使用。
- 保持模型自主 tool calling，不新增服务端自然语言判断或 provider tool call 改写。

**Non-Goals:**

- 不改变 `executionProfile` 到数据库 taxonomy 的映射。
- 不改变 `searchExerciseResources` 的 handler、repository、候选排序、候选数量或 model-visible summary 投影。
- 不把当前失败用户原话写入生产 prompt。
- 不修改 LangChain runtime 的连续 tool call limit、model call budget 或 tool availability middleware。

## Decisions

### 1. 默认口径落在 Planner policy，而不是 handler

低门槛无器械默认属于模型规划策略：模型需要在构造 `searchExerciseResources` input 时选择是否填写 `executionProfile`。因此主规则放在默认 prompt 的保守默认附近，表达为稳定语义类别：

- 宽泛动作推荐
- 动作筛选
- 结构化训练候选

这些场景如果缺少器械、场地或可用设施偏好，就默认按低门槛无器械条件继续。该规则不引用具体用户短句，也不要求服务端从自然语言自动补字段。

### 2. 字段含义和 input source 落在 tool description / schema description

`executionProfile` 的枚举解释属于 `searchExerciseResources` 的模型可见 tool 合同。tool description / schema description 需要表达：

- `no_equipment` 是缺少器械 / 场地偏好时的默认低门槛无器械口径。
- `no_equipment` 允许地面或瑜伽垫。
- `home_support` 只在用户明确可用椅子、墙面、台阶等居家支撑时使用。

这样通用 prompt 不承担完整字段文档，字段说明仍由业务 tool 自身维护。

### 3. 保留默认说明，不生成长期用户偏好

默认口径只用于当前请求的查询和正文说明。模型不能把它写入用户长期偏好，也不能在后续请求中把未确认的器械 / 场地条件当成已知事实。最终正文应说明默认按无器械、地面 / 瑜伽垫条件推荐。

### 4. 回归测试覆盖语义类别，不覆盖单句 phrasing

测试应覆盖“宽泛动作推荐缺少执行条件时，第一次查询使用 no_equipment”的模型可见合同和 tool catalog 文本，不把具体 trace 原句反向写成生产触发规则。可以使用多个等价表达作为测试样例，但生产规则仍按语义类别描述。

## Risks / Trade-offs

- 默认 `no_equipment` 会排除椅子、墙面、台阶类动作。该行为符合“低门槛无器械 + 地面/瑜伽垫”的产品口径；如果未来产品想默认包含居家支撑，应另行改为 `home_support` 并更新合同。
- 模型仍可能在用户明确可用设施时选择其他 `executionProfile`。这是正确行为，因为默认只在缺少执行条件偏好时生效。
- 只改 prompt / tool description 不能保证所有 provider 都 100% 遵循，但这是当前架构中符合“模型能力优先、服务端只管契约”的修复层级。

## Validation

- `openspec validate default-low-friction-exercise-query --strict`
- `npm test -- tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-tools/search-exercise-resources.test.ts`
- `npm run typecheck`
- diff 检查确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` runtime 分支。
