# 大模型 Planner Prompt 与 Tool Manifest 设计原则

## 0. 核心结论

Prompt 和 Tool Manifest 不是越长越好。

它们的目标不是把所有业务细节都告诉大模型，而是让大模型在每一轮稳定判断：

1. 当前是否能直接回答；
2. 是否需要调用工具；
3. 应该调用哪个工具；
4. 工具参数应该从哪里来；
5. 什么时候停止调用工具；
6. 最终应该输出什么结构；
7. 如果事实不足，应该如何合法收口。

核心原则：

> 大模型负责意图理解和决策。
> Schema 负责字段合法性。
> Tool 负责提供事实。
> Validator 负责事实可信度和结构校验。
> Repair Prompt 负责局部修复错误。
> 不要让主 Prompt 同时承担所有职责。

---

# 1. 信息分层原则

## 1.1 不要把所有东西塞进一个 Prompt

一个稳定的 Agent Prompt 系统应该分层：

```txt
System Prompt      ：定义角色、硬约束、输出格式、安全边界
Action Contract    ：定义 AgentAction 的合法 JSON 结构
Output Contract    ：定义最终结构化输出的合法形状
Glossary           ：定义容易混淆的业务概念
Planner Policy     ：定义业务决策规则
Tool Manifest      ：定义每个工具的能力边界
Runtime Context    ：提供当前 run 的用户输入、历史、metadata、toolResults
Validator          ：校验字段和事实是否合法
Repair Prompt      ：只在校验失败后做局部修复
```

不要把这些内容全部写进 system prompt。
也不要把所有业务流程都塞进 tool description。

---

## 1.2 各层职责

| 模块              | 负责什么           | 不负责什么        |
| --------------- | -------------- | ------------ |
| System Prompt   | 最高级行为约束        | 具体业务字段细节     |
| Action Contract | action JSON 形状 | 业务决策         |
| Output Contract | 结构化输出形状        | 事实是否可信       |
| Glossary        | 概念定义           | 工作流编排        |
| Planner Policy  | 什么时候做什么        | 具体 schema 校验 |
| Tool Manifest   | 工具能力和边界        | 最终回答生成       |
| Runtime Context | 当前事实           | 通用规则         |
| Validator       | 合法性和事实校验       | 用户意图理解       |
| Repair Prompt   | 修复上一轮非法输出      | 正常规划         |

---

# 2. System Prompt 设计原则

## 2.1 System Prompt 是宪法，不是操作手册

System Prompt 只放最稳定、最高优先级、几乎不会变的规则。

适合放：

* 模型角色；
* 只能输出什么格式；
* 顶层 action 类型；
* 工具只能来自当前 tools；
* 不得伪造执行结果；
* 不得输出 JSON 外文本；
* 安全边界；
* 终态动作和工具动作的区别。

不适合放：

* 每个字段的长解释；
* 每个工具的详细流程；
* 所有 validator 错误修复规则；
* 历史 bug 黑名单；
* 重复的禁止项；
* 具体业务 case；
* 长篇接口说明。

原则：

> System Prompt 越短越稳。
> 它应该定义边界，而不是承载全部业务知识。

---

## 2.2 System Prompt 应回答的问题

System Prompt 应该让模型明确：

```txt
1. 我是谁？
2. 我只能输出什么？
3. 我不能输出什么？
4. 我什么时候可以调用工具？
5. 我什么时候必须终止？
6. 我不能伪造什么？
7. 哪些安全边界不能越过？
```

不要让 System Prompt 回答：

```txt
1. 每个字段完整 schema 是什么？
2. 每个工具所有参数怎么填？
3. 每种业务错误怎么修？
4. 每个历史字段为什么不能用了？
```

这些应该交给其他层。

---

## 2.3 System Prompt 应该短句化

不建议写长句：

```txt
当模型已经从本轮某某结果或某某资源中读取某某引用并且需要在某种情况下执行某某操作时……
```

建议拆成短句：

