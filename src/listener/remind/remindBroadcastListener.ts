import {Context} from 'koishi'
import {Config} from '../../config'
import {bots} from "../../index";
import { DateTime, Duration } from 'luxon'

export function remindBroadcastListener(ctx: Context, config: Config) {
  ctx.on('giveaway/remind-broadcast', async (rollId) => {
    let minutesDiff
    // 提醒只按抽奖找频道（控制台驱动的提醒不落库、也没有「提醒器」这一层）
    const remindRange = await ctx.database.get('roll_channel', {roll_id: rollId})
    const rollRes = await ctx.database.get('roll', {id: rollId})
    // 抽奖可能已经被手动删除 / 清理（提醒任务理论上会被一并取消，这里再兜一层，避免报错刷屏）
    if (!rollRes[0]) return
    const rollCode = rollRes[0].roll_code
    if (rollRes[0].endTime) {
      const end = DateTime.fromJSDate(rollRes[0].endTime, {zone: 'UTC'})
      const start = DateTime.utc()
      minutesDiff = end.diff(start, ['minutes'])
    }
    minutesDiff = minutesDiff.set({minutes: Math.ceil(minutesDiff.minutes)})

    if (rollRes[0].isEnd) return

    for (const item of remindRange) {
      for (const bot of bots ?? []) {
        if (bot.platform === item.channel_platform) {
          let locales
          const currentChannel = await ctx.database.get('channel', {id: item.channel_id, platform: item.channel_platform})
          if (!currentChannel[0] || currentChannel[0].locales.length === 0) {
            locales = ctx.root.options.i18n.locales
          } else {
            locales = currentChannel[0].locales
          }
          if (rollRes[0].endTime) {
            let diff = minutesDiff.reconfigure({locale: locales[0]}).rescale().toHuman()
            if (diff === '') diff = Duration.fromObject({minutes: 0}, {locale: locales[0]}).toHuman()
            const msg = ctx.i18n.render(locales, ['events.remind.broadcast.messageWithDiff'], {
              rollCode: rollCode,
              diff: diff
            })[0]
            bot.sendMessage(item.channel_id, msg)
          } else {
            const msg = ctx.i18n.render(locales, ['events.remind.broadcast.message'], {
              rollCode: rollCode
            })[0]
            bot.sendMessage(item.channel_id, msg)
          }
        }
      }
    }
  })
}
