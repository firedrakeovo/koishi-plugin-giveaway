import {Context} from 'koishi';
import {Config} from '../../config';
import {rollListMsgFromChannelId} from "../../util/messageBuilder";
import {collectRollList, hasPuppeteer, rollListImage} from '../../util/render';
import {getCurrentUTCOffset} from '../../util/time';

export function listRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.list [platform] [channelId]")
    .alias('giveaway.ls')
    .alias('抽奖列表')
    .alias('在抽啥')
    .userFields(['offset'])
    .channelFields(['offset'])
    .action(async ({session}, platform, channelId) => {
      if (channelId === undefined) channelId = session.channelId
      if (platform === undefined) platform = session.platform
      // 图片渲染（可选依赖 puppeteer）：出图失败 / 没有数据时自动回退为文字列表
      if (config.render?.list && hasPuppeteer(ctx)) {
        const data = await collectRollList(ctx, channelId, platform)
        if (data) {
          const offset = await getCurrentUTCOffset(ctx, session, config)
          const image = await rollListImage(ctx, session, data, offset)
          if (image) return image
        }
      }
      return await rollListMsgFromChannelId(session, channelId, platform)
    })
}