```txt
只能返回一个 JSON object。
不要输出 Markdown。
不要输出解释文字。
toolName 必须来自当前 tools。
final_answer 是终态动作。
tool_call 只表示请求执行工具。
```

原则：

> 一条规则只表达一个判断。

---

# 3. Action Contract 设计原则

## 3.1 字段合法性不要靠 Prompt 描述

Action 的合法字段、必填字段、枚举值、类型，都应该由结构化合同定义。

可以使用：

* JSON Schema；
* TypeScript type；
* Zod；
* TypeBox；
* 后端 validator。

Prompt 只解释这些字段的语义，不承担校验职责。

原则：

> Schema 管形状，Prompt 管决策。

---

## 3.2 Action 类型要少

AgentAction 的顶层类型越少越好。

常见设计：

```txt
tool_call     ：请求执行工具
final_answer  ：终态回答
ask_user      ：向用户追问
```

不要设计过多相似 action，例如：

```txt
answer
final
final_result
respond
message
assistant_action
```

这会让模型混淆。

原则：

> 顶层 action 类型应该少、互斥、有清晰停止语义。

---

## 3.3 每个 action 要有明确边界

每种 action 都要回答：

```txt
什么时候使用？
使用后 runtime 会做什么？
它是不是终态？
它能不能包含用户可见文本？
它能不能包含结构化输出？
```

例如：

```txt
tool_call：
- 非终态
- 请求 runtime 执行工具
- 不代表工具已经执行
- 不应该承诺最终结果

final_answer：
- 终态
- 用户可见文本写在 content
- 如果有结构化输出，写入 visibleOutputs
- runtime 不会继续自动执行内部步骤

ask_user：
- 终态
- 用于缺少必要信息
- 用户可见问题写在 content
```

---

# 4. Glossary 设计原则

## 4.1 所有非通用字段都要定义

只要是项目内部概念，就不要让模型猜。

例如：

```txt
toolResultId
resourceId
factRef
messageId
visibleOutputs
usedRefs
producedResources
diagnostic
consumable
outputContract
resourceContract
```

这些都应该集中解释。

原则：

> 字段名清楚，不代表模型理解你的业务含义。

---

## 4.2 容易混淆的概念用表格

不要用散文解释相似概念。
应该用对照表。

示例结构：

```md
| 概念 | 含义 | 来源 | 能否进入最终引用 | 常见误用 |
|---|---|---|---|---|
| toolResultId | 当前 run 工具结果 id | toolResults | 可以 | 用历史 id 冒充 |
| resourceId | 当前 run 资源 id | producedResources | 可以 | 把业务 id 当 resourceId |
| factRef | 历史事实引用 | 查询工具返回 | 不可以 | 当成 resourceId |
| messageId | 历史消息 id | 查询工具返回 | 不可以 | 当成 resourceId |
```

原则：

> 相似概念必须并排比较，不要分散解释。

---

## 4.3 每个 ID 类字段必须说明来源

大模型最容易编造 ID。
所有 ID、ref、resource、handle、key 都必须定义来源。

每个此类字段都应说明：

```txt
1. 它是什么；
2. 它从哪里来；
3. 它能用在哪里；
4. 它不能用在哪里；
5. 它能否被模型自行生成。
```

原则：

> ID 类字段默认禁止模型编造。

---

# 5. Planner Policy 设计原则

## 5.1 Policy 写“选择规则”，不是字段规则

Planner Policy 的核心是告诉模型：

```txt
什么时候 final_answer
什么时候 ask_user
什么时候 tool_call
什么时候继续工具
什么时候停止
什么时候失败收口
```

它不应该详细描述 schema 的所有字段。

原则：

> Planner Policy 负责决策路径，不负责字段类型。

---

## 5.2 决策规则必须有优先级

不要只写平铺规则：

```txt
信息不足时 ask_user。
需要事实时 tool_call。
可以回答时 final_answer。
```

因为很多场景会同时满足多个条件。

