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

namespace RemindConfig {
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
  remind: remindConfig,
}).i18n({
  "de-DE": deDE._config,
  "en-US": enUS._config,
  "zh-CN": zhCN._config,
})
