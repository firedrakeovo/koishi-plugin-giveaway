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
- **每个抽奖可单独设置参与条件（per-roll 覆盖）**
  - 创建模板新增「参与条件」一行，**直接带上控制台当前的限制条件**，创建者可以：
    ① 不改动 → 沿用控制台配置；② 删空 → 这个抽奖不限制；③ 改写 → 自定义门槛
  - 文本形态为固定 token：`等级≥40 活跃≥1 连续≥7 标识=群聊炽焰,龙王`（不需要的项删掉即可），
    中/英/德三种标签都能解析；**文本表达不了的口径**（多标识判定 `honorMode`、龙王口径 `dragonScope`）
    只在控制台配置、对所有抽奖生效，不会被某个抽奖创建时的快照顶掉
  - 与全局等价的策略**不落库**（继续跟随控制台），有差异才写入新表 `roll_policy`；
    加入抽奖时 per-roll 策略优先于全局配置
  - **`抽奖详情` 里显示当前生效的参与条件**（per-roll 优先，其次控制台配置；无限制时显示「不限」），
    参加者被拒之前就能看到门槛
- **管理员诊断指令**：`giveaway.debug.honor`（荣誉接口）、`giveaway.debug.member`（群成员等级/发言），
  两者都会把原始返回写进插件日志，便于线上排查
- **独立构建**：`npm run build`（`scripts/build.mjs`，esbuild + js-yaml，仅依赖 devDependencies），
  另有 `build:types`（tsc 生成 `.d.ts`）、`build:watch`、`clean`、`prepublishOnly`
- 提交 `package-lock.json` 固定构建工具链版本

### Changed 变更

- **创建抽奖交互重做为「复制模板填写」**
  - `创建抽奖` 会发一份**文字表格模板**（`奖品：` / `开奖时间：` / `加入口令：` / `标题：` / `描述：`），
    用户复制后逐项填写发回，**一次往返**完成
  - **留空的项按默认处理**（开奖时间留空 = 不自动开奖、口令留空 = 不用口令、标题/描述留空 = 默认值），只有奖品必填
  - 解析**按标签**取值并识别中/英/德三种标签与全角冒号；群里随口一句（没有标签）不会被误当成奖品，
    整段复制粘贴也可用（说明行被忽略）
  - 缺奖品、开奖时间不合法、回复 `q` / `取消`、或不回复 → **直接取消创建**，不再逐步追问
  - 位置参数写法保留（有参数时输出模板的步骤被跳过）：`抽奖 add 显卡*1 09-15-20-00 参加`；
    标题/描述/中奖人可重复可用 `-t` / `-d` / `-r`，模板里填的值优先
  - 新增 `parseCreateForm` 纯函数（标签解析 + 格式校验，可单测）
  - 模板改为**纯文本**（去掉 `<p>` / `<b>` 等元素标签），保证复制粘贴出来是干净内容
  - 口令不为空时，创建成功的提示会带上口令；**口令为空时不再参与关键词匹配**
    （避免内容为空的消息误命中无口令抽奖）
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
- `requiredHonors` 中被清空后残留的 `null` 会被当成有效条件（导致条件永远生效、全员被拒），现已过滤无效值；
  启动时若发现控制台配置里有空项/错值会打印告警，并说明当前实际生效的标识
- **控制台里「互动标识」的空行会伪装成「群聊之火」**：schemastery-vue 判断选项是否匹配用的是
  `optional(schema)(null)`，而非 required 的 `const` 会接受 `null`，于是空行在界面上显示成第一个选项
  （群聊之火），实际存进配置的却是 `null` —— 表现就是「控制台明明选了三个，实际只生效两个」。
  现在三个候选项都是 `required`，空行在界面上显示为空；历史配置里的 `null` 仍能正常解析
  （插件按无效值忽略，并在启动时告警提示去控制台删掉空行）
- `onFetchError: deny` 拒绝时补上告警日志（此前拒绝分支没有任何日志，线上排查只能靠上游日志）
- 荣誉接口返回空列表时不再直接判成「你没有标识」，而是按「取不到数据」处理

### Removed 移除

- 单字母别名 `r` / `rd` / `d`（空前缀配置下极易误触，且 `r` 与骰子类插件冲突）
- `-n` 快速创建选项（语义被"只回一行、开奖时间填 `n`"取代）
- 旧文档配置组 `usage`、`basic.adminUsers`、`permission.allowNormalUserAdd`（分别由文档链接、Koishi 权限等级、
  `permission.authorityCreate` 取代）

### 说明

- NapCat 自带的 `get_group_honor_info` 自 QQ 荣誉页改版（改为 Vite SPA，`window.__INITIAL_STATE__` 不复存在）
  后失效，上游 v4.18.19 仍未修复 → 本插件的荣誉取数**不再依赖它**；
  先用 OneBot 标准接口（将来修好会自动优先使用），取不到时自动切换到新版网页接口
- 未配置任何参与条件时**零开销**：不发起任何接口调用；非 OneBot 平台会跳过参与条件检查
