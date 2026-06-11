---
name: architecture-decoupling-governance
description: 治理 AITest 中跨模块、跨层或抽象边界变化的架构解耦审查。作为 primary skill 用于新增/修改业务能力、跨模块数据流、API/validator/renderer/persistence/domain service、UI 或服务端状态模型、共享类型、AI 编排、训练规则、特殊分支、fallback、兼容层，或新增第二个同类来源/视图/流程/数据生产者；要求实现前说明模块职责、稳定合同、具体 adapter、耦合风险和验证方式。单个 LangChain tool description、prompt 文案、schema description、局部测试或不改变模块边界的小修不自动触发。
---

# 架构解耦治理

## 使用目标

用这个 Skill 在实现前先审模块边界，防止为了当前 case 把 UI、API、领域服务、持久化、validator、renderer、AI 编排或具体数据来源绑在一起。

这个 Skill 不替代 OpenSpec、`agent-tool-change-governance` 或 `agent-prompt-contract-governance`。如果改动同时触发这些治理流程，先用本 Skill 明确通用边界，再按更具体的 Skill 或 OpenSpec 收口执行合同、模型可见合同和验证计划。

## 前置检查

0. 每个任务只选择一个 primary governance skill。本 Skill 只在模块边界、稳定合同、adapter、状态模型或第二来源/第二消费者是主问题时作为 primary；局部 Agent tool 或 prompt 变更由更具体的治理 Skill 主导。
1. 运行 `git status --short`。如果存在无关用户改动，不要混入当前 diff 或 commit。
2. 判断是否触发 OpenSpec。凡是新功能、行为逻辑变更、用户流程变化、架构调整、API 契约、数据模型、AI 编排、训练规则、权限安全、重构或跨模块改动，默认先走 OpenSpec，除非用户明确要求跳过。
3. 如果涉及 Agent tool、LangChain runtime、tool wrapper、production response adapter、trace summary、`/api/chat` 或模型可见合同，先判断哪个边界是 primary；本 Skill 只保留架构解耦审查，执行合同和模型可见合同由对应治理 Skill 收口。
4. 实现前先给出解耦审查结论，不要直接开改。

## 必须审查的问题

实现前必须回答这些问题：

1. 当前改动涉及哪些生产者、消费者、协调者、持久化层和展示层？
2. 每个模块真正拥有的职责是什么？有没有模块知道了不该知道的细节？
3. 消费者真正需要的领域事实或能力是什么，而不是它来自哪个具体实现？
4. 下游依赖的是稳定合同，还是上游的具体返回值、字段结构、调用顺序、页面结构、模型输出形态或数据库 shape？
5. 有没有把 UI shape、API shape、DB shape、AI output shape、validator shape 或 renderer shape 直接互相复刻？
6. 如果未来新增第二个同类实现，哪些模块不应该再改？
7. 是否需要 adapter、mapper、projection、domain service、resource contract、fact contract 或 policy contract 来隔离变化？
8. 当前 bug 是局部遗漏，还是暴露了抽象边界错误？

## 默认禁止项

- 禁止让下游直接依赖上游的具体实现细节。
- 禁止把某个具体来源当成领域事实本身。
- 禁止在通用模块里写具体页面、具体 tool、具体 API route、具体模型输出、具体数据库查询的特殊判断。
- 禁止为了通过当前 case，在消费者里增加来源白名单、调用顺序判断、字段形态猜测或业务特例。
- 禁止让 API Route 承担核心领域逻辑。
- 禁止让 UI 组件承担服务端业务规则、权限规则、持久化规则或 AI 编排规则。
- 禁止让 persistence 层理解 UI 展示结构或模型输出结构。
- 禁止让 validator 同时承担来源解析、业务编排、事实查询和渲染适配。
- 禁止用兼容层掩盖已经明显错误的模块边界，除非用户明确要求 hotfix、quick patch、minimal change 或临时兼容。

## 推荐设计

- 上游具体实现通过 adapter 投影成稳定领域合同。
- 下游只消费领域合同，不反向认识上游来源。
- API 层只做请求校验、权限、调用服务和响应投影。
- 领域服务层表达业务规则，避免规则散落在 UI、API、validator、renderer 或 persistence。
- validator 只校验确定性边界，不承担业务编排或自然语言语义判断。
- renderer 只渲染已经归一化和校验的数据，不做事实推断。
- persistence 只保存稳定领域模型或持久化合同，不保存临时 UI shape 或未校验模型输出。
- 共享类型表达稳定语义，不直接复刻某个页面、某个接口、某个 tool 或某个模型输出的临时 shape。
- 新增同类能力时，优先扩展公共合同或 adapter 层，而不是修改所有消费者。

## 设计说明模板

非简单改动开始实现前，按这个结构简要说明：

- 根因或需求本质：
- 受影响模块：
- 稳定合同：
- 具体 adapter：
- 消费者不应该知道的细节：
- 未来新增同类实现时不应再改的模块：
- 取舍和保留耦合点：
- 验证方式：

如果无法说清稳定合同和 adapter，先不要实现；应先补设计、OpenSpec 或请用户确认边界。

## 常见风险信号

- 新增一个同类来源，却必须修改 validator、renderer、persistence、UI 或 API 的白名单。
- 修一个 bug 时需要在多个无关模块复制相同判断。
- 一个模块同时解析来源、查事实、做业务决策、校验、渲染和持久化。
- 共享类型名字很通用，但字段只服务某个页面或某个 tool。
- 为了避免改架构，新增了 `fromCard`、`latest`、`current`、`visible`、`forThisFlow`、`fallback` 这类含义模糊的分支。
- 测试只能证明当前 trace 或当前页面通过，不能证明第二个同类来源也能复用。

## 验收要求

- 非简单改动必须至少有一个验证点证明模块边界没有继续扩大耦合。
- 如果是修耦合问题，必须补一个“第二来源 / 第二消费者 / 第二实现”的测试、fixture 或等价架构扫描。
- 如果新增同类实现，验证应证明无关消费者不需要认识新来源名称。
- 如果修改 TypeScript、React、API、Schema、AI 编排或共享业务逻辑，优先运行相关自动化测试，并按需运行 `npm run typecheck`。
- 如果当前只能临时修复，最终回复必须明确标出临时耦合点、接受原因、清理条件和后续应该抽出的公共边界。

## 收尾说明

完成后总结：

- 改了什么。
- 为什么这个设计优于局部补丁。
- 如何验证。
- 是否还有保留耦合点或剩余风险。
