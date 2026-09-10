import {Context} from 'koishi'
import {Config} from '../../config'
import {autoEndManager, remindManager} from "../../index";
import {getRemindValueFromDefaultReminder} from "../../util/general";

export function rollAddListener(ctx: Context, config: Config) {
  ctx.on('giveaway/roll-add', async (
    session,
    roll,
    prizes,
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

    ctx.emit('giveaway/roll-key-update')
    // Apply default reminds
    for (const defaultRemind of config.remind.defaultReminders) {
      if (rollRes.endTime || defaultRemind.type != '1') {
        remindManager.addJob(rollRes.id, getRemindValueFromDefaultReminder(rollRes.endTime, defaultRemind, config), function () {
          ctx.emit('giveaway/remind-broadcast', rollRes.id)
        })
      }
    }
    // Create auto end job
    if (rollRes.endTime) {
      autoEndManager.addJob(rollRes.id, rollRes.endTime, function () {
        ctx.emit('giveaway/roll-end', rollRes.id)
      })
    }
  })
}
