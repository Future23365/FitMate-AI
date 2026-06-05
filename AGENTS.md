# AGENTS.md

## 项目概述

本项目是一个 AI 健身聊天助手。系统通过自然语言交互理解用户的健身目标、身体状态、训练限制、训练偏好和可用时间，并据此生成、调整和执行个性化训练计划。

完整架构说明见：`docs/architecture.md`。

## OpenSpec 使用规则

- OpenSpec 负责具体的 proposal / apply / archive 工作流；本要求只规定什么时候必须使用 OpenSpec，以及 Codex 在使用 OpenSpec 时的边界。
- 对于非简单改动，在实现前必须先进入 OpenSpec，并补充OpenSpec流程相关文档。OpenSpec 规则优先于直接实现规则，除非我明确要求跳过 OpenSpec 或直接实现。
- 必须先走 OpenSpec 的场景包括：
  - 新功能开发
  - 行为逻辑变更
  - 用户流程变化，例如 onboarding、训练计划生成、训练执行流程
  - 架构调整
  - API 契约变更
  - 数据模型、Prisma Schema、数据库迁移或持久化结构变更
  - AI 编排逻辑、Prompt、Tool Calling、模型输出结构或校验逻辑变更
  - 健身领域规则、训练计划生成规则、动作选择规则变更
  - 权限、安全、限流、成本控制或用户数据隔离逻辑变更
  - 重构
  - 跨多个模块的改动

- 以下情况可以不走 OpenSpec，直接实现：
  - 文案修改
  - 简单样式调整
  - 小范围 bug 修复，且不改变业务行为、数据结构、API 契约、AI 输出结构或权限校验逻辑
  - 单文件内的低风险改动，且仅限不改变业务行为、不改变数据结构、不改变 API 契约、不改变 AI 输出结构的小修复
  - 明确要求直接修改、跳过 OpenSpec、hotfix、quick patch、minimal change 或最小改动的任务

- 即使只涉及单个文件，只要改变核心业务行为、AI 行为、数据模型、权限安全、训练计划生成规则或用户可观察流程，也必须先走 OpenSpec。
- 当我明确要求归档、archive、finalize、完成 change，或某个 OpenSpec change 的实现已完成并需要收尾时，优先使用 OpenSpec CLI 的内置命令：


### OpenSpec 处理

OpenSpec 生成或修改的说明性文档应使用中文，便于人工 review。

适用文件包括但不限于：
- proposal.md
- design.md
- tasks.md
- specs/**/spec.md 中的 Requirements、Scenarios、Acceptance Criteria 等说明性内容

要求：
1. 只翻译/改写说明性内容，不改变需求含义、功能边界或验收标准
2. 保留原有 markdown 结构，尤其是 tasks.md 的 checklist 结构
3. 保留文件名、目录名、组件名、函数名、变量名、API 名、命令、代码标识符为英文
4. 保留 OpenSpec 固定字段名、命令名、change id、spec id 为英文
5. 不要因为翻译而新增、删除或合并任务
6. 不要因为翻译而新增需求、扩大范围或引入额外技术方案
7. 如果原文存在歧义，先标记为“需要确认”，不要自行改写成确定需求
8. 实现代码、测试代码、提交信息中的技术标识保持项目现有语言风格

## 开发理念

本项目处于早期阶段，目前没有明显的历史包袱。

在修 bug 或改功能、添加功能时时，不要默认以“最小改动”为目标。必须优先选择最完整、最清晰、最可长期维护的设计方案。

默认优先级如下：

1. 正确性和长期可维护性优先于最小改动量。
2. 清晰的架构优先于局部 workaround。
3. 统一的代码模式优先于保留偶然形成的旧写法。
4. 强类型、明确的数据流、可预测的状态管理。
5. 当抽象能减少未来重复时，优先提取可复用抽象。
6. 行为变化时，同步更新测试、校验逻辑或相关文档。
7. 替换旧方案时，主动删除过时、误导或无用的代码。

修复 bug 时：

