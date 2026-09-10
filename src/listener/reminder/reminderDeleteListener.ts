import {Context, $} from 'koishi'
import {Config} from '../../config'

export function reminderDeleteListener(ctx: Context, config: Config) {
  ctx.on('giveaway/reminder-delete', async (
    userId,
    reminderId
  ) => {
    await ctx.database.remove('user_reminder', {user_id: userId, reminder_id: reminderId})

    const remindRes = await ctx.database.get('remind', {reminder_id: reminderId})

    for (const remind of remindRes) {
      const rollCreatorRes = await ctx.database.get('roll_creator', {roll_id: remind.roll_id})
      if (rollCreatorRes[0].user_id === userId) {
        ctx.emit('giveaway/remind-delete', remind.id)
      }
    }
    // Check if the reminder is still in use, if not, remove it
    const userReminderRes = await ctx.database.get('user_reminder', {reminder_id: reminderId})
    if (userReminderRes.length === 0) {
      ctx.database.remove('reminder', [reminderId])
    }
  })
}
