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
import {normalizeRules} from "./util/remindPlan"
import zhCN from './locales/zh-CN.yml'
import enUS from './locales/en-US.yml'
import deDE from './locales/de-DE.yml'

export const name = 'giveaway'

// puppeteer 是可选的：没装 / 没启用时图片渲染自动关闭，插件其余功能照常工作
export const inject = {
  required: ['database', 'assets'],
  optional: ['puppeteer'],
}

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
  // 配置自检：开奖提醒规则表里被忽略的行（时长写不出来 / 百分比为空或越界）
  const { rules: usableRules, invalid: invalidRules } = normalizeRules(config.remind?.rules)
  if (invalidRules.length > 0) {
    logger.warn(`开奖提醒规则里有 ${invalidRules.length} 行无效（原始值 ${JSON.stringify(invalidRules)}），已忽略；这些行不会产生提醒。时长写 ${'30m / 1h / 5h / 1d / 7d'}（0 或留空 = 不限），百分比写 1~99（可写 20,10 表示提醒两次）。`)
  }
  if (usableRules.length === 0) {
    logger.info('开奖提醒规则表为空，本次不会有任何开奖前提醒。')
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
