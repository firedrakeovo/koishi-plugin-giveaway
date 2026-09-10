import {Context} from 'koishi';
import {DateTime} from 'luxon';
import {Config} from '../../config';
import {autoEndManager, expireManager, globalState} from "../../index";

export function rollExpiredListener(ctx: Context, config: Config) {
  // init
  ctx.on('ready', async () => {
    // Get all expired rolls, and emit roll-bot/roll-expired
    const expiredRolls = await ctx.database.get('roll', {isEnd: 1})
    expiredRolls.forEach((roll) => {
      let expireTime = DateTime.fromJSDate(roll.endTime).plus({hours: config.basic.cacheHours}).toUTC()
      if (expireTime < DateTime.now()) expireTime = DateTime.now().plus({hours: 1})
      const expireJobTime = expireTime.toJSDate()
      expireManager.addJob(roll.id, expireJobTime, function () {
        ctx.emit('giveaway/roll-expired', roll.id)
      })
    })
  })
  ctx.on('giveaway/roll-expired', async (rollId) => {
    // Delete roll from database
    ctx.database.remove('roll', {id: rollId})
    ctx.database.remove('roll_creator', {roll_id: rollId})
    ctx.database.remove('roll_member', {roll_id: rollId})
    ctx.database.remove('roll_channel', {roll_id: rollId})
    const rollPrizeRes = await ctx.database.get('roll_prize', {roll_id: rollId})
    for (const prize of rollPrizeRes) {
      ctx.database.remove('prize', {id: prize.prize_id})
    }
    ctx.database.remove('roll_prize', {roll_id: rollId})
    // Delete jobs
    autoEndManager.deleteJob(rollId)
    expireManager.deleteJob(rollId)
    // Delete remind
    const remindRes = await ctx.database.get('remind', {roll_id: rollId})
    for (const remind of remindRes) {
      ctx.emit('giveaway/remind-delete', remind.id)
    }
    // remove join key listener
    ctx.emit('giveaway/roll-key-update')
  })
}
