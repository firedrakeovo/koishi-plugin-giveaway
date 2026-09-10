# koishi-plugin-giveaway

[![npm](https://img.shields.io/npm/v/koishi-plugin-giveaway?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-giveaway)
[![license](https://img.shields.io/npm/l/koishi-plugin-giveaway?style=flat-square)](./LICENSE)

一个多功能的 Koishi 群抽奖插件：交互式创建抽奖、成员参与、定时自动开奖、开奖前提醒，支持多语言与多时区，并提供频道、权限、提醒器三个维度的细粒度配置。

> A versatile giveaway plugin for Koishi: interactive giveaway creation, member participation, scheduled auto-draw and reminders, with i18n and multi-timezone support.

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
| 内部领域命名 | `roll` | 保持不变（数据库表 `roll`、字段 `roll_code` 等，便于与上游源码对照） |
| 默认文档链接 | 上游文档站 | 本仓库 |

后续规划：调整交互流程、增加抽奖参与条件、Web 界面与开奖结果图片渲染。

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

| 指令 | 别名 | 说明 |
| --- | --- | --- |
| `giveaway` | 抽奖 | Giveaway 抽奖功能 |
| `giveaway.help` | 抽奖帮助 / giveaway.h | 显示帮助信息 |
| `giveaway.channel` | giveaway.ch / 频道id | 获取当前频道的频道 id |
| `giveaway.locale` | 语言 | 修改语言偏好 |
| `giveaway.time` | 时区 | 修改时区 |
| `giveaway.add` | 创建抽奖 | 交互式地创建一个抽奖 |
| `giveaway.delete` | 删除抽奖 / giveaway.rm | 手动删除一个抽奖 |
| `giveaway.detail` | 抽奖详情 | 查询指定抽奖的详细描述 |
| `giveaway.end` | giveaway.draw / 开奖 | 手动进行开奖 |
| `giveaway.join` | giveaway.j / 加入抽奖 | 加入指定的抽奖 |
| `giveaway.quit` | giveaway.q / 退出抽奖 | 退出指定的抽奖 |
| `giveaway.list` | giveaway.ls / 抽奖列表 / 在抽啥 | 查询指定频道内的抽奖 |
| `giveaway.member` | giveaway.mem / 抽奖成员 | 查询指定抽奖的参与成员 |
| `giveaway.remind` | giveaway.rd / 抽奖提醒 | 查询抽奖启用的提醒 |
| `giveaway.reminder` | — | 提醒器管理 |
| `giveaway.reminder.add` | 创建提醒器 | 创建一个提醒器 |
| `giveaway.reminder.delete` | 删除提醒器 / giveaway.reminder.rm | 删除一个提醒器 |
| `giveaway.reminder.list` | 提醒器列表 / giveaway.reminder.ls | 查询提醒器列表 |
| `giveaway.reminder.enable` | 启用提醒器 / giveaway.reminder.on | 启用一个提醒器 |
| `giveaway.reminder.disable` | 禁用提醒器 / giveaway.reminder.off | 禁用一个提醒器 |

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
| | `requiredHonors` | 要求持有的 QQ 群**互动标识**（群聊之火 / 群聊炽焰 / 龙王），默认不限制 |
| | `honorMode` | 勾选多个标识时是「满足任意一个」还是「必须全部满足」，默认任意一个 |
| | `onFetchError` | 取不到成员/荣誉数据时放行还是拒绝，默认放行 |
| | `cacheMinutes` | 群荣誉数据的缓存时长（分钟），默认 `5` |
| `remind` | `defaultReminders` | 新建抽奖时默认启用的提醒器（定时提醒器 / 结束前提醒器） |

### 参与条件

参与条件在**抽奖口令加入**与 `giveaway.join` 指令两条路径上都会检查；两项都满足才计入参与名单，拒绝时会回带「你当前多少级 / 需要多少级」这类具体原因。

| 条件 | 数据来源 | 字段 | 备注 |
| --- | --- | --- | --- |
| 群聊等级 | OneBot `get_group_member_info` | `level` | NapCat 取 QQ NT 的 `memberRealLevel`，即群聊等级（1~100） |
| 最近发言 | OneBot `get_group_member_info` | `last_sent_time` | 不依赖 QQ 网页接口，比互动标识稳定，建议作为兜底 |
| 群聊之火（连续发言） | QQ 网页接口 `/cgi-bin/qunapp/honor_continuous` | `continuous_type=2` | 返回带 `day_count`（连续天数） |
| 群聊炽焰（连续 30 天） | 同上 | `continuous_type=3` | 持有炽焰者不再出现在火列表，插件自动把炽焰视为满足 7 天 |
| 龙王（昨日最活跃） | QQ 网页接口 `/cgi-bin/qunapp/honor_talkative` | `talkative_list` | 昨日群聊活跃榜 |

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