应该设计优先级：

```txt
1. 如果请求越过安全边界，先安全收口。
2. 如果可以不依赖工具直接回答，使用 final_answer。
3. 如果目标需要外部事实且工具可用，使用 tool_call。
4. 如果缺少继续执行所必需的信息，使用 ask_user。
5. 如果工具结果足够，使用 final_answer。
6. 如果事实不足且无法继续查询，失败收口。
```

原则：

> 分类规则必须有 tie-breaker，否则模型会随机选择。

---

## 5.3 用正向条件替代大量负面规则

不推荐：

```txt
不要在事实不足时输出结构。
不要在缺少引用时输出结构。
不要在缺少 section 时输出结构。
不要在工具失败时输出结构。
```

推荐：

```txt
只有同时满足以下条件，才允许输出结构化结果：
1. 当前目标明确；
2. 当前 run 有足够事实；
3. 所有 ID 来自可信来源；
4. 结构满足 output contract；
5. 使用的事实可以被 usedRefs 或 resource 支撑。
```

原则：

> 正向准入条件比负面禁止列表更稳定。

---

## 5.4 定义“停止条件”

Agent 必须知道什么时候停止。

应该明确：

```txt
继续 tool_call 的条件：
- 当前目标仍需要外部事实；
- 当前 tools 中有合适工具；
- 已有信息足以构造合法 input；
- 还没超过最大 step。

返回 final_answer 的条件：
- 当前事实足够；
- 或者不需要工具也能回答；
- 或者事实不足但可以诚实失败收口。

返回 ask_user 的条件：
- 缺少继续执行所必需的信息；
- 工具无法替代用户补充；
- 用户引用对象不可确认；
- 歧义会影响核心结果。
```

原则：

> 没有停止条件的 Agent 会过度调用工具或编造结果。

---

## 5.5 给模型合法失败出口

事实不足时，不要逼模型必须成功。

应该允许：

```txt
1. 继续调用工具补齐事实；
2. ask_user 追问必要信息；
3. final_answer 说明当前事实不足；
4. 输出不带结构化结果的普通回答；
5. 明确说明无法完成某个结构化输出。
```

原则：

> 不给模型失败出口，它就会编成功。

---

# 6. Tool Manifest 设计原则

## 6.1 Tool Manifest 不是后端 API 文档

后端 API 文档关心：

```txt
字段
类型
错误码
权限
版本
实现细节
存储
分页
handler 行为
```

Tool Manifest 关心：

```txt
这个工具解决什么问题
什么时候该用
什么时候不该用
输入从哪里来
输出是什么事实
输出能支撑什么
输出不能支撑什么
```

原则：

> Tool Manifest 面向模型的调用决策，不面向工程维护。

---

## 6.2 每个 Tool 只回答六个问题

每个工具说明应该围绕六个问题设计：

```txt
1. Purpose：这个工具做什么？
2. Use When：什么时候使用？
3. Do Not Use When：什么时候不要使用？
4. Input Source：输入值从哪里来？
5. Output Meaning：输出代表什么事实？
6. Grounding Rules：输出能如何被下游使用？
```

如果某段说明不属于这六类，通常应该移走。

---

## 6.3 Tool 应该单一职责

一个工具只做一类事情。

好的工具职责：

```txt
查询资源
解析名称
读取历史对象
创建对象
更新对象
删除对象
获取状态
```

不好的工具职责：

```txt
查询资源 + 生成方案 + 判断用户目标 + 保存结果 + 返回最终文案
```

原则：

> 工具越单一，模型越容易选对。

---

## 6.4 Tool 名称要表达动作和对象

推荐命名方式：

```txt
动词 + 资源对象
```

例如：

```txt
searchResources
resolveMentions
inspectVisibleItems
readResource
createDraft
updatePlan
deleteEvent
```

避免：

```txt
handleSomething
processSomething
manageSomething
doTask
agentTool
commonTool
```

原则：

> 模型会根据工具名快速判断用途，名字必须可解释。

