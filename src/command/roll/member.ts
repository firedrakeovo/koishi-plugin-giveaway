import {Context} from 'koishi';
import {Config} from '../../config';
import {rollMemberMsgFromRoll} from "../../util/messageBuilder";

export function memberRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.member <rollCode>")
    .alias('giveaway.mem')
    .alias('抽奖成员')
    .action(async ({session}, rollCode) => {
      if (rollCode === undefined) return session.text('.empty')
      // find roll
      const roll = await ctx.database.get('roll', {roll_code: rollCode})
      if (roll.length === 0) return session.text('.notFound')
      // check visibility
      const rollChannel = await ctx.database.get('roll_channel', {roll_id: roll[0].id, channel_id: session.channelId, channel_platform: session.platform})
      if (rollChannel.length === 0) return session.text('.notFound')
      // get msg
      return await rollMemberMsgFromRoll(session, roll[0])
    })
}