- 必须先找到根因，而不是只修表面现象。
- 判断这个 bug 是否暴露了抽象不合理、状态模型混乱、领域模型不完整等问题。
- 如果更大的重构能让系统更清晰、更安全，优先选择重构方案。
- 除非明确要求，否则不要为了兼容旧写法而增加临时兼容层。

新增或修改功能时：

- 按照当前阶段的理想实现方式来设计。
- 同步更新相关类型、API、状态结构、测试和文档。
- 优先保持模块边界清晰，不要把功能逻辑分散到多个无关位置。
- 除非用户明确要求，否则不要仅仅为了向后兼容而保留旧行为。

开始修改前，先简要说明计划采用的设计方向。
如果存在多个合理方案，选择长期可维护性最好的方案，并说明取舍。
只有在以下情况下，才选择最小改动方案：

- 用户明确要求 hotfix、quick patch、minimal change 或最小改动。
- 当前改动风险较高，故意选择更窄的安全修复。
- 更大的重构缺乏足够上下文，容易变成无根据的过度设计。

不要把“我只做了最小改动”当成优点。本项目更重视干净、一致、稳定、可扩展的实现。

## 配置集中化规则

- 运行时配置、模型参数、限额、默认开关、重试次数、最大调用次数、超时时间、feature flag、环境变量解析结果等，不允许散落在业务模块、Route、组件或 service 的局部变量中。
- 新增或修改配置时，必须优先放入 `<配置目录>` 的集中配置模块，并通过明确命名的导出对象或函数供业务代码消费。
- 业务模块只能读取集中配置导出的稳定接口，不直接解析环境变量、不直接定义可调参数、不复制默认值。
- 如果某个参数只服务于单个模块，也应先判断它是否属于运行策略配置；属于配置的，仍放入 `<配置目录>`，可以按领域拆分子配置文件。
- 只有纯函数内部的短生命周期计算值、测试 fixture 局部常量、组件私有展示常量，才允许保留在局部。
- 修改配置结构时，需要同步更新类型、默认值、校验逻辑和相关测试；涉及行为变化时必须走 OpenSpec。
- 代码评审时，如果发现新增 `MAX_*`、`DEFAULT_*`、`LIMIT_*`、`TIMEOUT_*`、`RETRY_*`、`MODEL_*`、`ENABLE_*` 等运行参数散落在业务文件里，应优先要求迁移到集中配置模块。

## 实现质量要求：禁止 MVP 思维

不要以 MVP、原型、Demo、临时方案、占位实现的思路完成任务。

对于每一个明确提出的需求，都应在当前需求范围内直接实现完整、稳定、可维护、可扩展、可真实使用的最佳方案，而不是“先做个能跑的版本”。

必须遵守：

* 不允许提交半成品、假逻辑、假数据、占位实现、TODO 式实现，除非用户明确要求。
* 不允许为了速度选择明显更差的架构或实现方式。
* 不允许把当前需求中显而易见且必要的部分推迟到“后续优化”。
* 默认考虑错误处理、边界情况、状态一致性、可访问性、性能、可维护性和可测试性。
* 当存在多个实现方案时，优先选择在正确性、长期维护、扩展能力和简洁性之间综合最优的方案。
* 如果最佳方案受到信息缺失、现有架构或上下文限制影响，需要明确说明权衡，并实现当前条件下最强的合理方案。

默认目标是：一次性完成高质量、生产级、可长期维护的实现。


## 重构策略

在能改善实现质量的前提下，允许并鼓励重构。

不要因为某种结构已经存在，就默认保留它。如果现有模式不清晰、不一致或不利于扩展，应该优先替换为更好的结构，而不是继续在上面叠补丁。

允许的重构包括：

- 重命名不清晰的变量、函数、文件或组件。
- 将逻辑移动到更合适的模块。
- 调整组件边界。
- 更新数据模型或类型定义。
- 删除死代码。
- 用明确的状态模型或领域模型替代零散条件判断。
- 合并重复逻辑。
- 改进校验、错误处理和边界处理。

重构必须有明确目的：需要说明为什么要重构，并且保持和当前任务相关。

## 回复与执行要求

对于非平凡改动，开始实现前先说明：

