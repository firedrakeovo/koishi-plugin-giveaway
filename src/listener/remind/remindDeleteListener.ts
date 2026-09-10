import {Context, $} from 'koishi'
import {Config} from '../../config'
import {remindManager} from "../../index";
import schedule from 'node-schedule'

export function remindDeleteListener(ctx: Context, config: Config) {
  ctx.on('dispose', () => {
    schedule.gracefulShutdown()
  })

  ctx.on('giveaway/remind-delete', async (remindId) => {
    ctx.database.remove('remind', {id: remindId})
    ctx.database.remove('remind_channel', {remind_id: remindId})
    remindManager.deleteJob(remindId)
  })
}
