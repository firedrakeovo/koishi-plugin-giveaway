import { Context } from 'koishi';
import { Config } from '../../config';
import {hasPermission, isPluginAdmin, isRollCreator} from "../../util/role";

export function enableRemind(ctx: Context, config: Config) {
  ctx.command("giveaway.reminder.enable <rollCode> <reminderCode> [...rest]")
    .alias('启用提醒器')
    .alias('giveaway.reminder.on')
    .userFields(['offset'])
    .channelFields(['offset'])
    .action(async ({session}, rollCode, reminderCode, ...rest) => {
      // arg check
      const regex = /^\d{4}$/
      if (!regex.test(rollCode)) return session.text(".emptyRoll")
      if (!regex.test(reminderCode)) return session.text(".emptyReminder")
      rest.push(reminderCode)
      const rollRes = await ctx.database.get('roll', {roll_code: rollCode})
      if (rollRes.length === 0) return session.text('.emptyRoll')
      if (rollRes[0].isEnd) return session.text('.rollEnd')
      for (const r of rest) {
        const reminderRes = await ctx.database.get('reminder', {reminder_code: r})
        if (reminderRes.length === 0) session.text('.emptyReminder')
      }
      // auth
      const rollId = rollRes[0].id
      const creatorRes = await ctx.database.get('roll_creator', {roll_id: rollId})
      const rollCreatorId = creatorRes[0].user_id
      if (!hasPermission(
        isPluginAdmin(session, config),
        await isRollCreator(session, rollCreatorId)
      )) return session.text('.noAuth')
      // enable
      for (const reminderCode of rest) {
        ctx.emit('giveaway/remind-add', rollCode, reminderCode)
      }
      return session.text('.success')
    })
}
