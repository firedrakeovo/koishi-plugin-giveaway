import {Context} from 'koishi';
import {Config} from '../../config';
import {hasPermission, isGuildAdmin, hasAuthority, isRollCreator} from "../../util/role";

export function deleteRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.delete <rollCode>")
    .alias('删除抽奖')
    .alias('giveaway.rm')
    .action(async ({session}, rollCode) => {
      // check arg
      if (!rollCode) return session.text('.empty')
      const rollRes = await ctx.database.get('roll', {roll_code: rollCode})
      if (rollRes.length === 0) return session.text('.notFound')
      // check range
      const rollChannelRes = await ctx.database.get('roll_channel', {roll_id: rollRes[0].id, channel_id: session.channelId, channel_platform: session.platform})
      if (rollChannelRes.length === 0) return session.text('.notFound')
      // auth
      const rollCreatorRes = await ctx.database.get('roll_creator', {roll_id: rollRes[0].id})
      if (config.permission.allowGuildAdminDelete) {
        if (!hasPermission(
          hasAuthority(session, config.permission.authorityManage),
          await isRollCreator(session, rollCreatorRes[0].user_id),
          isGuildAdmin(session)
        )) return session.text('.noAuth')
      } else {
        if (!hasPermission(
          hasAuthority(session, config.permission.authorityManage),
          await isRollCreator(session, rollCreatorRes[0].user_id),
        )) return session.text('.noAuth')
      }

      ctx.emit('giveaway/roll-expired', rollRes[0].id)
      return session.text('.success', [rollCode])
    })
}
