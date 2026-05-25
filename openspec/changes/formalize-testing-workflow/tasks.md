## 1. 测试框架与脚本接入

- [x] 1.1 选择并安装 Vitest 及必要的 TypeScript/路径别名配置依赖。
- [x] 1.2 新增最小测试配置，确保测试环境能解析 `@/*` 路径别名和当前 TypeScript 源码，并能发现 `expand-test-coverage` 新增测试文件。
- [x] 1.3 在 `package.json` 增加 `npm test` 脚本，保证测试失败时返回非零退出码。

## 2. 现有测试迁移

- [x] 2.1 将 `tests/workout-plan.test.ts` 从导出手写 runner 迁移为测试框架自动发现的用例。
- [x] 2.2 将 `tests/workout-voice-cue.test.ts` 从 `console.assert` 迁移为 `describe` / `it` / `expect` 断言。
- [x] 2.3 将 `tests/workout-voice-broadcast-controller.test.ts` 迁移为异步测试用例，并保留 Web Speech API mock 的环境恢复逻辑。
- [x] 2.4 删除或替换迁移后不再需要的手写 `run...Tests()` 入口，避免测试文件看起来可执行但实际未接入脚本。
- [x] 2.5 将 `expand-test-coverage` 新增测试纳入同一 runner，不在本 change 中新增额外测试覆盖范围。

## 3. 验收流程文档化

- [x] 3.1 更新 README 或工程说明，记录 `npm test` 的用途、运行方式和它与 `typecheck`、`lint`、`build` 的关系。
- [x] 3.2 在 OpenSpec 工作流说明或项目约定中补充：后续非文案类 change 的 `tasks.md` 必须包含相关测试或验证步骤。
- [x] 3.3 明确 UI/交互类变更仍需使用 Chrome DevTools MCP 做真实 Chrome 验证，并检查 Console、Network 和关键交互结果。

## 4. 验证

- [x] 4.1 运行 `npm test`，确认现有迁移后的测试和 `expand-test-coverage` 新增测试会被自动发现并执行。
- [x] 4.2 运行 `npm run typecheck`。
- [x] 4.3 运行 `npm run lint`。
- [x] 4.4 如测试框架配置、依赖或模块边界影响构建，运行 `npm run build`。
- [x] 4.5 在最终交付中记录所有已运行命令；若任何命令无法运行，说明原始报错、原因和剩余风险。
