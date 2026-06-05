## 背景

这次问题暴露的不是单个字段名，而是 repair feedback 抽象边界不清：runtime 在拿到 schema / validator 错误之后，又额外补了“应该怎么修”的自然语言理解。比如字段缺失和未知字段本来是确定性事实，但如果 runtime 再拼出“这个 action 必须用某字段承载某语义”，就等于服务端在解释语义槽，而这正是模型和 prompt / manifest 应该负责的层。

因此本 change 不把 repair feedback 设计成业务知识库，也不把它设计成每个 tool 的恢复策略表。它只是一层通用投影器：把 validator 已经知道的错误事实，以稳定、脱敏、字段级结构交给模型。

## 设计原则

1. **schema 是结构真相来源**  
   字段是否存在、类型是什么、枚举值有哪些、union variant 如何选择，都来自当前注册 schema / manifest，不来自 runtime 手写 repair 文案。

2. **prompt / manifest 承担语义解释**  
   `content` 为什么是用户可见文本、`usedRefs` 如何表达 grounding、某个 tool input 的字段语义是什么，应该出现在默认 prompt、tool manifest、schema description、examples 中。repair feedback 只告诉模型“哪里和合同不一致”。

3. **runtime 只表达确定性错误事实**  
   runtime 可以表达 `path = question` 是未知字段、`path = content` 缺失、`type` 不是合法 discriminator、`section` 不在数据库允许范围内；不能表达“你真正想问用户，所以要把 question 改成 content”。

4. **新增 tool 自动受益**  
   新 tool 只要有注册 schema，通用 projector 就能把输入错误投影成字段级 facts。不得因为新增 tool 就必须修改 repair feedback 分支。

5. **业务 validator 只返回 domain facts**  
   业务校验可以给出数据库或资源事实，例如 `allowedSections`、`actualExerciseId`、`resourceRef`、`path`。它不能生成固定下一步 tool 调用、自然语言恢复方向或业务流程建议。

## 模型可见 feedback 结构

实现阶段应收敛成一个可复用的模型可见 envelope。字段命名可在实现时按现有类型系统调整，但语义必须保持稳定：

```json
{
  "type": "invalid_action",
  "code": "schema_validation_failed",
  "target": {
    "kind": "AgentAction | ToolInput | VisibleOutputEnvelope | DomainValidation",
    "schemaId": "AgentAction",
    "toolName": "optionalToolName",
    "outputType": "optionalOutputType",
    "variant": "optionalDiscriminatorValue"
  },
  "discriminator": {
    "path": "type",
    "value": "ask_user",
    "allowedValues": ["tool_call", "final_answer", "ask_user"]
  },
  "errors": [
    {
      "code": "required_field_missing",
      "path": "content",
      "expected": { "type": "string" },
      "actual": { "kind": "missing" }
    },
    {
      "code": "unknown_field",
      "path": "question",
      "allowedFields": ["type", "content", "usedRefs", "suggestions"]
    }
  ],
  "facts": []
}
```

### `target`

`target` 用来说明错误发生在哪个稳定合同上，而不是解释用户意图。

- `kind`: `AgentAction`、`ToolInput`、`VisibleOutputEnvelope`、`DomainValidation` 等固定类别。
- `schemaId`: 能定位到 schema 的稳定 id。
- `toolName`: 只有当错误发生在某个已注册 tool input 上时出现，作为定位，不作为 repair 分支条件。
- `outputType`: 只有当错误发生在 terminal visible output 上时出现，作为定位，不作为业务流程建议。
- `variant`: 如果 discriminator 已经能确定 variant，则记录该值；如果不能确定，则记录 union / discriminator 错误。

### `errors[]`

`errors[]` 是通用 schema issue 的规范化结果。建议至少支持：

- `required_field_missing`
- `unknown_field`
- `invalid_type`
- `invalid_enum_value`
- `invalid_literal`
- `invalid_union_variant`
- `invalid_discriminator`
- `too_small`
- `too_big`
- `invalid_format`
- `custom_schema_violation`

每个 error 尽量包含：

