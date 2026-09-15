import {Context, $} from 'koishi';
import {DateTime} from 'luxon'
import {Config} from '../../config';
import {getWinnerList} from "../../util/winnerGenerator";
import {rollEndMsgFromRollId} from "../../util/messageBuilder";
import {channelLocaleList, hasPuppeteer, rollEndImage} from "../../util/render";
import {bots, expireManager} from "../../index";

export function rollEndListener(ctx: Context, config: Config) {
  ctx.on('giveaway/roll-end', async (rollId) => {
    const res = await ctx.database.get('roll', {id: rollId, isEnd: 0})
    if (res.length === 0) return
    const roll = res[0]
    // Generate winner
    const winnerList = await getWinnerList(ctx, roll.id)
    // Write to user_prize
    for (const winnerPrize of winnerList) {
      const r = await ctx.database.get('user_prize', {user_id: winnerPrize.userId, prize_id: winnerPrize.prizeId})
      if (r.length === 0) {
        await ctx.database.create('user_prize', {user_id: winnerPrize.userId, prize_id: winnerPrize.prizeId, amount: 1})
      } else {
        await ctx.database.set('user_prize', {user_id: winnerPrize.userId, prize_id: winnerPrize.prizeId}, (row) => ({amount: $.add(row.amount, 1),}))
      }
    }
    // Change roll status
    await ctx.database.set('roll', roll.id, {
      isEnd: 1,
      endTime: roll.endTime? roll.endTime : DateTime.now().toUTC().toJSDate()
    })
    // Broadcast roll end message
    const rollOpenRange = await ctx.database.get('roll_channel', {roll_id: roll.id})
    // support i18n
    for (const item of rollOpenRange) {
      for (const bot of bots) {
        if (bot.platform === item.channel_platform) {
          // 图片版开奖结果（可选依赖 puppeteer）：渲染失败时回退为原来的完整文字消息
          let msg: any = null
          if (config.render?.result && hasPuppeteer(ctx)) {
            const locales = await channelLocaleList(ctx, item.channel_id, item.channel_platform)
            // 传入当前 bot：用它取中奖者的昵称与头像
            msg = await rollEndImage(ctx, roll, locales, bot as any, config.render?.avatar !== false, { style: config.render?.style, banner: config.render?.banner })
          }
          if (!msg) msg = await rollEndMsgFromRollId(ctx, config, roll, item)
          bot.sendMessage(item.channel_id, msg)
        }
      }
    }
    // remove join key listener
    ctx.emit('giveaway/roll-key-update')
    // disable all reminds
    const remindRes = await ctx.database.get('remind', {roll_id: roll.id})
    for (const remind of remindRes) {
      ctx.emit('giveaway/remind-delete', remind.id)
    }
    // register expire listener
    const expireTime = DateTime.now().plus({hours: config.basic.cacheHours}).toUTC().toJSDate()
    expireManager.addJob(roll.id, expireTime, function () {
      ctx.emit('giveaway/roll-expired', roll.id)
    })
  })
}
