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
    create: boolean
    list: boolean
    result: boolean
    avatar: boolean
  }
}

export namespace RemindConfig {
  export interface Config {
    defaultReminders?: Array<{
      type: "0" | "1"
      value: string
    }>
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
  create: Schema.boolean().default(true),
  list: Schema.boolean().default(true),
  result: Schema.boolean().default(true),
  avatar: Schema.boolean().default(true),
})

const remindConfig: Schema<RemindConfig.Config> = Schema.object({
  defaultReminders: Schema.array(
    Schema.object({
      type: Schema.union([
        Schema.const('0'),
        Schema.const('1'),
      ]),
      value: Schema.string().pattern(/^\d{1,4}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/),
    })
  ).role('table').default([{ type: '1', value: '0-0-0-1-0' }])
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