1. 问题根因或产品需求。
2. 准备采用的设计方向。
3. 预计会影响的文件或模块。
4. 考虑过的取舍。

完成实现后，总结：

- 改了什么。
- 为什么这个设计优于最小补丁。
- 如何验证。
- 是否有值得后续继续优化的点。

## 工作原则

- 先理解问题，再修改代码。
- 优先进行目标聚焦、范围可控的修改，而不是追求文本层面的最小改动。
- 不要做无关重构、无关格式化、无关依赖升级。
- 不要默认采用最小文本改动；如果最小改动会留下明显缺陷，应选择范围可控但完整的方案。
- 优先复用项目中稳定、清晰、被多处验证的现有模式、组件、hooks、utils、类型和样式约定；如果现有实现不清晰、不一致、耦合过重，或会导致明显的复杂适配，可以替换为更好的局部设计，并说明原因。
- 不要为了通过当前报错而牺牲类型安全、可维护性或用户体验。
- 如果需求不明确，先写出合理假设，然后继续推进最安全的实现方案。
## 开发与验证规则

- 默认禁止 Codex 主动打开页面、使用 `chrome-devtools` MCP、Browser、Playwright、截图工具或其他真实浏览器方式查看效果。
- 除非满足以下任一条件，否则不要自行打开页面验证：
  - 我明确要求「打开页面」「看效果」「用浏览器验证」「截图」「检查 UI」。
  - 问题只能在真实浏览器中复现或定位，例如布局遮挡、点击交互、运行时 hydration、真实路由跳转问题。
  - 我明确要求完成视觉还原，并且静态检查无法判断结果。
- 简单修 bug、改 TypeScript、改 API、改文案、改样式时，优先使用代码阅读、类型检查、lint、测试或构建验证，不要默认打开页面。
- 如果认为必须使用浏览器验证，先说明原因并等待我确认，不要直接打开。
- 严禁主动启动 dev server，包括 `npm run dev`、`next dev`、`npm exec next dev`。如确需浏览器验证，只能复用我已启动的 `http://localhost:3000`。
- 如果 Chrome DevTools MCP 不可用，不要静默改用内置预览；需要明确告诉我 MCP 不可用。
- 修改 TypeScript、React、API、Prisma、Schema 或校验逻辑后，应优先运行与改动相关的检查。
- 如果项目提供相关命令，优先按需使用 `npm run lint`、`npm run typecheck`、`npm run build` 或相关测试命令。
- 非文案类 OpenSpec change 的 `tasks.md` 必须包含与改动范围相关的测试或验证步骤。
- TypeScript、React、API、Schema、AI 编排、训练规则或共享业务逻辑改动应运行 `npm test` 或相关自动化测试，并按需运行 `npm run typecheck`。
- 影响构建、路由、依赖配置或服务端/客户端模块边界时，应运行 `npm run build` 或说明无法运行的原因。
- 如果没有运行检查，应说明原因。


## 调试与日志规则

- 当我说“看一下 log”、“看一下日志”时，先读取项目根目录下的 `codex_logs/ai_trace_log.js`。
- `codex_logs/ai_trace_log.js` 是基础轻量报告，默认用于快速定位当前问题：先看 `Saved at`、`title`、`agentLoops`、`plannerModelCalls`、`runtimeTraceEvents`、`tool_execution`、`tokenUsage`、错误 code、tool input/output summary、model request/response summary。
- `codex_logs/ai_trace_texts.jsonl` 是详细日志映射文件，保存长 prompt、model input、tool observation、raw response 和结构化详情 chunks。不要默认整文件读取，避免 token 过大。
- 当 `ai_trace_log.js` 中出现 `contentRef` 或 `detailRef` 时，先用 `rg` 在详细日志里查 header：
  - `rg '"contentRef":"text_0001"' codex_logs/ai_trace_texts.jsonl`
  - `rg '"detailRef":"detail_0001"' codex_logs/ai_trace_texts.jsonl`
- 需要完整内容时，再按 `parentRef` 查 chunks，并按 `chunkIndex` 顺序拼接：
  - `rg '"parentRef":"text_0001"' codex_logs/ai_trace_texts.jsonl`
  - `rg '"parentRef":"detail_0001"' codex_logs/ai_trace_texts.jsonl`
