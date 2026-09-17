import {Context} from 'koishi';
import {Config} from '../../config';
import {logger, rollKeyCache} from "../../index";
import {checkJoinPolicy} from "../../util/joinPolicy";
import {resolveAid} from "../../util/binding";

export function rollJoinListener(ctx: Context, config: Config) {
  ctx.on('message', async (session) => {
    // TODO: Support img join key
    const content = session.content
    const channelId = session.channelId
    for (const roll of rollKeyCache.content) {
      // 口令为空的抽奖不接受关键词加入（否则内容为空的消息会误命中）
      if (roll.joinKey && content === roll.joinKey && !roll.isEnd) {
        const res = await ctx.database.get('roll_channel', {channel_id: channelId, channel_platform: session.event.platform})
        for (const rollChannel of res) {
          if (rollChannel.roll_id === roll.id) {
            // binding 可能还没落库：重试几次（关键词路径历史上就是 3 次 × 1s）
            const aid = await resolveAid(ctx, session, 3, 1000)
            if (aid !== undefined) {
              ctx.emit('giveaway/roll-join', session, aid, roll.id, roll.roll_code)
            } else {
              session.sendQueued(session.text('events.join.error', {messageId: session.messageId}))
            }
          }
        }
      }
    }
    //console.log(session.content, rollKeyCache.content)
  })
  ctx.on('giveaway/roll-join', async (
    session,
    user_id,
    roll_id,
    roll_code
  ) => {
    // 关键词与指令两条路径共用这里：统一校验抽奖是否存在 / 是否已开奖
    const rollRes = await ctx.database.get('roll', {id: roll_id})
    if (rollRes.length === 0) {
      return session.sendQueued(session.text('events.join.notFound'))
    }
    if (rollRes[0].isEnd) {
      return session.sendQueued(session.text('events.join.ended', {rollCode: roll_code}))
    }
    const res = await ctx.database.get('roll_member', {roll_id: roll_id, user_id: user_id})
    if (res.length === 0) {
      // 参与条件（群聊等级 / 活跃度 / 互动标识）
      const verdict = await checkJoinPolicy(ctx, session, config, roll_id)
      if (!verdict.ok) {
        logger.debug(`用户 ${session.userId} 不满足参与条件：${JSON.stringify(verdict.detail ?? {})}`)
        const key = verdict.reason?.key ?? 'unavailable'
        const reason = session.text(`events.join.reason.${key}`, verdict.reason?.params ?? {})
        return session.sendQueued(session.text('events.join.rejected', {messageId: session.messageId, reason}))
      }
      // 参与条件校验要访问荣誉接口（可能耗时数秒），这段时间里同一用户可能又发了一次口令：
      // 写库前再查一次，把重复写入的窗口从「秒级」缩到「一次数据库往返」
      const again = await ctx.database.get('roll_member', {roll_id: roll_id, user_id: user_id})
      if (again.length > 0) {
        return session.sendQueued(session.text('events.roll.add.failed', {messageId: session.messageId, rollCode: roll_code}))
      }
      try {
        await ctx.database.create('roll_member', {roll_id: roll_id, user_id: user_id})
      } catch (error) {
        // (roll_id, user_id) 上有唯一索引：并发下重复写入会在这里被数据库拦下，按「已参与」处理
        logger.debug(`写入参与记录失败（${user_id} → ${roll_id}）：${(error as Error)?.message ?? error}`)
        return session.sendQueued(session.text('events.roll.add.failed', {messageId: session.messageId, rollCode: roll_code}))
      }
      session.sendQueued(session.text('events.roll.add.success', {messageId: session.messageId, rollCode: roll_code}))
    }
    else {
      session.sendQueued(session.text('events.roll.add.failed', {messageId: session.messageId, rollCode: roll_code}))
    }
  })
}