---

## 6.5 whenToUse 写意图，不写关键词

不推荐：

```txt
当用户说“换一批”时调用此工具。
当用户说“刚才那个”时调用此工具。
```

推荐：

```txt
当用户引用当前会话中已经展示过的对象，并且需要确认该对象是否存在时使用。
```

原因：

用户表达是无限的，关键词是不可靠的。
意图类型才是稳定的。

原则：

> 写语义触发条件，不写固定短语触发条件。

---

## 6.6 whenNotToUse 只写特有边界

不要每个工具都重复全局禁止项。

不建议每个工具都写：

```txt
不要保存。
不要生成最终回答。
不要写用户记忆。
不要伪造 ID。
不要调用不存在的工具。
```

这些应该放到全局工具规则。

Tool 级 `whenNotToUse` 只写本工具和其他工具的边界：

```txt
这个工具不用于解析名称。
这个工具不用于读取历史对象。
这个工具不用于查询候选列表。
这个工具不用于生成最终结构。
```

原则：

> Tool 级禁止项只写本工具特有误用。

---

# 7. Tool 输入设计原则

## 7.1 每个输入字段都要说明来源

模型填错参数，通常不是因为字段名不懂，而是不知道值从哪里来。

字段来源可以分为：

```txt
用户明确表达
当前 metadata
当前 toolResults
当前 producedResources
当前 consumable resources
当前 tool schema 枚举
模型可解释推断
禁止模型生成
```

对每个关键字段，应说明：

```txt
这个字段只能来自哪里？
是否允许模型推断？
是否允许从历史消息中抽？
是否必须来自本轮工具结果？
是否可以为空？
```

原则：

> 参数来源比参数含义更重要。

---

## 7.2 ID、ref、枚举值必须严格

所有这类字段必须限制来源：

```txt
id
resourceId
toolResultId
factRef
messageId
exerciseId
cursor
handle
version
enum
```

规则：

```txt
1. 不能让模型凭空生成 ID。
2. 不能让模型从示例复制 ID。
3. 不能让模型把用户自然语言当 ID。
4. 不能让模型把历史文本里的 ID 当成本轮可用 ID。
5. 只能从当前 run 明确暴露的位置取。
```

原则：

> ID 类字段默认不可推断，只能引用。

---

## 7.3 Tool 输入使用 canonical value

机器字段应该只暴露一种规范值。

不推荐：

```txt
equipment 可以写 no_equipment，也可以写 无器械。
```

推荐：

```txt
工具输入必须写 no_equipment。
用户可见文本可以说“无器械”。
```

原则：

> 机器字段用 canonical value，用户文案用自然语言，不要混用。

---

## 7.4 不要让模型传完整聊天文本给工具

如果工具需要结构化输入，就要求模型先提取。

不推荐：

```json
{
  "query": "用户完整消息……"
}
```

除非这个工具本身就是全文搜索或语义检索。

推荐：

```json
{
  "mentions": [
    { "text": "单个明确实体" }
  ]
}
```

原则：

> 能结构化就结构化，不要把完整对话丢给工具让工具猜。

---

# 8. Tool 输出设计原则

## 8.1 输出要标明事实等级

不是所有输出都能直接用于最终结果。

建议把工具输出分成事实等级：

| 等级         | 含义             |
| ---------- | -------------- |
| diagnostic | 只能辅助判断         |
| candidate  | 候选，需要进一步确认     |
| resolved   | 身份已解析，但还不能直接消费 |
| consumable | 可作为最终结构的事实来源   |
| terminal   | 可直接支撑最终用户回答    |

每个 tool manifest 都应说明它的输出属于哪类。

原则：

> 工具输出不是一律可信可消费，必须定义事实等级。

---

## 8.2 明确输出能支撑什么

每个工具都要说明：

```txt
输出可以用于：
- 普通文本回答？
- 下一个工具的 input？
- 最终 usedRefs？
- 最终 visibleOutputs？
- 结构化字段？
```

