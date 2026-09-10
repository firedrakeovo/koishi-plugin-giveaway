import { Context } from 'koishi';
import { Config } from '../../config';

export function joinRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.join <rollCode>")
    .alias('giveaway.j')
    .alias('加入抽奖')
    .action(async ({session}, rollCode) => {
      if (rollCode === undefined) return session.text('.empty')
      const res = await ctx.database.get('roll', {roll_code: rollCode}, ['id'])
      const rollId = res[0].id
      const channelId = session.channelId
      const channelPlatform = session.event.platform
      const roll_channel = await ctx.database.get('roll_channel', {roll_id: rollId, channel_id: channelId, channel_platform: channelPlatform})
      const bind = await ctx.database.get('binding', {platform: session.platform, pid: session.userId})
      if (roll_channel.length === 0) {
        return session.text('.failed')
      } else {
        ctx.emit('giveaway/roll-join',
          session,
          bind[0].aid,
          rollId,
          rollCode
        )
      }
    })
}
