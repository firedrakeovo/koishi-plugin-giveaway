import { Schema } from "koishi"
import zhCN from './locales/zh-CN.yml'
import enUS from './locales/en-US.yml'
import deDE from './locales/de-DE.yml'

// support usage i18n
namespace Usage {
  export interface Config {
    docs: string
  }
}

namespace BasicConfig {
  export interface Config {
    adminUsers: string[]
    cacheHours: number
    defaultTimeOffset: string
  }
}

namespace PermissionConfig {
  export interface Config {
    allowGuildAdminDelete: boolean
    allowGuildAdminEnd: boolean
    allowNormalUserAdd: boolean
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
  usage: Usage.Config
  basic: BasicConfig.Config
  permission: PermissionConfig.Config
  remind: RemindConfig.Config
}

const usage: Schema<Usage.Config> = Schema.object({
  docs: Schema.string().role('link').default('https://github.com/firedrakeovo/koishi-plugin-giveaway').disabled()
});

const basicConfig: Schema<BasicConfig.Config> = Schema.object({
  adminUsers: Schema.union([
    Schema.array(String),
    Schema.transform(String, adminUsers => [adminUsers]),
  ]).default([""]),
  cacheHours: Schema.number().default(72),
  defaultTimeOffset: Schema.string().pattern(/^[+-](0?[0-9])(?::([0-5]?[0-9])(?::([0-5]?[0-9]))?)?$/).default("+8")
});

const permissionConfig: Schema<PermissionConfig.Config> = Schema.object({
  allowGuildAdminDelete: Schema.boolean().default(true),
  allowGuildAdminEnd: Schema.boolean().default(true),
  allowNormalUserAdd: Schema.boolean().default(true)
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
  ).role('table').default([{type: '1', value: '0-0-0-1-0'}])
})

export const Config: Schema<Config> = Schema.object({
  usage: usage,
  basic: basicConfig,
  permission: permissionConfig,
  remind: remindConfig
}).i18n({
  "de-DE": deDE._config,
  "en-US": enUS._config,
  "zh-CN": zhCN._config,
})
