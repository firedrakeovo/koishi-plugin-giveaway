import { Context } from 'koishi'
import { Config } from "./config";

import {help} from './command/basic/help'
import {channel} from './command/basic/channel'
import {debugProbe} from './command/basic/debug'

import {addRoll} from './command/roll/add'
import {deleteRoll} from './command/roll/delete'
import {detailRoll} from './command/roll/detail'
import {endRoll} from './command/roll/end'
import {joinRoll} from './command/roll/join'
import {quitRoll} from './command/roll/quit'
import {listRoll} from './command/roll/list'
import {memberRoll} from './command/roll/member'

import {locale} from './command/i18n/locale'
import {time} from './command/i18n/time'


export const name = 'Command'

export function apply(ctx: Context, config: Config) {
  ctx.command('giveaway').alias('抽奖')
  help(ctx, config)
  channel(ctx, config)
  debugProbe(ctx, config)

  locale(ctx, config)
  time(ctx, config)

  addRoll(ctx, config)
  deleteRoll(ctx, config)
  detailRoll(ctx, config)
  endRoll(ctx, config)
  joinRoll(ctx, config)
  quitRoll(ctx, config)
  listRoll(ctx, config)
  memberRoll(ctx, config)
  // 手动创建/管理提醒器的指令已下线：开奖提醒改为控制台配置（remind.beforeEnd）后自动排期

}