也要说明：

```txt
输出不能用于：
- 直接写入最终结构？
- 作为 resourceId？
- 作为已保存结果？
- 作为用户已经看到的对象？
```

原则：

> Tool 输出的下游用途必须明确。

---

## 8.3 区分“索引”“详情”“可消费事实”

很多系统会有三层：

```txt
索引：只说明有什么
详情：读取具体对象
可消费事实：可以支撑最终结构
```

模型需要知道：

```txt
查到索引 ≠ 读取了完整对象
读取详情 ≠ 已经生成最终结果
导入资源 ≠ 已经保存或渲染
```

原则：

> 资源生命周期要显式建模，不要让模型猜。

---

# 9. Tool Examples 设计原则

## 9.1 示例要展示完整 Action

如果模型最终要输出完整 action，就不要只给 tool input 示例。

不推荐：

```json
{
  "operation": "list_recent"
}
```

推荐：

```json
{
  "type": "tool_call",
  "toolName": "someTool",
  "input": {
    "operation": "list_recent"
  }
}
```

原则：

> 示例必须示范最终输出形状，而不是片段。

---

## 9.2 示例不追求多，追求覆盖边界

示例应该覆盖：

```txt
正常调用
不该调用
输入来自用户
输入来自 toolResult
输入来自 resource
输出为空
输出歧义
输出不足
最终停止
```

不要堆大量相似例子。

原则：

> 示例用于教边界，不是列业务大全。

---

## 9.3 示例不要引入无关业务复杂性

示例越复杂，模型越容易学习到错误重点。

好的示例应该突出：

```txt
什么时候调用
为什么调用
参数从哪里来
输出怎么使用
```

不要同时展示太多业务字段。

原则：

> 示例要最小化，只保留这个工具最关键的调用模式。

---

# 10. Runtime Context 设计原则

## 10.1 当前事实和长期规则分开

Runtime Context 只放当前 run 的事实：

```txt
用户输入
历史消息
metadata
当前 step
当前 tools
observations
toolResults
producedResources
```

不要把长期规则塞进 runtime context。
长期规则应该在 system prompt、policy 或 contract 中。

原则：

> Runtime Context 是当前状态，不是规则手册。

---

## 10.2 Runtime Context 要压缩

不要把所有历史和所有资源无脑传给模型。

应该传：

```txt
当前任务需要的最近消息
当前可用工具
当前工具结果摘要
当前可消费资源摘要
当前 metadata 中有用的 catalog
当前 validator observations
```

过长上下文会稀释关键规则。

原则：

> 给模型足够事实，不给模型噪音。

---

## 10.3 metadata 要使用规范值

metadata 中如果给模型枚举或 catalog，应尽量是规范值。

例如：

```txt
facetCatalog.muscles
facetCatalog.equipment
facetCatalog.level
```

这些值应该与 tool schema 对齐。

原则：

> metadata 是工具输入的候选来源，必须和 schema 同步。

---

# 11. Validator 设计原则

## 11.1 Validator 不替模型决策

Validator 只判断：

```txt
结构是否合法
字段是否存在
枚举是否合法
ID 是否真实
事实来源是否可信
引用是否来自当前 run
最终输出是否可渲染
```

Validator 不负责：

```txt
重新理解用户意图
选择最佳工具
自动生成缺失业务字段
替模型规划流程
```

原则：

> Validator 负责拦错，不负责规划。

---

## 11.2 Validator 错误要可操作

给模型的错误信息不要只写：

```txt
invalid payload
```

应该写：

```txt
path: visibleOutputs[0].payload.exerciseItems[2].section
code: invalid_section
expected: allowedSections contains this section
actual: section not supported by source exercise
```

原则：

> Repair 质量取决于 validator 错误是否具体。

---

## 11.3 区分 Schema Validation 和 Domain Validation

Schema Validation：

```txt
字段类型错
缺少必填字段
枚举值非法
多了未知字段
tool input 不匹配 schema
```

