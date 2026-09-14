# koishi-plugin-giveaway

[![npm](https://img.shields.io/npm/v/koishi-plugin-giveaway?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-giveaway)
[![license](https://img.shields.io/npm/l/koishi-plugin-giveaway?style=flat-square)](./LICENSE)

一个多功能的 Koishi 群抽奖插件：交互式创建抽奖、成员参与、定时自动开奖、开奖前提醒，支持参与条件（群聊等级 / 活跃度 / QQ 群互动标识）、Koishi 原生权限等级、多语言与多时区。

> A versatile giveaway plugin for Koishi: interactive giveaway creation, member participation, scheduled auto-draw and reminders, with i18n and multi-timezone support.

## 功能特性

- **创建抽奖只需复制模板**：`创建抽奖` 会发一份**文字表格模板**（含**当前控制台的参与条件**），复制后逐项填写发回即可（留空 = 用默认）；解析按标签取值，随口一句不会被误当成奖品。熟手也可用一条指令跳过模板
- **每个抽奖可单独设置参与条件**：模板里的「参与条件」一行可沿用控制台配置、删空（该抽奖不限制）或改写（自定义门槛）
- **两种参与方式**：在群里发送加入口令（如 `add`），或使用 `giveaway.join <编号>`
- **定时自动开奖**：到点自动开奖，也可随时手动 `开奖`；开奖后按 `cacheHours` 自动清理记录
- **提醒器**：定时提醒 / 结束前提醒，可设默认提醒器，并支持按抽奖启停
- **参与条件**（可组合，任一不满足即拒绝并说明原因）：
  - **群聊等级**下限（QQ 群聊等级 1~100）
  - **最近 N 天内发过言**（最稳的条件，不依赖 QQ 网页接口）
  - **最长连续发言天数**（可自定义门槛，如「连续 ≥ 14 天」）
  - **QQ 群互动标识**：群聊之火（连续发言）、群聊炽焰（连续 30 天）、龙王（昨日活跃，可选「榜单 / 仅当前龙王」两种口径）
- **权限沿用 Koishi 原生等级**：创建与「管理他人抽奖」分别配置最低权限等级，群主与群管理员可管理本群抽奖，抽奖创建者始终可管理自己的抽奖
- **多语言 / 多时区**：简体中文 / English / Deutsch，用户可自设时区
- **管理员诊断指令**：`giveaway.debug.honor`、`giveaway.debug.member` 一键体检数据来源

> 参与条件里的荣誉数据通过 **QQ 新版网页接口**（`qun.qq.com/cgi-bin/qunapp/honor_*`）获取：NapCat 自带的 `get_group_honor_info` 因 QQ 荣誉页改版已失效（静默返回空列表），本插件接管了这段取数逻辑，并顺带拿到了 `day_count` 等更细的字段。详见 [参与条件](#参与条件)。

## ⚠️ 上游出处（Provenance）

本仓库是 [Roll-Bot-Project/roll-bot](https://github.com/Roll-Bot-Project/roll-bot) 的**二次开发分支（fork）**，不是上游官方仓库：

- 分叉自上游 commit [`6ce60ab`](https://github.com/Roll-Bot-Project/roll-bot/commit/6ce60ab)（v1.3.0，2024-11-06），**完整保留上游提交历史**，分叉点见仓库 tag `upstream-fork-point`。
- 上游作者：Logthm &lt;logthm@outlook.com&gt;，上游文档：<https://docs.logthm.com/roll-bot-project>
- 许可证：MIT（见 [LICENSE](./LICENSE)），已保留上游版权声明。
- 上游与本分支无隶属关系；上游不对本分支的问题负责，也请把本分支的 issue 提到本仓库而不是上游仓库。

## 与上游的差异（截至目前）

| 项目 | 上游 roll-bot | 本仓库 giveaway |
| --- | --- | --- |
| 包名 / 插件名 | `koishi-plugin-roll-bot` | `koishi-plugin-giveaway` |
| 指令根 | `roll`、`remind` 两个根 | 统一到 `giveaway`（提醒器管理为 `giveaway.reminder.*`） |
| 单字母别名 | `r`、`rd`、`d` | **已移除**（空前缀配置下极易误触，且 `r` 与骰子类插件冲突） |
| 事件总线 | `roll-bot/xxx` | `giveaway/xxx` |
| 配置界面 | `usage` + `basic.adminUsers` 等 | 重写为 `basic` / `permission` / `join` / `remind` 四组；管理员改用 Koishi 权限等级 |
| 参与条件 | 无 | 新增 `join` 组：群聊等级 / 最近发言 / 互动标识（火、炽焰、龙王） |
| 荣誉取数 | NapCat `get_group_honor_info`（QQ 改版后已失效） | 改用 QQ 新版网页接口，含 `bkn` 鉴权与多变体自动探测 |
| 群管理员判定 | `roles[0]` 与字符串比较（**恒为 false**） | 修复：兼容对象数组；拿不到角色信息时不再一律放行 |
| 诊断能力 | 无 | 新增 `giveaway.debug.honor` / `giveaway.debug.member` |
| 构建 | 依赖 koishi-app 工作区工具链 | 自带 `npm run build`（esbuild + js-yaml，仅 devDependencies） |
| 内部领域命名 | `roll` | 保持不变（数据库表 `roll`、字段 `roll_code` 等，便于与上游源码对照） |
| 默认文档链接 | 上游文档站 | 本仓库 |

后续规划：创建抽奖时可选自定义参与条件（per-roll 覆盖）、Web 控制台面板、开奖结果图片渲染。

## 安装

```bash
npm i koishi-plugin-giveaway
```

或在 Koishi 控制台的「插件市场」中搜索 `giveaway` 安装。

依赖的服务（插件会在服务缺失时静默不注册，务必确认都已启用）：

- `database` —— 任意数据库插件（SQLite / MySQL / PostgreSQL / Memory 均可）
- `assets` —— 资源存储，例如 `koishi-plugin-assets-local`；**它自身依赖 `server`**，因此 `server` 也必须启用

## 指令

所有指令都挂在 `giveaway`（别名 `抽奖`）下，子指令需写全路径或使用其别名。`giveaway.h` 一类短别名需连同 `giveaway` 一起输入。

### 创建抽奖：复制模板填写

```
> 创建抽奖
< 请复制下面这份模板，把每一项填好后发回给我（不需要的项留空即可）：
< 奖品：
< 开奖时间：
< 加入口令：
< 标题：
< 描述：
< 参与条件：等级≥40 活跃≥1
< 说明一：奖品格式为「名称*数量」，多个奖品用逗号或空格分隔；开奖时间格式为「年-月-日-时-分」，留空表示不自动开奖。
< 说明二：「参与条件」一行可以不改（沿用控制台配置）、删空（本抽奖不做限制），或照「等级≥40 活跃≥1 连续≥7 标识=群聊炽焰,龙王 模式=任一」改写（不需要的项删掉即可）。
> 奖品：显卡*1，鼠标*2
> 开奖时间：09-15-20-00
> 加入口令：参加
> 标题：
> 描述：
> 参与条件：等级≥60 标识=龙王          ← 这一个抽奖单独提高门槛
< 创建抽奖成功，编号为 5645
```

熟手也可以跳过模板，直接带参数创建（零问答）：

```
抽奖 add 显卡*1 09-15-20-00 参加
抽奖 add -t "双十一抽奖" -d "满 40 级可参加" -r 显卡*1 n 参加
```

规则：

- 解析**按标签**（`奖品：` / `开奖时间：` / `加入口令：` / `标题：` / `描述：`）取值，群里随口一句不会被误当成奖品；
  整段复制粘贴也没关系（模板里的说明行会被忽略），半角/全角冒号都认，英文/德文标签同样识别
- **留空的项按默认处理**：开奖时间留空 = 不自动开奖，**口令留空 = 不使用加入口令**（此时群友只能用 `抽奖加入 <编号>` 参与），标题/描述留空 = 用默认值
- 口令不为空时，创建成功的那句提示会**带上口令**（`创建抽奖成功，编号为 5645；加入口令：参加`），方便创建者直接转发
- 只有**奖品**是必填；缺奖品、开奖时间格式不对、回复 `q` / `取消`、或不回复 → **直接取消创建**（不追问），重新发送 `创建抽奖` 即可
- 奖品格式 `名称*数量`（数量可省，默认 1）；多个奖品用**逗号或空格**分隔，都支持：

  | 写法 | 结果 |
  | --- | --- |
  | `显卡*1，鼠标*2` / `显卡*1,鼠标*2` | 2 个奖品（全角 / 半角逗号） |
  | `显卡*1、鼠标*2` | 2 个奖品（顿号） |
  | `显卡*1 鼠标*2` / `显卡 鼠标` | 2 个奖品（空格，数量可省） |
  | `显卡*1\|鼠标*2` | 2 个奖品（旧的竖线仍兼容） |

  注意奖品名里不要含空格或逗号（会被当成分隔符）；口令放在最后且可含空格
- 模板里填的值优先于 `-t` / `-d`；`-r` 允许同一个中奖人重复被抽中
- **参与条件**（模板最后一行）：直接显示控制台当前配置，创建者有三种选择 —— 不改动 = 沿用控制台配置；删空 = 这个抽奖不限制；改写 = 自定义（写法 `等级≥40 活跃≥1 连续≥7 标识=群聊炽焰,龙王 模式=任一`，不需要的项删掉即可）。没写到的维度（如龙王口径）自动沿用控制台配置

## 配置

在 Koishi 控制台的插件配置页可视化编辑，分为四组：

| 分组 | 字段 | 说明 |
| --- | --- | --- |
| `basic` | `cacheHours` | 开奖后抽奖记录的保留时长（小时），默认 `72` |
| | `defaultTimeOffset` | 未设置时区的用户默认使用的时区偏移，默认 `+8` |
| `permission` | `authorityCreate` | 创建抽奖所需的最低权限等级，默认 `1` |
| | `authorityManage` | 管理**他人**抽奖（删除 / 手动开奖 / 提醒器）所需的最低权限等级，默认 `3` |
| | `allowGuildAdminDelete` | 允许群主与群管理员删除本群抽奖，默认开启 |
| | `allowGuildAdminEnd` | 允许群主与群管理员对本群抽奖手动开奖，默认开启 |
| `join` | `minGroupLevel` | 参与抽奖所需的最低**群聊等级**（1~100），默认 `0`（不限制） |
| | `minActiveDays` | 要求最近 N 天内在本群发过言，默认 `0`（不限制） |
| | `minContinuousDays` | 要求**最长连续发言天数**不低于 N，默认 `0`（不限制） |
| | `requiredHonors` | 要求持有的 QQ 群**互动标识**（群聊之火 / 群聊炽焰 / 龙王），默认不限制 |
| | `honorMode` | 勾选多个标识时是「满足任意一个」还是「必须全部满足」，默认任意一个 |
| | `dragonScope` | 「龙王」的判定口径：昨日活跃榜（默认）/ 仅当前龙王 |
| | `onFetchError` | 取不到成员/荣誉数据时放行还是拒绝，默认放行 |
| | `cacheMinutes` | 群荣誉数据的缓存时长（分钟），默认 `5` |
| `remind` | `defaultReminders` | 新建抽奖时默认启用的提醒器（定时提醒器 / 结束前提醒器） |

### 参与条件

参与条件在**抽奖口令加入**与 `giveaway.join` 指令两条路径上都会检查；两项都满足才计入参与名单，拒绝时会回带「你当前多少级 / 需要多少级」这类具体原因。

| 条件 | 数据来源 | 字段 | 备注 |
| --- | --- | --- | --- |
| 群聊等级 | OneBot `get_group_member_info` | `level` | NapCat 取 QQ NT 的 `memberRealLevel`，即群聊等级（1~100） |
| 最近发言 | OneBot `get_group_member_info` | `last_sent_time` | 不依赖 QQ 网页接口，比互动标识稳定，建议作为兜底 |
| 最长连续发言天数 | QQ 网页接口（火/炽焰榜） | `day_count_max` | 与官方「群聊之火 7 天 / 群聊炽焰 30 天」同源，但门槛可自定义；QQ 榜单只收录连续 ≥7 天的人，门槛建议 ≥7 |
| 群聊之火（连续发言） | QQ 网页接口 `/cgi-bin/qunapp/honor_continuous` | `continuous_type=2` | 返回带 `day_count`（连续天数） |
| 群聊炽焰（连续 30 天） | 同上 | `continuous_type=3` | 持有炽焰者不再出现在火列表，插件自动把炽焰视为满足 7 天 |
| 龙王（昨日最活跃） | QQ 网页接口 `/cgi-bin/qunapp/honor_talkative` | `talkative_list` / `current_talkative` | 默认看昨日活跃榜；`dragonScope: current` 时必须是榜单第一名本人 |

**为什么荣誉不走 OneBot 标准接口**：NapCat 的 `get_group_honor_info` 依赖 `qun.qq.com/interactive/honorlist` 页面里的 `window.__INITIAL_STATE__`，而该页已改版为 Vite SPA（变量不复存在），于是它**静默返回空列表**（截至 v4.18.19 仍未修复）。因此本插件改为：先用 OneBot 接口（未来修复即可自动生效），取不到数据时自动改用 QQ 新版网页接口兜底——后者通过 OneBot 的 `get_cookies` 取 `qun.qq.com` 的登录态，并归一化成同一套结构。

注意事项：

- 网页荣誉接口依赖登录 Cookie，比成员信息慢、也更容易失败，因此按「群 + 类型」缓存（`cacheMinutes`），且只请求配置里真正用到的类型；
- 两条路径都取不到数据时按 `onFetchError` 处理；荣誉列表返回全空也会被当作「取不到数据」（真实群聊榜上至少会有人），避免误判成「你没有标识」；
- 非 OneBot 平台（如 Discord）拿不到这些接口，会跳过参与条件检查；
- 排查用管理员指令：`giveaway.debug.honor`（诊断荣誉接口）、`giveaway.debug.member [用户]`（诊断群成员等级/发言），两者都会把原始 JSON 写进插件日志。

### 权限模型

权限完全沿用 Koishi 自身的等级体系（用户表的 `authority` 字段由 `@koishijs/core` 提供，用户首次被观察到时按应用配置 `autoAuthorize` 写入，默认 `1`）：

| 等级 | 含义 |
| --- | --- |
| `0` | 封禁 |
| `1` | 普通用户 |
| `3` | 管理员 |
| `4` | 超级管理员 |

用 `admin user.authorize <等级>` 指令（需要 `@koishijs/plugin-admin`）或控制台的用户页面调整等级——**本插件不再维护独立的「管理员用户名单」**。此外：

- **群主与群管理员**始终可以创建抽奖，并可在开关允许时管理本群的抽奖（通过 OneBot 事件的群成员角色判定）；
- **抽奖的创建者**始终可以管理自己创建的抽奖。

## 事件

插件通过 Koishi 事件总线向外暴露生命周期事件，便于其它插件联动（前缀为 `giveaway/`）：

`giveaway/roll-add`、`giveaway/roll-end`、`giveaway/roll-expired`、`giveaway/roll-join`、`giveaway/roll-quit`、`giveaway/roll-key-update`、`giveaway/reminder-add`、`giveaway/reminder-delete`、`giveaway/remind-add`、`giveaway/remind-delete`、`giveaway/remind-broadcast`

## 开发

```bash
npm install
npm run build         # tsc 生成 lib/*.d.ts + esbuild 打包 lib/index.js
npm run build:watch   # 监听源码重新打包
npm run clean
```

构建脚本 `scripts/build.mjs` 只依赖本地 devDependencies（esbuild + js-yaml），语言包 `.yml` 由 js-yaml 解析后交给 esbuild 的 json loader；`koishi` 等运行时依赖保持 external。

本地接入 Koishi 应用时（例如 `file:../roll-bot` 依赖），改完代码需要重新 `yarn install` 刷新副本并重启应用才生效；纯配置值（等级阈值、开关等）可以在控制台热改，只有字段结构变更才需要重启。

## 许可证

[MIT](./LICENSE) © 2024 Roll Bot Project（上游），2026 giveaway contributors（本分支修改）
