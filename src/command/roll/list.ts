import {Context} from 'koishi';
import {Config} from '../../config';
import {rollListMsgFromChannelId} from "../../util/messageBuilder";

export function listRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.list [platform] [channelId]")
    .alias('giveaway.ls')
    .alias('抽奖列表')
    .alias('在抽啥')
    .action(async ({session}, platform, channelId) => {
      if (channelId === undefined) channelId = session.channelId
      if (platform === undefined) platform = session.platform
      return await rollListMsgFromChannelId(session, channelId, platform)
    })
}