Domain Validation：

```txt
ID 不来自当前 run
事实来源不可信
section 不被 allowedSections 支撑
失败工具结果被引用
索引结果被当作可消费事实
结构缺少必要事实
```

原则：

> Schema 管形状，Domain 管事实。

---

# 12. Repair Prompt 设计原则

## 12.1 Repair Prompt 独立于主 Prompt

不要把所有修复规则长期塞进主 prompt。

正确方式：

```txt
正常生成时：使用主 prompt。
校验失败时：追加 repair prompt。
```

原则：

> 主 Prompt 教正确行为，Repair Prompt 修上一轮错误。

---

## 12.2 Repair 只做局部修复

Repair Prompt 应要求模型：

```txt
只修正上一轮非法 action。
不要重新规划用户目标。
不要引入新事实。
不要编造 ID。
不要扩大任务范围。
如果事实不足，移除结构化输出或失败收口。
```

原则：

> Repair 是修 JSON，不是重新做产品决策。

---

## 12.3 Repair 输入必须包含错误路径

Repair payload 应包含：

```txt
failedAction
error.path
error.code
expected
actual
allowedFields
requiredFields
allowedValues
domain facts
current contracts
current tool schemas
```

原则：

> 给模型错误坐标，它才修得准。

---

# 13. 写 Prompt 的具体风格规则

## 13.1 用结构，不用散文

推荐结构：

```txt
目标：
规则：
选择边界：
禁止事项：
失败出口：
```

不推荐长段落散文。

---

## 13.2 用短句，不用复合长句

推荐：

```txt
tool_call 不是终态。
final_answer 是终态。
工具结果不能自动变成最终输出。
```

不推荐：

```txt
当 runtime 在某个条件下执行了某种工具并且产生了某类资源时，模型应当……
```

---

## 13.3 用表格区分相似概念

尤其适用于：

```txt
action type
resource type
ID type
tool output level
final output kind
failure mode
```

---

## 13.4 用唯一术语

同一个概念只用一个名字。

不要混用：

```txt
结果 / 工具结果 / observation / tool result / used result
```

除非它们确实是不同概念。

原则：

> 一个概念，一个名字。

---

## 13.5 不要重复解释

同一规则不要在 system prompt、tool manifest、policy、repair prompt 都讲一遍。

重复会导致：

```txt
上下文变长
模型抓错重点
后续维护不一致
规则互相冲突
```

原则：

> 同一条规则只放在最合适的一层。

---

# 14. 写 Tool Manifest 的具体风格规则

## 14.1 推荐固定模板

每个 tool 都按同一模板写：

```md
## Tool: toolName

### Purpose
一句话说明工具做什么。

### Use When
- 语义条件 1
- 语义条件 2

### Do Not Use When
- 与其他工具的边界 1
- 本工具特有误用 2

### Input Source Rules
- 字段 A 来自哪里
- 字段 B 是否可推断
- 字段 C 是否必须来自本轮结果

### Output Meaning
- 输出 A 表示什么
- 输出 B 表示什么

### Grounding Rules
- 输出能支撑什么
- 输出不能支撑什么

### Examples
- 完整 AgentAction 示例
```

---

## 14.2 Tool 描述控制长度

建议：

```txt
Purpose：1～2 句
Use When：3～6 条
Do Not Use When：2～5 条
Input Source Rules：按关键字段列
Output Meaning：2～5 条
Grounding Rules：3～6 条
Examples：1～3 个
```

不要把一个 tool manifest 写成几千字。

原则：

> Tool Manifest 要让模型快速选工具，不是让模型读完整产品文档。

---

## 14.3 不要在 Tool 中写完整 Workflow

不推荐：

```txt
先调用 A，然后调用 B，如果结果 C，再调用 D，最后输出 E。
```

这种应该放 Planner Policy 或 examples。

Tool Manifest 只说：

```txt
这个工具能做什么。
它的输入从哪里来。
它的输出能证明什么。
```

