import {Context} from 'koishi';
import {Config} from '../../config';

export function rollQuitListener(ctx: Context, config: Config) {
  ctx.on('giveaway/roll-quit', async (
    session,
    user_id,
    roll_id,
    roll_code
  ) => {
    const res = await ctx.database.get('roll_member', {roll_id: roll_id, user_id: user_id})
    if (res.length === 1) {
      await ctx.database.remove('roll_member', {roll_id: roll_id, user_id: user_id})
      session.sendQueued(session.text('events.roll.quit.success', {messageId: session.messageId, rollCode: roll_code}))
    }
    else {
      session.sendQueued(session.text('events.roll.quit.failed', {messageId: session.messageId, rollCode: roll_code}))
    }
  })
}
