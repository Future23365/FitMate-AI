## ADDED Requirements

### Requirement: 动作图片展示 URL 可配置
系统 SHALL 通过服务端配置生成动作图片展示 URL，并且 MUST 支持默认本地读取入口和可替换的外部资源基础 URL。

#### Scenario: 默认使用本地图片读取入口
- **WHEN** 未显式配置 `EXERCISE_IMAGE_PUBLIC_BASE_URL`
- **THEN** 系统 MUST 将动作图片展示 URL 生成为站内 `/api/exercise-images/...` 路径
- **AND** 前端动作库、动作详情、动作推荐卡和训练执行页 MUST NOT 直接收到 GitHub raw URL 作为默认展示图

#### Scenario: 配置外部资源基础 URL
- **WHEN** `EXERCISE_IMAGE_PUBLIC_BASE_URL` 被配置为绝对 URL 或站内静态路径
- **THEN** 系统 MUST 使用该基础 URL 生成动作图片展示 URL
- **AND** 系统 MUST 保留动作 id、步骤序号和文件扩展名对应的路径结构

#### Scenario: 保留多步骤图片顺序
- **WHEN** 一个动作有多张步骤图片
- **THEN** 系统 MUST 按原始 `images` / `imageUrls` 顺序生成展示 URL 数组
- **AND** 前端轮播、缩略图和训练执行图片序列 MUST 继续使用同一顺序

### Requirement: 本地动作图片读取受文件系统边界保护
系统 SHALL 提供受控的本地动作图片读取入口，并且 MUST 只读取配置目录内的图片资源。

#### Scenario: 读取合法本地图片
- **WHEN** 客户端请求 `/api/exercise-images/<exerciseId>/<stepIndex>.jpg`
- **THEN** 系统 MUST 从 `EXERCISE_IMAGE_LOCAL_DIR` 对应目录读取该图片
- **AND** 响应 MUST 包含正确的图片 `Content-Type`
- **AND** 响应 MUST 设置适合静态动作资产的缓存头

#### Scenario: 拒绝路径穿越
- **WHEN** 客户端请求包含 `..`、绝对路径、空路径段或等价路径穿越内容
- **THEN** 系统 MUST 拒绝读取文件
- **AND** 系统 MUST NOT 暴露配置目录之外的任何文件内容

#### Scenario: 拒绝非图片文件
- **WHEN** 客户端请求非允许图片扩展名的路径
- **THEN** 系统 MUST 拒绝读取文件
- **AND** 响应 MUST 使用可识别的错误状态而不是返回文件内容

### Requirement: 动作图片解析集中在服务端数据出口
系统 SHALL 在服务端统一解析动作图片展示 URL，前端组件 MUST 继续消费已经解析好的 `imageUrls` 或 `imageUrl` 字段。

#### Scenario: 列表接口返回动作图片
- **WHEN** 客户端请求 `/api/exercises`
- **THEN** 响应中的每个动作 `imageUrls` MUST 使用动作图片 resolver 生成
- **AND** 前端动作库卡片 MUST 不需要自行识别或替换 GitHub URL

#### Scenario: 详情接口返回动作图片
- **WHEN** 客户端请求 `/api/exercises/:id`
- **THEN** 响应中的 `item.imageUrls` MUST 使用与列表接口相同的 resolver
- **AND** 动作详情 Sheet MUST 能继续展示多图轮播

#### Scenario: 服务端派生训练展示图片
- **WHEN** 动作推荐、AI routine、已保存 routine 或训练执行页需要从数据库动作派生 `imageUrl` / `imageUrls`
- **THEN** 系统 MUST 复用同一个动作图片 resolver
- **AND** 系统 MUST NOT 在各业务服务中重复拼接本地图片路径

### Requirement: 原始图片来源数据保持稳定
系统 SHALL 保留数据库中动作图片的原始来源字段，并且 MUST NOT 为切换展示 URL 而重写 `Exercise.images` 或 `Exercise.imageUrls`。

#### Scenario: 展示 URL 切换完成
- **WHEN** 本 change 实现完成
- **THEN** PostgreSQL 中已有 `Exercise.images` 和 `Exercise.imageUrls` 数据 MUST 保持原始来源语义
- **AND** 系统 MUST 通过服务端 resolver 派生前端展示 URL

#### Scenario: 本地图片资源缺失
- **WHEN** 某个动作没有可解析的本地图片资源
- **THEN** 系统 MUST 回退到现有动作占位图或显式配置的 fallback 来源
- **AND** 系统 MUST NOT 因单个图片缺失导致动作列表、推荐卡或训练执行页整体失败