原则：

> Tool Manifest 讲能力，Planner Policy 讲编排。

---

# 15. 负面规则设计原则

## 15.1 负面规则要少而关键

必须写的负面规则：

```txt
不得伪造 ID。
不得调用不存在的工具。
不得把失败结果当成功事实。
不得输出合同外字段。
不得声称执行了未执行动作。
```

不建议写大量低价值负面规则。

---

## 15.2 能用 validator 校验的，不要主要靠 prompt

例如：

```txt
字段不存在
枚举非法
缺少必填
ID 不真实
section 不匹配
```

这些应由 validator 兜底。

Prompt 只写高层原则：

```txt
所有结构化输出必须由当前 run 可见事实支撑。
```

原则：

> 能机器校验的，就不要靠模型自觉。

---

# 16. 事实链路设计原则

## 16.1 明确事实从哪里来

最终输出必须能追溯事实来源：

```txt
用户输入
metadata
toolResults
producedResources
consumable resources
```

不能来自：

```txt
模型记忆
示例 ID
历史文本中未导入资源
失败工具结果
未注册工具
未暴露数据库事实
```

---

## 16.2 明确事实如何升级

常见事实升级链路：

```txt
用户自然语言
-> 结构化 mention
-> resolve tool
-> resolved candidate
-> search/read tool
-> consumable fact
-> final visible output
```

不要跳级：

```txt
用户自然语言 -> final structured output
resolved candidate -> final structured output
index result -> final structured output
```

原则：

> 每一步事实升级都要有工具或资源支撑。

---

# 17. Prompt / Tool 设计检查清单

## 17.1 Prompt 检查清单

每条 Prompt 规则都问：

```txt
1. 这条规则是否长期稳定？
2. 它是否属于 system prompt？
3. 它是否应该放到 schema？
4. 它是否应该放到 tool manifest？
5. 它是否应该放到 glossary？
6. 它是否只在 repair 时需要？
7. 它是否和其他规则重复？
8. 它是否有明确优先级？
9. 它是否能改成正向准入条件？
10. 它是否会让模型过度保守？
```

---

## 17.2 Tool Manifest 检查清单

每个工具都问：

```txt
1. 这个工具的单一职责是什么？
2. 它和其他工具的边界是什么？
3. 模型什么时候应该调用它？
4. 模型什么时候不应该调用它？
5. 输入字段从哪里来？
6. 哪些字段绝对不能编造？
7. 输出属于什么事实等级？
8. 输出能不能直接支撑最终结构？
9. 输出为空、歧义、失败时怎么办？
10. examples 是否是完整 AgentAction？
```

---

## 17.3 Runtime 检查清单

每轮传给模型前问：

```txt
1. 当前 tools 是否只包含本轮可用工具？
2. tool schema 是否和 manifest 一致？
3. metadata 是否使用 canonical value？
4. toolResults 是否有摘要？
5. producedResources 是否明确 role？
6. observations 是否可操作？
7. 上下文是否过长？
8. 是否混入旧字段或历史废弃概念？
```

---

# 18. 最终设计原则总结

## 18.1 一句话版

```txt
Prompt 定策略。
Schema 定形状。
Glossary 定概念。
Tool 定能力。
Runtime 给事实。
Validator 守边界。
Repair 修错误。
```

---

## 18.2 最重要的三条

```txt
1. 不要让模型猜字段含义。
2. 不要让工具说明承担业务编排。
3. 不要让主 prompt 承担 schema、validator 和 repair 的职责。
```

---

## 18.3 判断一个设计好不好的标准

一个好的 Planner Prompt + Tool Manifest 设计，应该让模型每轮都能稳定回答：

```txt
1. 我现在是否有足够事实？
2. 如果没有，我应该调用哪个工具或问用户什么？
3. 如果有，我应该用什么合法结构结束？
```

如果这三个问题清楚，系统就会稳定。

如果这三个问题不清楚，prompt 写再长也会乱。
