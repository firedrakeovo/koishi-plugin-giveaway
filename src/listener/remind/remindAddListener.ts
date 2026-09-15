import {Context, $} from 'koishi'
import {Config} from '../../config'
import {remindManager} from "../../index";
import {getRemindValueFromReminder} from "../../util/general";
import {scheduleRollReminds} from "../../util/rollRemind";

export function remindAddListener(ctx: Context, config: Config) {
  ctx.on('ready', async () => {
    const remindRes = await ctx.database
      .join(['remind', 'reminder'], (remind, reminder) => $.eq(remind.reminder_id, reminder.id))
      .execute()
    // remind from database
    for (const r of remindRes) {
      const rollRes = await ctx.database.get('roll', {id: r.remind.roll_id, isEnd: 0})
      const reminderRes = await ctx.database.get('reminder', {id: r.remind.reminder_id})
      if (rollRes.length != 0) {
        remindManager.addJob(r.remind.id, getRemindValueFromReminder(rollRes[0].endTime, reminderRes[0]), function () {
          ctx.emit('giveaway/remind-broadcast', r.remind.roll_id, r.remind.id)
        })
      }
    }
    // 开奖提醒：按控制台规则给所有未结束、有开奖时间的抽奖重建 job
    // （不知道原始创建时刻，就用「现在」当基准：已过去的提醒自然不会被排上）
    const rules = config.remind?.rules ?? []
    if (rules.length) {
      const rollRes = await ctx.database.get('roll', {isEnd: 0})
      for (const roll of rollRes) {
        if (!roll.endTime) continue
        scheduleRollReminds(((event, ...args) => ctx.emit(event as any, ...args)), roll.id, roll.endTime, rules)
      }
    }
  })
  ctx.on('giveaway/remind-add', async (
    rollCode,
    reminderCode,
  ) => {
    const rollRes = await ctx.database.get('roll', {roll_code: rollCode})
    const reminderRes = await ctx.database.get('reminder', {reminder_code: reminderCode})
    const rollChannelRes = await ctx.database.get('roll_channel', {roll_id: rollRes[0].id})
    const remindRes = await ctx.database.get('remind', {roll_id: rollRes[0].id, reminder_id: reminderRes[0].id})
    if (remindRes.length === 0) {
      const r = await ctx.database.create('remind', {roll_id: rollRes[0].id, reminder_id: reminderRes[0].id})
      await ctx.database.create('remind_channel', {
        remind_id: r.id,
        channel_id: rollChannelRes[0].channel_id,
        channel_platform: rollChannelRes[0].channel_platform
      })
      remindManager.addJob(r.id, getRemindValueFromReminder(rollRes[0].endTime, reminderRes[0]), function() {
        ctx.emit('giveaway/remind-broadcast', r.roll_id, r.id)
      })
    }
  })
}
