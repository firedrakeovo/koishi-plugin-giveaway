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
 */
export function debugProbe(ctx: Context, config: Config) {
  ctx.command("giveaway.debug.honor")
    .alias('抽奖接口诊断')
    .action(async ({session}) => {
      if (!hasAuthority(session, config.permission.authorityManage)) return session.text('.noAuth')
      if (!session.guildId) return session.text('.groupOnly')
      const onebot = (session as any).onebot
      const groupId = Number(session.guildId)
      const lines: string[] = []

      if (!onebot) {
        return '当前会话不是 OneBot 群聊，无法诊断。'
      }

      // 1) Cookie
      try {
        const cookie = await onebot.getCookies('qun.qq.com')
        lines.push(`① Cookie：${cookie ? `✅ 已获取（${String(cookie).length} 字符）` : '❌ 为空'}`)
      } catch (error: any) {
        lines.push(`① Cookie：❌ ${error?.message ?? error}`)
      }

      // 2) NapCat 的 get_group_honor_info
      try {
        const result = await onebot.getGroupHonorInfo(groupId, 'all')
        const count = (key: string) => Array.isArray(result?.[key]) ? result[key].length : 0
        lines.push(`② NapCat get_group_honor_info：龙王 ${count('talkative_list')} / 群聊之火 ${count('performer_list')} / 群聊炽焰 ${count('legend_list')} / 快乐源泉 ${count('emotion_list')}`)
        logger.info(`[debug.honor] NapCat 荣誉原始返回：${JSON.stringify(result)?.slice(0, 600)}`)
      } catch (error: any) {
        lines.push(`② NapCat get_group_honor_info：❌ ${error?.message ?? error}`)
      }

      // 3) QQ 网页接口（本插件的兜底实现）
      const probe = await fetchHonorViaWeb(ctx, session, groupId, ['talkative', 'performer', 'legend'])
      const countOf = (key: string) => (probe.info as any)?.[key]?.length ?? 0
      lines.push(`③ QQ 网页接口：${probe.ok ? '✅' : '❌'} 龙王 ${countOf('talkative_list')} / 群聊之火 ${countOf('performer_list')} / 群聊炽焰 ${countOf('legend_list')}`)
      if (probe.error) lines.push(`   错误：${probe.error}`)
      if (probe.info) {
        const sample = (key: string) => ((probe.info as any)[key] ?? []).slice(0, 2)
          .map((m: any) => `${m.user_id}${m.day_count !== undefined ? `(${m.day_count}天)` : ''}`).join('、') || '—'
        lines.push(`   样例：龙王 ${sample('talkative_list')}；火/炽焰 ${sample('performer_list')} / ${sample('legend_list')}`)
      }
      logger.info(`[debug.honor] 网页接口原始返回：${JSON.stringify(probe.raw)?.slice(0, 1200)}`)
      lines.push('（完整原始返回已写入插件日志）')

      return lines.join('\n')
    })

  ctx.command("giveaway.debug.member [user]")
    .action(async ({session}, user) => {
      if (!hasAuthority(session, config.permission.authorityManage)) return session.text('.noAuth')
      if (!session.guildId) return session.text('.groupOnly')
      const onebot = (session as any).onebot
      if (!onebot) return '当前会话不是 OneBot 群聊，无法诊断。'
      const target = (user ?? session.userId).replace(/[^0-9]/g, '') || session.userId
      try {
        const member = await onebot.getGroupMemberInfo(Number(session.guildId), Number(target), true)
        logger.info(`[debug.member] 原始返回：${JSON.stringify(member)?.slice(0, 600)}`)
        return [
          `用户 ${target} 在群 ${session.guildId} 的成员信息：`,
          `群聊等级 level = ${member?.level ?? '(无)'}`,
          `最后发言 last_sent_time = ${member?.last_sent_time ?? '(无)'}`,
          `入群时间 join_time = ${member?.join_time ?? '(无)'}`,
          `角色 role = ${member?.role ?? '(无)'}`,
          '（完整原始返回已写入插件日志）',
        ].join('\n')
      } catch (error: any) {
        return `❌ 获取失败：${error?.message ?? error}`
      }
    })
}
