## Context

当前有两个测试相关 OpenSpec change：

- `expand-test-coverage`：定义需要补充哪些测试用例、覆盖哪些模块、fixture 怎么组织、哪些高风险流程需要验收。
- `formalize-testing-workflow`：定义测试框架、`npm test`、runner、现有手写测试迁移和后续验收流程。

两者主职责不同，但存在三个重叠点：

- 两者都提到 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build` 等验证命令。
- 两者都提到 Chrome DevTools MCP 真实浏览器验收。
- 两者都涉及现有手写测试与新增测试的关系。

此外，`expand-test-coverage` 当前文档把 `formalize-testing-workflow` 写成前置条件；而这次要求是先完成补测试用例的 change，再完成补测试流程的 change。因此需要一个单独编排 change 来统一顺序和职责边界。

## Goals / Non-Goals

**Goals:**

- 明确执行顺序：先实施 `expand-test-coverage`，再实施 `formalize-testing-workflow`。
- 明确重复内容归属，避免两个 change 同时负责 runner、脚本或测试覆盖范围。
- 调整既有说明文档中的冲突依赖表述，让两个 change 可以按指定顺序实施。
- 保留两个原 change 的业务目标，不把它们合并成一个大 change。

**Non-Goals:**

- 不新增或修改实际测试用例。
- 不安装测试依赖，不新增 `npm test`，不改 `package.json`。
- 不改变业务代码、API 契约、AI prompt、模型调用链路或数据库结构。
- 不归档两个原 change。
- 不重新设计测试框架选型。

## Decisions

### 1. 采用三段执行顺序

后续实施顺序固定为：

1. `expand-test-coverage`：先补测试用例和必要的 fixture/测试数据组织；如果 runner 尚未完成，测试文件可以先按目标框架风格编写，但最终执行入口由后续流程 change 承接。
2. `formalize-testing-workflow`：再接入测试框架、`npm test`、现有手写测试迁移和验收流程文档。
3. 收尾验证：确认新增测试、迁移测试和项目级脚本都能通过统一命令执行。

这个顺序符合当前要求“先完成补测试用例，再完成补测试流程”。它的代价是第一阶段新增的测试可能暂时不能通过 `npm test` 统一执行；因此第一阶段完成时必须记录哪些测试等待 runner 接入承接。

备选方案是先做 `formalize-testing-workflow` 再做 `expand-test-coverage`。从工程依赖看更自然，但不符合当前指定顺序。

### 2. 重复内容按职责归属

重复内容归属如下：

- 测试覆盖范围、测试文件清单、fixture、领域场景、服务层和 API route 覆盖点归 `expand-test-coverage`。
- 测试框架、脚本、runner、`npm test`、现有手写测试迁移和验收命令策略归 `formalize-testing-workflow`。
- Chrome DevTools MCP 的浏览器验收规则由 `formalize-testing-workflow` 统一定义；`expand-test-coverage` 只引用哪些高风险页面或交互需要验收。
- `typecheck`、`lint`、`build` 的通用规则由 `formalize-testing-workflow` 统一定义；`expand-test-coverage` 只列出本 change 实现时实际需要运行的检查。

### 3. 不合并两个 change

两个 change 不合并。原因是它们的 review 关注点不同：补测试用例关注业务覆盖和用例质量；补测试流程关注 runner、脚本、依赖和验收规范。合并会让实现和 review 范围过大，也会让问题来源难以定位。

### 4. 通过文档一致性任务解决冲突

本 change 实施时应只修改 OpenSpec 文档中的依赖和职责表述，例如去掉 `expand-test-coverage` 对 `formalize-testing-workflow` 先完成的硬依赖，改成“测试流程完成后统一承接执行”。不应提前修改测试代码或 `package.json`。

## Risks / Trade-offs

- [Risk] 先补测试用例但 runner 未接入，短期内无法统一执行。→ Mitigation: 测试用例按目标框架风格编写，并在交付中记录等待 `formalize-testing-workflow` 承接的命令入口。
- [Risk] 两个 change 的验收命令重复导致任务混乱。→ Mitigation: 通用命令策略归 `formalize-testing-workflow`，`expand-test-coverage` 只保留本 change 的实际执行清单。
- [Risk] 修改既有 OpenSpec 文档时意外扩大原 change 范围。→ Mitigation: 只调整依赖顺序和重复职责表述，不新增测试覆盖需求或测试框架方案。
- [Risk] 先补用例可能暴露模块不可测试，需要小范围重构。→ Mitigation: 仅允许为测试暴露稳定纯函数或服务入口，避免导出不稳定内部实现。

## Migration Plan

1. 在 `expand-test-coverage` 文档中去掉 `formalize-testing-workflow` 必须先完成的硬前置条件。
2. 在 `expand-test-coverage` 中保留测试覆盖范围和测试数据策略，不再定义 runner 或测试脚本归属。
3. 在 `formalize-testing-workflow` 中保留 runner、`npm test`、手写测试迁移和验收流程，不扩展测试覆盖清单。
4. 按顺序实施：先 `expand-test-coverage`，再 `formalize-testing-workflow`。
5. 两个 change 都完成后，统一运行最终测试和静态检查。

## Open Questions

无需要产品确认的问题。当前顺序以用户指定为准。
