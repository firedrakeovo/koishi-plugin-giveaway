import {Context} from 'koishi'
import {Config} from '../../config'
import {scheduleRollReminds} from "../../util/rollRemind";

/**
 * 开奖提醒的启动注册入口：机器人启动（ready）后，按控制台 `remind.rules` 给所有
 * 未结束、有开奖时间的抽奖排定提醒任务；新建抽奖时的排期在 rollAddListener 里。
 */
export function remindScheduleListener(ctx: Context, config: Config) {
  ctx.on('ready', async () => {
    // 不知道原始创建时刻，就用「现在」当基准算剩余时长：已过去的提醒自然不会被排上
    const rules = config.remind?.rules ?? []
    if (rules.length === 0) return
    const rollRes = await ctx.database.get('roll', {isEnd: 0})
    for (const roll of rollRes) {
      if (!roll.endTime) continue
      scheduleRollReminds(((event, ...args) => ctx.emit(event as any, ...args)), roll.id, roll.endTime, rules)
    }
  })
}
