import { Context } from 'koishi';
import { Config } from '../../config';
import {reminderListMsgFromUserId} from "../../util/messageBuilder";

export function listReminder(ctx: Context, config: Config) {
  ctx.command("giveaway.reminder.list")
    .alias('提醒器列表')
    .alias('giveaway.reminder.ls')
    .userFields(['id', 'offset'])
    .channelFields(['offset'])
    .action(async ({session}) => {
      const userId = session.user.id
      return await reminderListMsgFromUserId(session, userId, config)
    })
}
