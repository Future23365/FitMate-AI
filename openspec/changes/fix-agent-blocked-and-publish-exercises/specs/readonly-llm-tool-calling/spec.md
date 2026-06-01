## ADDED Requirements

### Requirement: 发布态动作库必须支持推荐检索
系统 SHALL 保证用于本地种子和开发验证的动作数据默认可被 `visibility: "published"` 的 `searchExercises` 检索到。

#### Scenario: 种子动作写入发布态
- **WHEN** seed 脚本写入动作库记录
- **THEN** 每条动作记录的 `isPublished` MUST 默认为 `true`
- **AND** seed 脚本 MUST 保留显式传入的 `isPublished` 发布态

#### Scenario: 静态动作数据发布态一致
- **WHEN** 系统读取 `data/exercises.zh.json` 作为动作种子来源
- **THEN** 文件中的动作记录 MUST 全部包含 `isPublished: true`

#### Scenario: 发布态检索能召回弹力带臀腿候选
- **WHEN** Agent 或只读工具使用 `visibility: "published"`、`equipmentRequired` 包含 `弹力带`、`level` 为 `beginner`，并按臀腿相关肌群检索动作
- **THEN** `searchExercises` MUST 能从已发布动作库中返回候选
- **AND** 系统 MUST NOT 因种子数据默认未发布而返回空候选集合
