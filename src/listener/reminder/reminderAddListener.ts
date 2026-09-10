import {Context, $} from 'koishi'
import {Config} from '../../config'

export function reminderAddListener(ctx: Context, config: Config) {
  ctx.on('giveaway/reminder-add', async (
    session,
    reminder
  ) => {
    const reminderRes = await ctx.database.create('reminder', reminder)

    await ctx.database.create('user_reminder', {user_id: session.user.id, reminder_id: reminderRes.id})
  })
}
