import {Context, $, Session, h} from 'koishi'
import {Config} from "../config";
import {DateTime} from 'luxon';
import {bots, logger} from '../index'
import {pickLang, policyFromConfig, policyHasConditions, renderPolicy, rowToPolicy} from "./rollPolicy";
import {getCurrentUTCOffset, offsetToUTCOffset} from "./time";
import {getCurrentLocales} from "./locale";
import {collectWinners} from "./render";
import {dateInputToDateTime} from "./general";

export async function rollListMsgFromChannelId(session: Session, cid: string, platform: string) {
  let msg = session.text('messageBuilder.roll.list.header')
  let endList = '<p>' + session.text('messageBuilder.marks.end') + '</p>'
  let notEndList = '<p>' + session.text('messageBuilder.marks.open') + '</p>'
  let isEndListEmpty = true
  let isNotEndListEmpty = true

  const r = await session.app.database.get('roll_channel', {channel_id: cid, channel_platform: platform}, ['roll_id'])
  if (r.length === 0) return session.text('messageBuilder.roll.list.error')
  const res = r.map((item) => item.roll_id)

  let listItem
  for (const rollId of res) {
    let listItemRes = await session.app.database.get('roll', {id: rollId}, ['roll_code', 'isEnd', 'title'])
    if (listItemRes.length === 1) {
      listItem = listItemRes[0]
      if (listItem.isEnd) {
        endList += session.text('messageBuilder.roll.list.listItem', listItem)
        isEndListEmpty = false
      } else {
        notEndList += session.text('messageBuilder.roll.list.listItem', listItem)
        isNotEndListEmpty = false
      }
    }
  }
  if (!isNotEndListEmpty) msg += notEndList
  if (!isEndListEmpty) msg += endList
  return h.unescape(msg)
}

export async function rollDetailMsgFromRoll(session: Session, roll: any, currentOffset: string, currentLocale: string, config?: Config) {
  const dt = DateTime.fromJSDate(roll.endTime, {zone: 'UTC'}).setZone(currentOffset)
  let msgList = []
  let msg = ""
  let endTime
  if ((!roll.isEnd) && (!roll.isAutoEnd)) {
    endTime = session.text('messageBuilder.roll.detail.noEndTime')
  } else {
    endTime = dt.setLocale(currentLocale).toLocaleString(DateTime.DATETIME_FULL)
  }
  // 参与条件：per-roll 覆盖优先，其次控制台全局配置
  let policy = config ? policyFromConfig(config) : null
  try {
    const policyRows = await session.app.database.get('roll_policy', {roll_id: roll.id})
    if (policyRows.length > 0) policy = rowToPolicy(policyRows[0])
  } catch (error: any) {
    logger.warn(`读取抽奖 ${roll.id} 的参与条件失败：${error?.message ?? error}`)
  }
  const condition = policy && policyHasConditions(policy)
    ? renderPolicy(policy, pickLang(session))
    : session.text('messageBuilder.roll.detail.noCondition')
  msgList.push(session.text('messageBuilder.roll.detail.header', {
    mark: roll.isEnd ? session.text('messageBuilder.marks.end') : session.text('messageBuilder.marks.open'),
    roll_code: roll.roll_code,
    title: roll.title,
    description: roll.description,
    endTime: endTime,
    condition: condition
  }))
  // prize list
  msgList.push(session.text('messageBuilder.roll.detail.divider'))
  msgList.push(session.text('messageBuilder.roll.detail.body.prizeTitle'))
  const res = await session.app.database.get('roll_prize', {roll_id: roll.id})
  for (const e of res) {
    const prize = await session.app.database.get('prize', {id: e.prize_id})
    msgList.push(session.text('messageBuilder.roll.detail.body.prizeListItem', {
      name: prize[0].name,
      amount: prize[0].amount
    }))
  }
  // if roll is end, show winner list（复用 collectWinners：资料取不到时退化为只显示 QQ 号）
  if (roll.isEnd) {
    msgList.push(session.text('messageBuilder.roll.detail.divider'))
    msgList.push(session.text('messageBuilder.roll.detail.body.winnerTitle'))
    const winners = await collectWinners(session.app, roll, session.bot as any)
    for (const winner of winners) {
      msgList.push(session.text('messageBuilder.roll.detail.body.winner', {
        userName: winner.name || winner.pid,
        userId: winner.pid,
      }))
      for (const prize of winner.prizes) {
        msgList.push(session.text('messageBuilder.roll.detail.body.winList', {
          name: prize.name,
          amount: prize.amount,
        }))
      }
    }
  }
  msgList.forEach((str) => msg += str)
  return h.unescape(msg)
}

