import {Context} from 'koishi';
import {Config} from '../../config';
import {hasPermission, isGuildAdmin, isPluginAdmin, isRollCreator} from "../../util/role";

export function endRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.end [rollCode]")
    .alias('giveaway.draw')
    .alias('开奖')
    .userFields(['id'])
    .channelFields(['id'])
    .action(async ({session}, rollCode) => {
      if (!rollCode) {
        let msg = session.text('.wait.header')
        const resChannel = await ctx.database.get('roll_channel', {channel_id: session.channelId, channel_platform: session.platform})
        const resCreator = await ctx.database.get('roll_creator', {user_id: session.user.id})

        for (const e of resCreator) {
          for (const c of resChannel) {
            if (e.roll_id === c.roll_id) {
              const roll = await ctx.database.get('roll', e.roll_id)
              if (!roll[0].isEnd) msg += session.text('.wait.body.rollList', {roll_code: roll[0].roll_code, title: roll[0].title})
            }
          }
        }

        msg += session.text('.wait.footer')
        console.log(msg)
        await session.send(msg)
        const input = await session.prompt()
        if (!input) return session.text('commands.timeout')
        rollCode = input
      }
      let rollRes;
      rollRes = await ctx.database.get('roll', {roll_code: rollCode})
      if (rollRes.length === 0) return session.text('.notFound')
      // check range
      const rollChannelRes = await ctx.database.get('roll_channel', {roll_id: rollRes[0].id, channel_id: session.channelId, channel_platform: session.platform})
      if (rollChannelRes.length === 0) return session.text('.notFound')

      if (rollRes[0].isEnd) return session.text('.isEnd', [rollCode])
      const rollId = rollRes[0].id
      const creatorRes = await ctx.database.get('roll_creator', {roll_id: rollId})
      const rollCreatorId = creatorRes[0].user_id
      // auth
      if (config.permission.allowGuildAdminEnd) {
        if (!hasPermission(
          isPluginAdmin(session, config),
          isGuildAdmin(session),
          await isRollCreator(session, rollCreatorId)
        )) return session.text('.noAuth')
      } else {
        if (!hasPermission(
          isPluginAdmin(session, config),
          await isRollCreator(session, rollCreatorId)
        )) return session.text('.noAuth')
      }
      // emit end event
      ctx.emit('giveaway/roll-end', rollId)
    })
}
