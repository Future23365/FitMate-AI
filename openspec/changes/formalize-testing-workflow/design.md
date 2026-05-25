## Context

当前项目已有 `tests/workout-plan.test.ts`、`tests/workout-voice-cue.test.ts` 和 `tests/workout-voice-broadcast-controller.test.ts`，但这些文件只是导出测试函数，并通过 `console.assert` 表达断言。`package.json` 目前提供 `npm run typecheck`、`npm run lint` 和 `npm run build`，没有 `npm test`，也没有正式测试框架负责发现、执行和报告测试结果。

后续训练计划生成、聊天 AI 编排、动作候选筛选和训练执行流程都会继续变化。测试流程需要先成为项目约定，否则每个 OpenSpec change 的验收口径会不一致，容易出现“代码改了但相关逻辑测试没有跑”的情况。

## Goals / Non-Goals

**Goals:**

- 建立项目级 `npm test` 脚本，作为本地和后续 CI 可复用的测试入口。
- 将现有手写逻辑测试迁移为测试框架可发现、可失败退出、可读报告的测试用例。
- 明确后续 OpenSpec change 的 `tasks.md` 必须包含与改动相关的测试或验证步骤。
- 建立按改动类型选择验证命令的规则，避免所有变更都只靠 `typecheck` 或人工检查。
- 保持测试代码优先覆盖确定性业务规则、Schema、AI 输出校验、动作筛选、训练 timeline 和语音 cue 这类可稳定断言的逻辑。

**Non-Goals:**

- 不在本次变更中新增业务功能或改变用户可见行为。
- 不重写 AI prompt、模型调用链路、API 契约或数据库结构。
- 不强制所有页面都立刻补齐端到端测试。
- 不把浏览器交互验证替代为普通单元测试；涉及真实页面渲染和交互时仍按项目规则使用 Chrome DevTools MCP 验证。
- 不一次性建立完整 CI 流水线；本变更只让测试命令和验收规则先稳定。

## Decisions

### 1. 使用 Vitest 作为首个正式测试框架

优先接入 Vitest，并提供 `npm test` 执行当前测试集。理由是项目主要是 TypeScript、React 和纯函数业务逻辑，Vitest 对 ESM、TS、路径别名和 watch 模式支持较直接，迁移成本低，适合先承接当前 `tests/*.test.ts`。

备选方案是使用 Node.js 内置 `node:test`。它可以减少依赖，但当前测试大量使用项目路径别名、TypeScript 源码和未来可能的 React 组件测试，配置成本会转移到运行器和转译链路上。Jest 生态成熟，但在当前 Next.js 16、React 19 和 ESM 组合下配置更重，不适合作为早期测试入口的首选。

### 2. 先迁移现有测试语义，再扩大测试覆盖

第一阶段应保持现有测试意图不变：训练计划 Schema、动作候选筛选、风险过滤、保存结构转换、训练语音 cue、语音播报控制器降级路径都迁移为 `describe` / `it` / `expect`。迁移时删除手写 `console.assert`，让失败能通过测试框架返回非零退出码。

备选方案是边接框架边大规模补测试。这个方向长期需要，但会让“测试流程接入”和“业务覆盖扩张”耦合在一起，review 时难以判断失败来自框架接入还是新增断言本身。

### 3. 验收测试要求写入 OpenSpec 任务流程

后续非文案类 OpenSpec change 的 `tasks.md` 应包含测试或验证任务。任务不要求固定只运行 `npm test`，而是按改动类型选择最相关命令：

- TypeScript、React、API、Schema、AI 编排、训练规则改动：至少运行 `npm run typecheck` 和相关测试。
- 改动会影响 lint 规则、导入边界或常规源码质量：运行 `npm run lint`。
- 改动影响构建、路由、服务端/客户端边界或依赖配置：运行 `npm run build`。
- 改动影响页面渲染、交互、训练执行页或浏览器能力：使用 Chrome DevTools MCP 做真实 Chrome 验证，并检查 Console 和 Network。
- 无法运行某项检查时，最终交付必须说明原因和剩余风险。

这样做比在所有任务里机械写满所有命令更可维护，也符合当前项目“按风险选择验证范围”的规则。

### 4. 测试文件继续放在 `tests/`，业务代码保持分层

现有 `tests/` 目录可以继续作为项目级逻辑测试目录。测试可以引用 `lib/shared/*` 和适合在 Node 环境运行的 `lib/server/*` 纯服务，但不应让 UI 组件直接绕过模块边界调用数据库或 AI 服务。需要 mock 浏览器 API 时，应在测试文件内建立明确 mock，避免污染全局环境后不恢复。

备选方案是把测试分散到源码旁边。源码旁测试对局部维护方便，但当前项目已经有 `tests/` 目录和 README 说明，先沿用现有位置能降低迁移噪音。

## Risks / Trade-offs

- [Risk] Vitest 引入新依赖和配置文件，可能增加安装和维护成本。→ Mitigation: 配置保持最小，只覆盖 TS 路径别名和当前 Node/jsdom 环境需求。
- [Risk] 迁移 `console.assert` 时可能误改原有测试语义。→ Mitigation: 逐个断言等价迁移，先不扩大断言范围。
- [Risk] 浏览器相关测试在 Node 环境中不稳定。→ Mitigation: 仅 mock Web Speech API 这类确定性边界；真实页面和交互仍走 Chrome DevTools MCP 验证。
- [Risk] 后续 change 的测试任务可能被写成形式化 checklist。→ Mitigation: spec 要求测试任务必须与受影响模块对应，并在无法执行时记录原因。
- [Risk] `npm test` 初期覆盖有限，容易被误解为完整质量保证。→ Mitigation: tasks 和 README/TODO 中明确 `npm test` 是基础自动化入口，仍需配合 `typecheck`、`lint`、`build` 和必要的浏览器验证。

## Migration Plan

1. 安装并配置 Vitest，新增项目级 `npm test` 脚本。
2. 迁移现有 `tests/*.test.ts` 为测试框架可自动发现的用例。
3. 运行 `npm test`、`npm run typecheck` 和 `npm run lint`，确保接入测试流程本身不破坏现有源码质量。
4. 更新 README 或相关工程说明，记录测试命令和后续验收要求。
5. 后续每个 OpenSpec change 在 `tasks.md` 中按改动类型列出相关测试与验证任务。

回滚策略：如果测试框架接入出现阻塞，可以先保留测试文件迁移结果并暂时移除 `npm test` 脚本，但不能把“已有测试不可自动执行”的状态标记为完成。

## Open Questions

无需要产品确认的问题。实现时如果发现某个现有测试依赖浏览器环境过深，应优先把可测试的纯逻辑继续下沉到 `lib/shared` 或明确 mock 边界，而不是跳过该测试。
