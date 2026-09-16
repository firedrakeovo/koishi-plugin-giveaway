import {Context, h} from 'koishi';
import {Config} from '../../config';
import {rollMemberMsgFromRoll} from "../../util/messageBuilder";
import {hasPuppeteer, rollMemberImage} from "../../util/render";

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
      // 图片版参与名单（可选）：头像 + 昵称 + QQ 号，人数过多只显示前 50 个
      if (config.render?.member !== false && hasPuppeteer(ctx)) {
        const image = await rollMemberImage(ctx, session, roll[0], {
          style: config.render?.style,
          banner: config.render?.banner,
          width: config.render?.width,
          memberLimit: config.render?.memberLimit,
        })
        if (image) return [...h.parse(image)]
      }
      return await rollMemberMsgFromRoll(session, roll[0])
    })
}
