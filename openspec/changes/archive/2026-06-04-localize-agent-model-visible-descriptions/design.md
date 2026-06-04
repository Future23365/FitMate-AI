## Context

当前 `ToolRegistry.serializeForPlanner()` 会把 `ToolManifest` 中的 `description`、`whenToUse`、`whenNotToUse`、`inputJsonSchema` / `outputJsonSchema` 中的 `description` 和 `examples.description` 原样交给 Planner。通用 `AgentAction` system prompt 已经是中文，但多个 tool manifest 仍是英文，导致同一轮模型可见输入中同时存在中文通用合同和英文业务合同。

这次问题不是自然语言理解错误，也不是 tool 行为缺陷；根因是模型可见描述字段缺少语言规范。修复应发生在静态合同和测试层，而不是通过服务端关键词、运行时翻译或模型后处理解决。

## Goals / Non-Goals

**Goals:**

- 固化“模型可见描述性 prompt 默认中文”的仓库级和 Skill 级规则。
- 保留英文技术标识：`toolName`、字段名、enum、action type、resource type、schema id、命令和代码标识符不翻译。
- 中文化当前静态 tool manifest / schema / examples 描述。
- 用 manifest linter 或 registry manifest 测试覆盖回归。

**Non-Goals:**

- 不对用户输入、模型输出、数据库字段或运行时动态业务事实做翻译。
- 不修改 tool input / output schema 的字段名、枚举值或结构。
- 不调整 Agent runtime、PlannerPort、Executor、Policy Guard、ResourceStore、Response Renderer 或 `/api/chat` 主链路。
- 不通过关键词或规则判断用户语义。

## Decisions

### Decision 1: 语言规则写在治理层，具体文案写在 manifest / schema

`AGENTS.md` 记录全局原则；`agent-prompt-contract-governance` 记录 prompt / model input 审阅流程；`agent-tool-change-governance` 在新增或修改 tool 时补一个交叉检查。真正送给模型的业务能力边界仍写在 tool manifest / schema / examples 中。

理由：`AGENTS.md` 只能约束协作行为，不能自动改变 Planner 可见输入；Skill 能防止后续实现漏审；manifest / schema 才是当前模型实际可见合同。

### Decision 2: 用静态中文文案，不做运行时翻译

当前 tool manifest 都是静态定义，直接把描述性说明改成中文最清晰。运行时翻译会引入额外不确定性，也可能改变结构化标识或 enum 值。

替代方案是在 `toolToManifest()` 中自动翻译或追加中文说明。该方案会把语言策略混入序列化层，且无法可靠处理技术标识，放弃。

### Decision 3: 测试检查描述字段，而不是检查所有字符串

回归只检查模型可见描述性字段：manifest 顶层 `description`、`whenToUse`、`whenNotToUse`、examples 的 `description`，以及 JSON Schema 中的 `description`。字段名、enum、输入样例值、错误码和 resource type 可以保持英文。

理由：这些英文标识是执行合同的一部分，翻译会破坏 schema 和 Action Validator；描述性字段才是本次语言规范目标。

## Risks / Trade-offs

- [Risk] 只检查是否包含中文字符，不能证明整段文案完全中文。  
  Mitigation: 该检查作为回归护栏，配合人工审阅和 Skill 规则；技术标识必须保留英文，因此不能采用“禁止所有英文字符”的粗暴规则。
- [Risk] fixture tool 不是生产业务 tool，但仍会进入测试 Planner manifest。  
  Mitigation: fixture manifest 也使用中文描述，保持所有模型可见说明一致。
- [Risk] 当前进行中的 `harden-search-exercise-final-answer-settling` 也会修改 `searchExerciseResources` manifest。  
  Mitigation: 本 change 只改语言表达和测试护栏，不改变 output-only 字段或重复调用 repair 逻辑；后续如有冲突按 manifest 合同合并。

## Migration Plan

1. 补齐 OpenSpec proposal / design / specs / tasks。
2. 更新 `AGENTS.md`、两个治理 Skill 和架构文档。
3. 中文化当前 tool manifest / schema / examples 描述性文案。
4. 增加 manifest 描述字段中文校验与测试。
5. 运行 OpenSpec validate、tool registry manifest / manifest hardening / contract helper 等相关测试，以及 `npm run typecheck`。
