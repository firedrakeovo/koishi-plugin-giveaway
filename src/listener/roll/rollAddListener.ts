import {Context} from 'koishi'
import {Config} from '../../config'
import {autoEndManager} from "../../index";
import {scheduleRollReminds} from "../../util/rollRemind";
import {policyToRow} from "../../util/rollPolicy";

export function rollAddListener(ctx: Context, config: Config) {
  ctx.on('giveaway/roll-add', async (
    session,
    roll,
    prizes,
    extra = {} as { policy?: any },
  ) => {
    // Write to database
    const rollRes = await ctx.database.create('roll', roll)

    for (let prize of prizes) {
      const prizeRes = await ctx.database.create('prize', prize)
      await ctx.database.create('roll_prize', {
        roll_id: rollRes.id,
        prize_id: prizeRes.id
      })
    }

    await ctx.database.create('roll_creator', {
      roll_id: rollRes.id,
      user_id: session.user.id
    })
    await ctx.database.create('roll_channel', {
      roll_id: rollRes.id,
      channel_id: session.channelId,
      channel_platform: session.event.platform
    })

    // 参与条件与全局不同时，落一行 per-roll 覆盖（相同则不落，继续跟随控制台配置）
    if (extra?.policy) {
      await ctx.database.create('roll_policy', policyToRow(rollRes.id, extra.policy))
    }

    ctx.emit('giveaway/roll-key-update')
    // 开奖提醒（控制台按「剩余时长区间 + 百分比」配置）：只对填了开奖时间的抽奖生效；
    // 以创建时刻为基准算剩余时长，命中一行规则 → 默认只排一次提醒
    if (rollRes.endTime) {
      scheduleRollReminds(
        ((event, ...args) => ctx.emit(event as any, ...args)),
        rollRes.id,
        rollRes.endTime,
        config.remind?.rules,
      )
    }
    // Create auto end job
    if (rollRes.endTime) {
      autoEndManager.addJob(rollRes.id, rollRes.endTime, function () {
        ctx.emit('giveaway/roll-end', rollRes.id)
      })
    }
  })
}
