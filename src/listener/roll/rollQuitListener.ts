import {Context} from 'koishi';
import {Config} from '../../config';

export function rollQuitListener(ctx: Context, config: Config) {
  ctx.on('giveaway/roll-quit', async (
    session,
    user_id,
    roll_id,
    roll_code
  ) => {
    // 开奖后名单已定，不再允许退出（否则中奖名单会与开奖结果不一致）
    const rollRes = await ctx.database.get('roll', {id: roll_id})
    if (rollRes.length === 0) {
      return session.sendQueued(session.text('events.quit.notFound'))
    }
    if (rollRes[0].isEnd) {
      return session.sendQueued(session.text('events.quit.ended', {rollCode: roll_code}))
    }
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