- 如果怀疑日志不是最新，先检查 `ai_trace_log.js` 顶部的 `Saved at` 和 `title`；不要沿用旧日志结论。
- `codex_logs/ai_trace_log.js` / `ai_trace_texts.jsonl` 是从 `/dev/ai-traces` 保存出来的导出文件，不是 `/dev/ai-traces` 页面的实时数据源。

## Git 提交规则

- 每次之前完成任务之后自动执行一次commit。
- 完成任务后，需要在最终回复中提醒我当前还有哪些文件未提交。
- 在执行大重构、高风险改动、跨模块改动之前，必须先检查 Git 工作区状态。
- 如果存在大量未提交改动，或未提交文件超过 10 个，或改动涉及多个模块/目录，则暂停执行大重构，并提醒我先提交或处理当前本地改动。
- commit message 使用中文提交说明。
  - 生成中文 commit message，格式为：
    `改动方向: 简短描述`
    改动方向从以下选择：功能新增、修复问题、样式调整、文档调整、重构代码、架构调整、性能优化、测试调整、配置调整、依赖调整、工程化调整、类型调整。
    根据 diff 判断最主要的改动方向，只选一个。OpenSpec、README、设计文档、需求说明、任务清单等归为「文档调整」；只有实际代码涉及模块边界、目录分层、状态管理、请求层、权限体系变化时，才用「架构调整」。
- 不要 amend、rebase 或改写已有提交，除非我明确要求。

## 分支/工作区同步规则

