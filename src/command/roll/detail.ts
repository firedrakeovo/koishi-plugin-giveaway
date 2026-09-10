import {Context} from 'koishi';
import {Config} from '../../config';
import {rollDetailMsgFromRoll} from "../../util/messageBuilder";
import {getCurrentUTCOffset} from "../../util/time";
import {getCurrentLocales} from "../../util/locale";

export function detailRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.detail <rollCode>")
    .alias('抽奖详情')
    .action(async ({session}, rollCode) => {
      if (rollCode === undefined) return session.text('.empty')
      // find roll
      const roll = await ctx.database.get('roll', {roll_code: rollCode})
      if (roll.length === 0) return session.text('.notFound')
      // check range
      const rollChannel = await ctx.database.get('roll_channel', {roll_id: roll[0].id, channel_id: session.channelId, channel_platform: session.platform})
      if (rollChannel.length === 0) return session.text('.notFound')
      // get msg
      const currentOffset = await getCurrentUTCOffset(ctx, session, config)
      const currentLocales = getCurrentLocales(ctx, session, config)
      return await rollDetailMsgFromRoll(session, roll[0], currentOffset, currentLocales[0])
    })
}
