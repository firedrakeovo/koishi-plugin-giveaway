import { Context } from 'koishi';
import { Config } from '../../config';
import { fetchHonorViaWeb } from '../../util/honorProvider';
import { hasAuthority } from '../../util/role';
import { logger } from '../../index';

/**
 * 接口诊断指令（管理员）：把当前群的荣誉/成员数据来源逐个打一遍，
 * 便于确认 NapCat 接口与 QQ 网页接口各自通不通、返回什么结构。
 *
 *   giveaway.debug.honor          诊断当前群的荣誉接口
 *   giveaway.debug.member [用户]   诊断群成员信息（群聊等级 / 最后发言）
 *
 * 输出文案全部走 i18n（`commands.giveaway.debug.*.messages`），三语保持一致；
 * 原始接口返回仍写进插件日志，避免在群里刷屏。
 */
export function debugProbe(ctx: Context, config: Config) {
  ctx.command("giveaway.debug.honor")
    .alias('抽奖接口诊断')
    .action(async ({session}) => {
      if (!hasAuthority(session, config.permission.authorityManage)) return session.text('.noAuth')
      if (!session.guildId) return session.text('.groupOnly')
      const onebot = (session as any).onebot
      const groupId = Number(session.guildId)

      if (!onebot) return session.text('.notOneBot')

      const lines: string[] = []

      // 1) Cookie
      try {
        const cookie = await onebot.getCookies('qun.qq.com')
        const state = cookie ? session.text('.cookieOk', [String(cookie).length]) : session.text('.cookieEmpty')
        lines.push(session.text('.cookie', [state]))
      } catch (error: any) {
        lines.push(session.text('.cookie', [session.text('.failed', [error?.message ?? error])]))
      }

      // 2) NapCat 的 get_group_honor_info
      try {
        const result = await onebot.getGroupHonorInfo(groupId, 'all')
        const count = (key: string) => Array.isArray(result?.[key]) ? result[key].length : 0
        lines.push(session.text('.napcat', [count('talkative_list'), count('performer_list'), count('legend_list'), count('emotion_list')]))
        logger.info(`[debug.honor] NapCat 荣誉原始返回：${JSON.stringify(result)?.slice(0, 600)}`)
      } catch (error: any) {
        lines.push(session.text('.napcatFailed', [error?.message ?? error]))
      }

      // 3) QQ 网页接口（本插件的兜底实现）
      const probe = await fetchHonorViaWeb(ctx, session, groupId, ['talkative', 'performer', 'legend'])
      const variant = (probe.raw && Object.values(probe.raw)[0] as any)?.variant ?? session.text('.unknown')
      lines.push(session.text('.authVariant', [variant]))
      const countOf = (key: string) => (probe.info as any)?.[key]?.length ?? 0
      lines.push(session.text('.webApi', [
        probe.ok ? '✅' : '❌',
        countOf('talkative_list'), countOf('performer_list'), countOf('legend_list'),
      ]))
      if (probe.error) lines.push(session.text('.error', [probe.error]))
      if (probe.info) {
        const sample = (key: string) => ((probe.info as any)[key] ?? []).slice(0, 3)
          .map((m: any) => m.day_count_max === undefined
            ? String(m.user_id)
            : m.day_count === undefined
              ? session.text('.sampleItemMax', [m.user_id, m.day_count_max])
              : session.text('.sampleItemBoth', [m.user_id, m.day_count_max, m.day_count]))
          .join(session.text('.listSep')) || '—'
        lines.push(session.text('.sample', [sample('talkative_list'), sample('performer_list'), sample('legend_list')]))
      }
      logger.info(`[debug.honor] 网页接口原始返回：${JSON.stringify(probe.raw)?.slice(0, 4000)}`)
      lines.push(session.text('.rawLogged'))

      return lines.join('\n')
    })

  ctx.command("giveaway.debug.member [user]")
    .alias('抽奖成员诊断')
    .action(async ({session}, user) => {
      if (!hasAuthority(session, config.permission.authorityManage)) return session.text('.noAuth')
      if (!session.guildId) return session.text('.groupOnly')
      const onebot = (session as any).onebot
      if (!onebot) return session.text('.notOneBot')
      const target = (user ?? session.userId).replace(/[^0-9]/g, '') || session.userId
      try {
        const member = await onebot.getGroupMemberInfo(Number(session.guildId), Number(target), true)
        logger.info(`[debug.member] 原始返回：${JSON.stringify(member)?.slice(0, 600)}`)
        const none = session.text('.none')
        return [
          session.text('.memberHeader', [target, session.guildId]),
          session.text('.memberLevel', [member?.level ?? none]),
          session.text('.memberLastSent', [member?.last_sent_time ?? none]),
          session.text('.memberJoin', [member?.join_time ?? none]),
          session.text('.memberRole', [member?.role ?? none]),
          session.text('.rawLogged'),
        ].join('\n')
      } catch (error: any) {
        return session.text('.memberFailed', [error?.message ?? error])
      }
    })
}
