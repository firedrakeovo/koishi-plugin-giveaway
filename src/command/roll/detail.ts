import {Context, h} from 'koishi';
import {Config} from '../../config';
import {rollDetailMsgFromRoll} from "../../util/messageBuilder";
import {getCurrentUTCOffset} from "../../util/time";
import {getCurrentLocales} from "../../util/locale";
import {hasPuppeteer, rollDetailImage} from "../../util/render";
import {pickLang, policyFromConfig, policyHasConditions, renderPolicy, rowToPolicy} from "../../util/rollPolicy";
import {logger} from "../../index";

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
      const currentOffset = await getCurrentUTCOffset(ctx, session, config)
      const currentLocales = getCurrentLocales(ctx, session, config)
      // 图片版详情（可选）：与创建成功时同一张卡片，另外带状态 / 参与人数 /（已开奖时）中奖名单
      if (config.render?.detail !== false && hasPuppeteer(ctx)) {
        const image = await detailImage(ctx, session, roll[0], currentOffset, config)
        if (image) return [...h.parse(image)]
      }
      return await rollDetailMsgFromRoll(session, roll[0], currentOffset, currentLocales[0], config)
    })
}

/** 把抽奖的奖品与生效中的参与条件取出来，交给 render 出详情图 */
async function detailImage(ctx: Context, session: any, roll: any, offset: string, config: Config): Promise<string | null> {
  const prizes: Array<{ name: string; amount: string | number }> = []
  for (const row of await ctx.database.get('roll_prize', {roll_id: roll.id})) {
    const prize = (await ctx.database.get('prize', {id: row.prize_id}))[0]
    if (prize) prizes.push({name: prize.name, amount: prize.amount})
  }
  // 参与条件：per-roll 覆盖优先，其次控制台全局配置（与文字详情一致）
  let policy = policyFromConfig(config)
  try {
    const policyRows = await ctx.database.get('roll_policy', {roll_id: roll.id})
    if (policyRows.length > 0) policy = rowToPolicy(policyRows[0])
  } catch (error: any) {
    logger.warn(`读取抽奖 ${roll.id} 的参与条件失败：${error?.message ?? error}`)
  }
  const conditions = policy && policyHasConditions(policy)
    ? renderPolicy(policy, pickLang(session))
    : session.text('messageBuilder.roll.detail.noCondition')
  return rollDetailImage(ctx, session, roll, prizes, offset, conditions, {
    style: config.render?.style,
    banner: config.render?.banner,
    width: config.render?.width,
    memberLimit: config.render?.memberLimit,
  })
}
