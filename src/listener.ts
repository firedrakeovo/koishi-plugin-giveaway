import { Context } from "koishi"
import { Config } from "./config";

import {rollAddListener} from "./listener/roll/rollAddListener"
import {rollEndListener} from "./listener/roll/rollEndListener"
import {rollAutoEndListener} from "./listener/roll/rollAutoEndListener"
import {rollExpiredListener} from "./listener/roll/rollExpiredListener"
import {keyCacheListener} from "./listener/roll/keyCacheListener"
import {rollJoinListener} from "./listener/roll/rollJoinListener"
import {rollQuitListener} from "./listener/roll/rollQuitListener"

import {reminderAddListener} from "./listener/reminder/reminderAddListener"
import {reminderDeleteListener} from "./listener/reminder/reminderDeleteListener"

import {remindAddListener} from "./listener/remind/remindAddListener"
import {remindDeleteListener} from "./listener/remind/remindDeleteListener"
import {remindBroadcastListener} from "./listener/remind/remindBroadcastListener"


export const name = 'Listener'

declare module 'koishi' {
  interface Events {
    'giveaway/roll-key-update'(...args: any[]): void
    'giveaway/roll-add'(...args: any[]): void
    'giveaway/roll-end'(...args: any[]): void
    'giveaway/roll-expired'(...args: any[]): void
    'giveaway/roll-join'(...args: any[]): void
    'giveaway/roll-quit'(...args: any[]): void
    'giveaway/reminder-add'(...args: any[]): void
    'giveaway/reminder-delete'(...args: any[]): void
    'giveaway/remind-add'(...args: any[]): void
    'giveaway/remind-delete'(...args: any[]): void
    'giveaway/remind-broadcast'(...args: any[]): void
  }
}

export function apply(ctx: Context, config: Config) {
  keyCacheListener(ctx, config)
  rollAddListener(ctx, config)
  rollEndListener(ctx, config)
  rollAutoEndListener(ctx, config)
  rollExpiredListener(ctx, config)
  rollJoinListener(ctx, config)
  rollQuitListener(ctx, config)
  reminderAddListener(ctx, config)
  reminderDeleteListener(ctx, config)
  remindAddListener(ctx, config)
  remindDeleteListener(ctx, config)
  remindBroadcastListener(ctx, config)
}
