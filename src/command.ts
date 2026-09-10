import { Context } from 'koishi'
import { Config } from "./config";

import {help} from './command/basic/help'
import {channel} from './command/basic/channel'

import {addRoll} from './command/roll/add'
import {deleteRoll} from './command/roll/delete'
import {detailRoll} from './command/roll/detail'
import {endRoll} from './command/roll/end'
import {joinRoll} from './command/roll/join'
import {quitRoll} from './command/roll/quit'
import {listRoll} from './command/roll/list'
import {memberRoll} from './command/roll/member'
import {remindRoll} from './command/roll/remind'

import {locale} from './command/i18n/locale'
import {time} from './command/i18n/time'

import {addReminder} from './command/remind/add'
import {deleteReminder} from "./command/remind/delete"
import {listReminder} from "./command/remind/list"
import {enableRemind} from "./command/remind/enable"
import {disableRemind} from "./command/remind/disable"

export const name = 'Command'

export function apply(ctx: Context, config: Config) {
  ctx.command('giveaway').alias('抽奖')
  help(ctx, config)
  channel(ctx, config)

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
  remindRoll(ctx, config)

  ctx.command('giveaway.reminder')
  addReminder(ctx, config)
  deleteReminder(ctx, config)
  listReminder(ctx, config)

  enableRemind(ctx, config)
  disableRemind(ctx, config)
}