- `path`: 脱敏 JSON path，保留数组下标和字段名。
- `expected`: 类型、literal、枚举、结构约束或字段集合。
- `actual`: 实际值的安全摘要，例如 `{ "kind": "missing" }`、`{ "type": "string" }`、`{ "value": "bad_enum" }`。
- `allowedValues`: enum / literal / discriminator 允许值。
- `requiredFields`: 当前 object variant 必需字段。
- `allowedFields`: 当前 object variant 允许字段。

### `facts[]`

`facts[]` 只承载 validator 能确定的业务事实，不能承载自然语言修复建议。示例：

```json
{
  "code": "section_not_allowed",
  "path": "visibleOutputs[0].payload.exerciseItems[2].section",
  "actual": "warmup",
  "allowedValues": ["main"],
  "resourceRef": "exercise:abc123"
}
```

这类 fact 可以帮助模型理解“为什么当前输出不合法”，但不能直接要求模型调用某个 tool 或把某字段改成某字段。

## 与旧字段迁移的关系

字段统一 change 负责决定主字段是什么，并同步 schema、prompt、manifest、examples。这个 change 不负责把旧字段映射成新字段，也不在 runtime repair feedback 中写固定替换说明。

如果模型继续输出旧字段，通用 projector 只能表达两个事实：

- 旧字段在当前 variant 下是 `unknown_field`。
- 主字段缺失时是 `required_field_missing`。

模型为什么要把语义放进主字段，来自它已经看到的 schema / prompt / manifest，而不是 runtime 在本次错误里临时补充的业务理解。

## 与 tool input repair 的关系

tool input 的 repair 也遵循同一规则：

- projector 从 tool `inputSchema` 读取字段、类型、枚举和 object shape。
- `toolName` 只用于定位 schema，不用于写 `if toolName === ...` 的业务 repair 分支。
- 不允许针对 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或其他具体 tool 写字段组合特判。
- 如果 schema 本身无法表达足够的字段语义，应修 manifest / schema description / examples，而不是在 repair feedback 里补业务说明。

## 与 terminal visible output validation 的关系

terminal visible output 包含两层错误：

1. envelope / payload schema 错误：由通用 schema projector 输出。
2. 业务事实错误：由 domain validator 输出确定性 facts。

domain validator 可以返回数据库事实、可见资源覆盖、字段路径、允许值和实际值；但不输出：

- `repair`
- `recoveryDirections`
- `recoverableActions`
- `nextToolName`
- 固定自然语言建议

如果下一步需要重新查事实、改输出或问用户，由模型根据 facts、可见 tool manifest 和用户目标自行决策。

## Prompt 配套

默认 Agent prompt 需要有一段稳定说明，告诉模型如何读取 repair facts：

- 先看 `target` 定位合同。
- 再看 `errors[].path` 和 `errors[].code` 定位字段错误。
- 对照当前可见 schema / manifest 重新生成合法 action。
- 不要期望服务端替换字段或补齐参数。
- 如果 facts 显示资源、权限或业务事实不足，应调用当前可见的合法 tool、重新生成 terminal output、澄清用户或失败收口。

这段说明是全局规则，不是 runtime 根据某次错误动态生成的中文 repair 文案。

## 非目标

- 不设计服务端语义 intent 修复。
- 不新增关键词、正则、用户 phrasing、同义词表或字段组合 fallback。
- 不把某个具体 trace、推荐问题、tool result 或字段迁移 case 写成生产规则。
- 不改变用户可见最终错误文案。
- 不要求 runtime 自动把旧字段转换成新字段。

## 验证策略

- 单元测试验证通用 projector 能处理缺字段、未知字段、类型错误、枚举错误、discriminator 错误。
- 使用一个测试专用 fixture tool 验证新 tool schema 无需修改 repair feedback 逻辑即可获得字段级错误 facts。
- 回归测试验证具体业务 tool 名、旧字段名和用户短句不出现在 projector 分支里。
- terminal visible output validation 测试验证业务 validator 输出 facts，不输出固定恢复文案。
- prompt / model input snapshot 验证模型能看到通用 repair facts 读取规则。
- trace / replay 验证 repair loop 把 facts 传给下一轮模型，并继续执行 schema、resource、policy 和 terminal output 校验。
