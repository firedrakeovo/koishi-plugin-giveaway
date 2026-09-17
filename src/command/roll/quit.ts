import {Context} from 'koishi';
import {Config} from '../../config';
import {resolveAid} from '../../util/binding';

export function quitRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.quit <rollCode>")
    .alias('giveaway.q')
    .alias('退出抽奖')
    .action(async ({session}, rollCode) => {
      if (rollCode === undefined) return session.text('.empty')
      const res = await ctx.database.get('roll', {roll_code: rollCode}, ['id'])
      if (res.length === 0) return session.text('.notFound')
      const rollId = res[0].id
      const channelId = session.channelId
      const channelPlatform = session.event.platform
      const roll_channel = await ctx.database.get('roll_channel', {roll_id: rollId, channel_id: channelId, channel_platform: channelPlatform})
      if (roll_channel.length === 0) {
        return session.text('.failed')
      }
      const aid = await resolveAid(ctx, session)
      if (aid === undefined) return session.text('.noBinding')
      ctx.emit('giveaway/roll-quit', session, aid, rollId, rollCode)
    })
}
