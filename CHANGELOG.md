# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的格式，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-09-14

首个版本：基于上游 [Roll-Bot-Project/roll-bot](https://github.com/Roll-Bot-Project/roll-bot) v1.3.0（commit `6ce60ab`）二次开发，**完整保留上游提交历史**（分叉点见仓库 tag `upstream-fork-point`）。

### Added 新增

- **参与条件**（`join` 配置组，在「发送加入口令」与 `giveaway.join` 两条路径上统一生效）
  - 群聊等级下限 `minGroupLevel`（QQ 群聊等级 1~100）
  - 最近发言 `minActiveDays`（要求最近 N 天内在本群发过言）
  - 最长连续发言天数 `minContinuousDays`（基于荣誉数据的 `day_count_max`，可自定义门槛，
    与官方「群聊之火 7 天 / 群聊炽焰 30 天」同源但更灵活）
  - QQ 群互动标识 `requiredHonors`（群聊之火 / 群聊炽焰 / 龙王）与 `honorMode`（满足任一 / 必须全部）；
    龙王的判定口径可用 `dragonScope` 在「昨日活跃榜」与「仅当前龙王」之间切换
  - 取不到数据时的策略 `onFetchError`（放行 / 拒绝）与缓存时长 `cacheMinutes`
  - 拒绝时会说明具体原因（当前等级、上次发言距今天数、缺少哪个标识）
- **荣誉数据自取能力**（`src/util/honorProvider.ts`）
  - 通过 OneBot 的 `get_cookies` 动作获取 `qun.qq.com` 登录态，改调 QQ 新版网页接口：
    `honor_talkative`（龙王/活跃榜）、`honor_continuous`（`continuous_type` 2=群聊之火、3=群聊炽焰）、`honor_emotion`
  - 自动计算 CSRF 令牌 `bkn`，并按 `cookie-only → bkn(skey) → bkn(p_skey) → bkn+g_tk → bkn+Origin`
    顺序探测可用鉴权方式（命中即缓存，避免反复试错）
  - 归一化成 OneBot 的 honor 结构，同时保留 `day_count` / `day_count_max` 等更细的字段
    （支持「最长连续发言 ≥ N 天」这类自定义门槛）
- **管理员诊断指令**：`giveaway.debug.honor`（荣誉接口）、`giveaway.debug.member`（群成员等级/发言），
  两者都会把原始返回写进插件日志，便于线上排查
- **独立构建**：`npm run build`（`scripts/build.mjs`，esbuild + js-yaml，仅依赖 devDependencies），
  另有 `build:types`（tsc 生成 `.d.ts`）、`build:watch`、`clean`、`prepublishOnly`
- 提交 `package-lock.json` 固定构建工具链版本

### Changed 变更

- **创建抽奖交互简化：6 步 → 最多 2 步**
  - 交互式提问压缩为「奖品 → 开奖时间与加入口令」，后两项**合并成一条回答**（第一段是时间，其余是口令）
  - 标题、描述、开奖类型不再提问（走默认值），需要时用 `-t` / `-d` / `-r` 覆盖
  - 新增位置参数 `[prize] [endTime] [key]`，支持完全非交互创建：`抽奖 add 显卡*1 09-15-20-00 参加`
  - `-n` 快速模式语义保持（只问奖品）
  - 内部把原先手写的 `undo` 状态机改为**声明式问题链**，`undo` 自动回退，降低后续改动出错的概率
  - 奖品输入解析更稳：忽略空行、支持 `|` 分隔多个奖品
- 包名 / 插件名 / 指令根：`koishi-plugin-roll-bot` → **`koishi-plugin-giveaway`**；
  指令根由 `roll` + `remind` 两个根统一到 `giveaway`（`remind.*` → `giveaway.reminder.*`）；
  事件总线前缀 `roll-bot/*` → `giveaway/*`
- **配置界面重写**为四组：`basic`（记录保留时长、默认时区）、`permission`（权限）、`join`（参与条件）、
  `remind`（提醒器）；三语文案全部重写（en/de 由上游的中文残留改为真正的英文 / 德文）
- **权限模型改接 Koishi 原生等级**（用户表 `authority` 字段：0 封禁 / 1 普通用户 / 3 管理员 / 4 超级管理员），
  新增 `authorityCreate`（创建抽奖所需等级）与 `authorityManage`（管理他人抽奖所需等级）

### Fixed 修复

- **群管理员判定失效**：OneBot 适配器给出的 `member.roles` 是 `[{ id: 'admin' }]` 对象数组，
  而上游直接拿 `roles[0]` 与字符串比较，导致「群主/群管理员可管理本群抽奖」**恒不生效**；
  现已兼容对象数组与字符串数组两种形式
- 拿不到群成员角色信息时（私聊、未知平台）不再一律放行
- `requiredHonors` 中被清空后残留的 `null` 会被当成有效条件（导致条件永远生效、全员被拒），现已过滤无效值
- `onFetchError: deny` 拒绝时补上告警日志（此前拒绝分支没有任何日志，线上排查只能靠上游日志）
- 荣誉接口返回空列表时不再直接判成「你没有标识」，而是按「取不到数据」处理

### Removed 移除

- 单字母别名 `r` / `rd` / `d`（空前缀配置下极易误触，且 `r` 与骰子类插件冲突）
- 旧文档配置组 `usage`、`basic.adminUsers`、`permission.allowNormalUserAdd`（分别由文档链接、Koishi 权限等级、
  `permission.authorityCreate` 取代）

### 说明

- NapCat 自带的 `get_group_honor_info` 自 QQ 荣誉页改版（改为 Vite SPA，`window.__INITIAL_STATE__` 不复存在）
  后失效，上游 v4.18.19 仍未修复 → 本插件的荣誉取数**不再依赖它**；
  先用 OneBot 标准接口（将来修好会自动优先使用），取不到时自动切换到新版网页接口
- 未配置任何参与条件时**零开销**：不发起任何接口调用；非 OneBot 平台会跳过参与条件检查
