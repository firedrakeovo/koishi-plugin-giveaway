import { Schema } from "koishi"
import zhCN from './locales/zh-CN.yml'
import enUS from './locales/en-US.yml'
import deDE from './locales/de-DE.yml'

namespace BasicConfig {
  export interface Config {
    cacheHours: number
    defaultTimeOffset: string
  }
}

namespace PermissionConfig {
  export interface Config {
    authorityCreate: number
    authorityManage: number
    allowGuildAdminDelete: boolean
    allowGuildAdminEnd: boolean
  }
}

namespace JoinConfig {
  export interface Config {
    minGroupLevel: number
    minActiveDays: number
    minContinuousDays: number
    requiredHonors: HonorRequirement[]
    honorMode: 'any' | 'all'
    dragonScope: 'list' | 'current'
    onFetchError: 'allow' | 'deny'
    cacheMinutes: number
  }
}

/** 可选的互动标识（QQ 群荣誉）条件 */
export type HonorRequirement = 'fire7' | 'fire30' | 'dragon'

/**
 * 图片渲染（可选依赖 puppeteer）
 *
 * 启用后，抽奖列表与开奖结果会用 HTML 模板渲染成图片发送；
 * 未安装 / 未启用 `koishi-plugin-puppeteer`，或渲染失败时自动回退为文字消息。
 */
namespace RenderConfig {
  export interface Config {
    style: 'default' | 'anime' | 'gothic' | 'avemujica'
    /** 可选头图（http(s) / data: / file: URL 或本机绝对路径），用于卡片顶部横幅 */
    banner: string
    create: boolean
    list: boolean
    result: boolean
    avatar: boolean
  }
}

/**
 * 开奖提醒的默认规则表（按「剩余时长区间」分档，提醒位置 = 剩余时长的百分比）。
 *
 * - `maxDuration`：该行的时长上限（`30m` / `1h` / `5h` / `1d` / `7d`；`0` 或留空 = 不限）；
 *   一个抽奖只命中**上限最小且 ≥ 自身时长**的那一行，所以默认每场只提醒一次。
 * - `percent`：提醒位置，剩余时长的百分比（`20` = 开奖前 20% 处）；同一行写多个（`20,10`）就是多次提醒。
 *
 * 默认：≤1 小时按 20%、1~5 小时按 15%、5 小时~1 天按 10%、1 天以上按 10%
 *（1 小时场次 → 开奖前 12 分钟；5 小时场次 → 开奖前 45 分钟；7 天场次 → 开奖前约 16.8 小时）。
 */
export const DEFAULT_REMIND_RULES: RemindConfig.Rule[] = [
  { maxDuration: '1h', percent: '20' },
  { maxDuration: '5h', percent: '15' },
  { maxDuration: '1d', percent: '10' },
  { maxDuration: '0', percent: '10' },
]

export namespace RemindConfig {
  export interface Rule {
    /** 时长上限：`30m` / `1h` / `5h` / `1d` / `7d`；`0` 或留空 = 不限（兜底行） */
    maxDuration: string
    /** 提醒位置：剩余时长的百分比，可写多个用逗号分隔（如 `20,10`） */
    percent: string
  }
  export interface Config {
    /** 按剩余时长分档的提醒规则（留空 = 不提醒） */
    rules: Rule[]
  }
}

export interface Config {
  basic: BasicConfig.Config
  permission: PermissionConfig.Config
  join: JoinConfig.Config
  render: RenderConfig.Config
  remind: RemindConfig.Config
}

/**
 * Koishi 权限等级（与 @koishijs/plugin-admin 保持一致）
 *
 * 用户表中的 `authority` 字段由 @koishijs/core 提供，
 * 用户首次被观察到时按应用配置 `autoAuthorize`（默认 1）写入，
 * 可以用 `admin user.authorize <等级>` 指令或控制台的用户页面调整。
 */
export const Authority = {
  /** 封禁 */
  banned: 0,
  /** 普通用户 */
  user: 1,
  /** 管理员 */
  admin: 3,
  /** 超级管理员 */
  root: 4,
} as const

const basicConfig: Schema<BasicConfig.Config> = Schema.object({
  cacheHours: Schema.natural().default(72),
  defaultTimeOffset: Schema.string()
    .pattern(/^[+-](0?[0-9])(?::([0-5]?[0-9])(?::([0-5]?[0-9]))?)?$/)
    .default("+8"),
})

const permissionConfig: Schema<PermissionConfig.Config> = Schema.object({
  authorityCreate: Schema.natural().max(4).default(Authority.user),
  authorityManage: Schema.natural().max(4).default(Authority.admin),
  allowGuildAdminDelete: Schema.boolean().default(true),
  allowGuildAdminEnd: Schema.boolean().default(true),
})

const joinConfig: Schema<JoinConfig.Config> = Schema.object({
  minGroupLevel: Schema.natural().max(100).default(0),
  minActiveDays: Schema.natural().max(365).default(0),
  minContinuousDays: Schema.natural().max(365).default(0),
  // 每个候选项都要 required：控制台里新增的空行值是 null，而 schemastery-vue 判定选项是否
  // 「匹配」时用的是 `optional(schema)(null)`，非 required 的 const 会接受 null —— 结果是空行
  // 在界面上显示成第一个选项（群聊之火），实际存的却是 null，看起来「选了 3 个只生效 2 个」。
  // 加上 required 后空行在界面上显示为空，用户能一眼看出哪一行没选值。
  requiredHonors: Schema.array(Schema.union([
    Schema.const('fire7').description('群聊之火（连续发言 7 天）').required(),
    Schema.const('fire30').description('群聊炽焰（连续发言 30 天）').required(),
    Schema.const('dragon').description('龙王（昨日群聊最活跃）').required(),
  ])).default([]),
  honorMode: Schema.union([
    Schema.const('any'),
    Schema.const('all'),
  ]).default('any'),
  dragonScope: Schema.union([
    Schema.const('list'),
    Schema.const('current'),
  ]).default('list'),
  onFetchError: Schema.union([
    Schema.const('allow'),
    Schema.const('deny'),
  ]).default('allow'),
  cacheMinutes: Schema.natural().max(60).default(5),
})

const renderConfig: Schema<RenderConfig.Config> = Schema.object({
  style: Schema.union([
    Schema.const('default'),
    Schema.const('anime'),
    Schema.const('gothic'),
    Schema.const('avemujica'),
  ]).default('default'),
  banner: Schema.string().default(''),
  create: Schema.boolean().default(true),
  list: Schema.boolean().default(true),
  result: Schema.boolean().default(true),
  avatar: Schema.boolean().default(true),
})

const remindConfig: Schema<RemindConfig.Config> = Schema.object({
  rules: Schema.array(Schema.object({
    maxDuration: Schema.string()
      .description('时长上限：30m / 1h / 5h / 1d / 7d；0 或留空 = 不限'),
    percent: Schema.string()
      .description('提醒位置：剩余时长的百分比，如 20；写 20,10 表示提醒两次'),
  })).role('table').default(DEFAULT_REMIND_RULES),
})

export const Config: Schema<Config> = Schema.object({
  basic: basicConfig,
  permission: permissionConfig,
  join: joinConfig,
  render: renderConfig,
  remind: remindConfig,
}).i18n({
  "de-DE": deDE._config,
  "en-US": enUS._config,
  "zh-CN": zhCN._config,
})
