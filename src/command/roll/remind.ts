import {Context} from 'koishi';
import {Config} from '../../config';
import {remindManager} from "../../index";
import {rollRemindMsgFromRollId} from "../../util/messageBuilder";

export function remindRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.remind <rollCode>")
    .alias('giveaway.rd')
    .alias('抽奖提醒')
    .action(async ({session}, rollCode) => {
      const rollRes = await ctx.database.get('roll', {roll_code: rollCode})
      if (rollRes.length === 0) return session.text('.notFound')
      return await rollRemindMsgFromRollId(session, config, rollRes[0].id)
    })
}
