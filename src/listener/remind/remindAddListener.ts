import {Context, $} from 'koishi'
import {Config} from '../../config'
import {globalState, remindManager} from "../../index";
import {getRemindValueFromDefaultReminder, getRemindValueFromReminder} from "../../util/general";

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
    // default remind from config
    for (const defaultRemind of config.remind.defaultReminders) {
      const rollRes = await ctx.database.get('roll', {isEnd: 0})
      for (const roll of rollRes) {
        if (roll.endTime || defaultRemind.type != '1') {
          remindManager.addJob(globalState.remindInitialId, getRemindValueFromDefaultReminder(roll.endTime, defaultRemind, config), function () {
            ctx.emit('giveaway/remind-broadcast', roll.id)
          })
          globalState.remindInitialId++
        }
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
