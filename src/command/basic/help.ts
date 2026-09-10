import {Context} from 'koishi';
import {Config} from '../../config';

export function help(ctx: Context, config: Config) {
  ctx.command("giveaway.help")
    .alias('抽奖帮助')
    .alias('giveaway.h')
    .action(({session}) => {
      return session.text('.help')
    })
}