当我说“把某个分支/工作区的代码同步过来”“同步某个 codex/* 工作区”“把某个 worktree 合进来”时，默认含义是：

1. 优先识别该工作区对应的 Git 分支。
2. 默认使用 `git merge <source-branch>` 合并到当前分支。
3. 不要用复制文件、rsync、checkout 整棵树、覆盖当前工作区等方式同步。
4. 如果源工作区有未提交改动，先说明未提交文件，并询问是否也要包含这些未提交改动。
5. 如果正常 merge 有冲突或会删除当前主分支已有的重要文件，再暂停说明风险；只有在我明确要求时，才改用 cherry-pick、手动取文件或其他方式。
6. `master` 是主要分支。任何来自 codex/* 的同步都应以保留 master 当前内容为前提，不能用 codex/* 的最终文件树覆盖 master。

## 注释规则

- 本项目主要由 AI 协作生成代码，因此新增或修改核心代码时，必须添加简短的意图注释，帮助后续维护者和 AI 理解业务边界。
- 注释重点解释“这个函数/对象/类型负责什么、为什么存在、在链路中的位置”，不要解释代码表面的执行步骤。
- 导出的函数、hook、service、工具函数、核心类型、Zod Schema、配置对象、映射表、领域模型，应添加一句简短中文注释。
- 涉及 AI 编排、训练计划生成、动作选择、权限隔离、持久化、跨模块状态流的代码，即使实现不复杂，也应添加注释说明业务意图。
- 不写会快速过期的实现细节注释；如果代码变化会让注释失真，应同步更新或删除注释。
- 注释保持短句，优先中文；代码标识符、API 名、类型名保持英文。

## 文档维护
- 修改目录结构、数据库表结构、环境变量、启动方式等会影响项目使用或协作的内容时，需同步更新 README.md 或其他文档 中的相关说明。
- 每次进行技术架构、实现逻辑、方案大调整的时候。必须在`docs/方案变更历史`文件夹中生成相关md文档。每个调整单独一份md文档。重点记录当前真实的问题如原方案为什么不合适、调整思路、关键改动、怎么做的。如果结果可以量化，则标注上量化的结果。该文档主要作用就是记录项目演变过程，细节不需要太细，以讲故事为标准。
- 当本次改动涉及架构调整、核心实现逻辑变化、核心链路优化，或修正了一个会影响后续开发的重要问题时。则在`docs/项目演变历程.md`文档中按照改动顺序追加到末尾，简要记录此次干了什么，为了解决什么问题，无需详细记录实现细节。
- 如需要在docs下生成文档，在要分配好归类文件夹，不要直接散落在docs目录下。
- 文档记录的时间精确到时分秒,以上海(UTC+8)时间为准

## 技术栈

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma
- PostgreSQL
- Zod
- OpenAI SDK / Vercel AI SDK / DeepSeek AI SDK

## 前端 UI 规范

默认使用 `shadcn/ui` 作为基础组件库。新增或修改前端 UI 时，必须优先使用 `shadcn/ui` 组件，不要手写重复的 Button、Input、Dialog、Drawer、Sheet、Form、Select、Table、Dropdown、Toast、Skeleton、Badge、Card 等通用组件。

- 开发前先检查项目中已有的 `components/ui`、`components`、`shared`、`common` 等目录，优先复用现有封装。只有在 `shadcn/ui` 或项目已有组件无法满足需求时，才允许新增自定义组件，并保持样式、交互、命名和目录结构一致。

- 涉及异步请求的前端改动，必须提供 loading / pending / submitting 状态。请求期间应禁用相关操作，避免重复提交；请求成功、失败后必须使用 Toast 或项目已有消息组件给出明确反馈；请求结束、失败或取消后必须清理 loading。数据加载场景需区分 loading、empty、error、success 状态。

## 数据库时间规范

数据库时间字段必须使用无歧义时间格式。
时间字段优先使用 `timestamptz`，写入值可以使用 ISO 8601 UTC 格式，例如 `2026-05-31T05:07:20.006Z`。


## 架构规则

- 保持 UI 层、API 层、AI 编排层、领域服务层和数据访问层之间的职责分离。
- 不要把业务逻辑直接写在 API Route 中。
- 不要在 UI 组件中直接调用数据库或 AI 服务。
- 必须严格按照`docs/agent-tool-orchestrator-design.md`中的设计准则执行，如果需要对架构进行调整，则需要说明原因、方案、取舍。

## AI 规则

- 模型生成的数据必须使用 Structured Outputs、Zod Schema 或 JSON Schema 进行结构约束。
- 所有发给模型的描述性自然语言 prompt / model input 默认使用中文，包括但不限于 system / developer prompt、tool manifest、`description`、`whenToUse`、`whenNotToUse`、schema description、examples description、repair feedback、observations、compressed tool results 和 final grounding 说明。
  - `toolName`、字段名、枚举值、action type、resource type、schema id、命令、路径、代码标识符和外部 API 标识必须保持英文原样，不要为了中文化而改动执行合同。
  - 如必须引用英文原文，应同时提供中文解释；不得只用英文说明模型可见的业务规则、使用条件或失败含义。
- 所有模型输出在保存或执行前都必须经过服务端校验。
  - 服务端只校验结构性边界。非确定性边界、语义性边界以模型输出结果为准。
- Tool Calling 必须通过服务端函数执行。
- AI 不能直接写入未经校验的训练计划。
- AI 选择或生成的 exerciseId 必须经过数据库校验。
- 不要向 AI 工具暴露任意 SQL 查询能力。

### AI / Agent 边界：模型能力优先，服务端只管契约

- AI 相关需求或 bug 默认优先增强模型可用能力：tool、manifest / schema / examples、context / resource 摘要、repair feedback 和 grounding；不要用业务端编排分支替代模型自主 tool calling。
- LLM 是自然语言语义理解的唯一来源。服务端不得基于用户原始文本、关键词、正则、短句模板、同义词表、历史摘要推断或业务特例改写 action、`toolName`、调用顺序、引用目标、调整目标或最终回答策略。
- 服务端只校验确定性边界：Schema / enum / 字段自洽、权限隔离、数据库事实、resource 可访问/可消费、policy / confirmation、成本限流、安全拒绝、trace / projection / response rendering。
- 当模型输出结构冲突、字段缺失、引用不可用或结果不可执行时，只能进入 LLM repair、向用户澄清或拒绝并返回可恢复错误；不得把该 intent 改写成另一个语义意图或 action。
- Agent tool 按稳定 resource 和能力族设计。新增或调整 tool 前说明 resource、能力族（query / list / read / register / validate / policy / save / update）、同类变体和命名理由。
- `recent`、`current`、`latest`、`fromCard`、`forThisFlow` 等如果只是当前需求默认值，应落到 filter / sort / limit / cursor / resource reference，不写进 `toolName`；通用范围只能覆盖同一资源、能力族、权限和投影边界。
- bug 若表现为某个 phrasing、模型输出形态或 trace 个例失败，先按合同/上下文链路缺口定位根因，说明影响的同类变体、修复边界和回归测试；不能只修当前 case。
- 除非用户明确要求 quick patch，否则不要新增服务端自然语言判断、语义归一化、关键词分流或特定 phrasing 兜底。

## Agent 修复方案抽象层级门禁

当问题来自某个具体 trace、用户原话、tool result 或模型输出失败时，Codex 在给修复方案前必须先区分：

1. 失败证据：只能描述本次 case 发生了什么。
2. 通用合同：只能使用稳定抽象，例如引用对象、可见资源、tool result、resource role、grounding、repair、clarification。
3. 业务实例：`visibleTrainingProposal`、`searchExerciseResources`、`inspectVisibleTrainingProposals` 等只能作为 tool manifest、observation 或测试样例出现，不得直接升格成通用 prompt 规则。
4. 回归测试：可以包含用户原话和具体 tool 输出，但测试样例不得反向决定生产规则。

禁止把以下形态作为修复方案：
- “当用户说 X 时……”
- “当 toolName = Y 且字段 Z = 某值时，模型必须……”
- “针对这次 trace 的短句/资源/字段组合增加一条行为规则”
- 服务端根据用户自然语言、关键词、短句模板或具体 phrasing 改写 action、toolName、回复策略。

如果方案中必须出现具体业务名，Codex 必须说明它属于：
- tool 自身模型可见说明；
- observation projection；
- resource contract；
- 回归测试；
而不是通用语义规则。

给 Agent / prompt / tool 修复方案时，必须按以下顺序输出：

1. 抽象问题类型：例如引用对象缺失、grounding 缺失、tool observation 不足、repair feedback 不足。
2. 通用合同修复：不使用具体用户短句，不使用具体业务 toolName 作为触发条件。
3. 业务 tool 局部说明：如需涉及具体 tool，只说明该 tool 暴露什么事实、不能支撑什么事实。
4. 回归测试样例：具体用户输入和 trace 条件只能放在测试里。
5. 明确说明没有新增服务端语义分流、关键词规则或 phrasing 特判。

## 健身领域规则

- 保存到系统中的训练动作必须来自数据库。
- 不要提供医疗诊断或治疗建议。

## 数据规则

- PostgreSQL 是系统事实数据来源。
- 使用 Prisma 进行数据库访问。
- 所有用户输入必须使用 Zod 校验。
- 所有 AI 输出必须使用 Zod 或 JSON Schema 校验。
- 所有用户私有数据查询都必须基于 userId 做权限隔离。
- 优先使用结构化数据库过滤，再使用向量检索或语义排序。

## 安全规则

- 不要绕过权限校验。
- 不要信任客户端输入。
- 不要持久化未经校验的原始 AI 输出。
- AI 接口必须做限流和成本控制。
- 记录 AI 输出校验失败和工具调用失败日志。

## 前端 UI 风格规范

- 优先使用响应式布局，确保内容不会被剪裁或遮盖，不需要考虑适配移动端，只做pc端响应式。
- 整体界面以浅色 Material Design 3 风格为主，不在常规页面中使用大面积深色卡片。

### 视觉方向

- 设计底层参考 Material Design 3：使用 surface / panel / primary / outline / muted text 等层级化 token。
- 图标优先使用 Material Symbols Outlined。
- 保留 MD3 的清晰状态反馈、柔和 hover、浅色容器层级。
- 整体风格：简约、精致、现代化。
- 优先使用浅色背景、白色卡片、清晰边框、克制阴影，以蓝色作为主强调色。
- 界面保持冷静、专业，但通过训练数据、肌群重点、进度状态、AI 建议增强运动感。
