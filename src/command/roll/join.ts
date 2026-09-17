import { Context } from 'koishi';
import { Config } from '../../config';
import { resolveAid } from '../../util/binding';

export function joinRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.join <rollCode>")
    .alias('giveaway.j')
    .alias('加入抽奖')
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
      // binding 可能还没落库，交给统一的解析函数（取不到就提示，不要下标访问）
      const aid = await resolveAid(ctx, session)
      if (aid === undefined) return session.text('.noBinding')
      ctx.emit('giveaway/roll-join', session, aid, rollId, rollCode)
    })
}