export async function rollMemberMsgFromRoll(session: Session, roll: any) {

  const res = await session.app.database.get('roll_member', {roll_id: roll.id})
  if (res.length === 0) return session.text('messageBuilder.roll.member.empty')
  let msg = session.text('messageBuilder.roll.member.header', [res.length, roll.roll_code])
  for (const member of res) {
    const binding = (await session.app.database.get('binding', {aid: member.user_id}))[0]
    const pid = binding?.pid ?? String(member.user_id)
    // 取不到资料时退化为只显示 QQ 号，绝不因为某个用户资料缺失而让整条名单发不出去
    let userName = ''
    if (binding) {
      const target = (bots ?? []).find((bot) => bot.platform === binding.platform)
      if (target?.getUser) {
        try {
          userName = (await target.getUser(binding.pid))?.name ?? ''
        } catch (error) {
          logger.warn(`取参与用户资料失败（${binding.pid}）：${(error as Error)?.message ?? error}`)
        }
      }
    }
    msg += session.text('messageBuilder.roll.member.body.memberListItem', {userName: userName || pid, userId: pid})
  }

  return msg
}

export async function rollEndMsgFromRollId(ctx: Context, config: Config, roll: any, channel: any) {
  // i18n
  //ctx.i18n.render(locales: string[], path: string[], params: any)
  let locales
  const platform = channel.channel_platform
  const channelId = channel.channel_id
  const currentChannel = await ctx.database.get('channel', {id: channelId, platform: platform})
  if (currentChannel[0].locales.length === 0) {
    locales = ctx.root.options.i18n.locales
  } else {
    locales = currentChannel[0].locales
  }
  let msgList = []
  let msg = ''
  msgList.push(ctx.i18n.render(locales, ['messageBuilder.roll.end.header'], [roll.roll_code])[0])
  const res = await ctx.database.get('roll_member', {roll_id: roll.id}, ['user_id'])
  const r = await ctx.database.join(['roll_prize', 'user_prize'], (roll_prize, user_prize) => $.eq(roll_prize.prize_id, user_prize.prize_id)).execute()
  // for every member
  let isWinner = false
  for (let u of res) {
    const userId = u.user_id
    const binding: any = (await ctx.database.get('binding', {aid: userId}))[0]
    let user: any = null
    if (binding) {
      for (const bot of bots ?? []) {
        if (bot.platform !== binding.platform) continue
        // 不是所有适配器都实现 getUser；取不到昵称就只显示 QQ 号，别让整条开奖消息发不出去
        if (typeof (bot as any).getUser !== 'function') continue
        try {
          user = await (bot as any).getUser(binding.pid)
        } catch (error) {
          logger.warn(`取中奖者资料失败（${binding.pid}）：${(error as Error)?.message ?? error}`)
        }
      }
    }
    msgList.push(ctx.i18n.render(locales, ['messageBuilder.roll.end.body.winner'], {
      // 开奖行用 <at> 展示中奖者；取不到昵称（已退群 / 接口失败）也不能让整条开奖消息发不出去
      userName: user?.name ?? '',
      userId: binding?.pid ?? String(userId)
    })[0])
    for (const e of r) {
      if (e.roll_prize.roll_id === roll.id && e.user_prize.user_id === userId) {
        isWinner = true
        const prizeDetail = await ctx.database.get('prize', {id: e.roll_prize.prize_id})
        msgList.push(ctx.i18n.render(locales, ['messageBuilder.roll.end.body.winList'], {
          name: prizeDetail[0].name,
          amount: e.user_prize.amount
        })[0])
      }
    }
    if (!isWinner) {
      msgList.pop()
    }
    isWinner = false
  }
  msgList.forEach((str) => msg += str)
  return h.unescape(msg)
}
