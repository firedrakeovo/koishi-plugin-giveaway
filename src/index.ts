import { Context, Logger } from 'koishi'
import { Config } from "./config";
import {} from 'koishi-plugin-assets-local'
import * as Database from './database'
import * as Command from './command'
import * as Listener from './listener'
import RemindManager from './util/remindManager'
import AutoEndManager from "./util/autoEndManager"
import ExpireManager from "./util/expireManager"
import {honorLabel, invalidHonors} from "./util/rollPolicy"
import {normalizeHonors} from "./util/joinPolicy"
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
  // 配置自检：控制台里「互动标识」的空行会被存成 null，这些项会被忽略，提醒管理员一声
  const droppedHonors = invalidHonors(config.join?.requiredHonors)
  if (droppedHonors.length > 0) {
    const effective = normalizeHonors(config.join?.requiredHonors).map(honorLabel).join('、') || '无（不限制）'
    logger.warn(`参与条件「互动标识」里有 ${droppedHonors.length} 项为空或无效（原始值 ${JSON.stringify(droppedHonors)}），已忽略；当前实际生效：${effective}。请在控制台把空项删掉，或选上具体的互动标识。`)
  }
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
