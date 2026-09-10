import {Context} from 'koishi';
import {Config} from '../../config';
import {rollKeyCache} from "../../index";

export function rollJoinListener(ctx: Context, config: Config) {
  ctx.on('message', async (session) => {
    // TODO: Support img join key
    const content = session.content
    const channelId = session.channelId
    for (const roll of rollKeyCache.content) {
      if (content === roll.joinKey && !roll.isEnd) {
        const res = await ctx.database.get('roll_channel', {channel_id: channelId, channel_platform: session.event.platform})
        for (const rollChannel of res) {
          if (rollChannel.roll_id === roll.id) {
            let bind = await ctx.database.get('binding', {platform: session.platform, pid: session.userId})
            let attempts = 0
            while (bind.length === 0 && attempts < 3) {
              await new Promise(resolve => setTimeout(resolve, 1000))
              bind = await ctx.database.get('binding', {platform: session.platform, pid: session.userId})
              attempts++
            }
            if (bind.length > 0) {
              ctx.emit('giveaway/roll-join', session, bind[0].aid, roll.id, roll.roll_code)
            } else {
              session.sendQueued(session.text('events.join.error', {messageId: session.messageId}))
            }
          }
        }
      }
    }
    //console.log(session.content, rollKeyCache.content)
  })
  ctx.on('giveaway/roll-join', async (
    session,
    user_id,
    roll_id,
    roll_code
  ) => {
    const res = await ctx.database.get('roll_member', {roll_id: roll_id, user_id: user_id})
    if (res.length === 0) {
      await ctx.database.create('roll_member', {roll_id: roll_id, user_id: user_id})
      session.sendQueued(session.text('events.roll.add.success', {messageId: session.messageId, rollCode: roll_code}))
    }
    else {
      session.sendQueued(session.text('events.roll.add.failed', {messageId: session.messageId, rollCode: roll_code}))
    }
  })
}
