import { Context, Logger } from 'koishi'
import { Config } from "./config";
import {} from 'koishi-plugin-assets-local'
import * as Database from './database'
import * as Command from './command'
import * as Listener from './listener'
import RemindManager from './util/remindManager'
import AutoEndManager from "./util/autoEndManager"
import ExpireManager from "./util/expireManager"
import zhCN from './locales/zh-CN.yml'
import enUS from './locales/en-US.yml'
import deDE from './locales/de-DE.yml'

export const name = 'giveaway'

export const inject = ['database', 'assets']

export * from './config'

export const logger = new Logger('giveaway')
export const remindManager = new RemindManager()
export const autoEndManager = new AutoEndManager()
export const expireManager = new ExpireManager()
export let rollKeyCache = {
  content: []
}
export let bots
export let globalState = {
  remindInitialId: 10000,
}
export const schedule = require('node-schedule')

export async function apply(ctx: Context, config: Config) {
  // localization
  [['de-DE', deDE], ['en-US', enUS], ['zh-CN', zhCN]]
    .forEach(([lang, file]) => ctx.i18n.define(lang, file))
  // initialization
  ctx.on('ready', () => {
    bots = ctx.bots
  })
  ctx.on('login-updated', () => {
    bots = ctx.bots
  })
  ctx.plugin(Database)
  ctx.plugin(Listener, config)
  ctx.plugin(Command, config)
}
