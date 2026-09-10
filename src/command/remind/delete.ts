import { Context } from 'koishi';
import { Config } from '../../config';

export function deleteReminder(ctx: Context, config: Config) {
  ctx.command("giveaway.reminder.delete <reminderCode> [...rest]")
    .alias('删除提醒器')
    .alias('giveaway.reminder.rm')
    .userFields(['id'])
    .action(async ({session}, reminderCode, ...rest) => {
      // check arg
      const regex = /^\d{4}$/
      if (!regex.test(reminderCode)) return session.text(".emptyReminder")
      rest.push(reminderCode)

      const userId = session.user.id
      for (const reminderCode of rest) {
        const reminderRes = await ctx.database.get('reminder', {reminder_code: reminderCode})
        // check auth
        const userReminderRes = await ctx.database.get('user_reminder', {user_id: userId, reminder_id: reminderRes[0].id})
        if (userReminderRes.length === 0) return session.text(".notYourReminder")
        // delete
        ctx.emit('giveaway/reminder-delete', userId, reminderRes[0].id)
      }
      return session.text(".success")
    })
}
