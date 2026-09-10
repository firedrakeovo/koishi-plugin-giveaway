import {Context} from 'koishi'
import {Config} from '../../config'
import {rollKeyCache} from '../../index'

export function keyCacheListener(ctx: Context, config: Config) {
  // init
  ctx.on('ready', async () => {
    rollKeyCache.content = await ctx.database.get('roll', {isEnd: 0})
  })

  ctx.on('giveaway/roll-key-update', async () => {
    rollKeyCache.content = await ctx.database.get('roll', {isEnd: 0})
  })
}
