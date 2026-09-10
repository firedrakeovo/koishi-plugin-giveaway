import { Context } from 'koishi'
import { Config, HonorRequirement } from '../config'
import { logger } from '../index'
import { fetchHonorViaWeb } from './honorProvider'

/**
 * 抽奖参与条件（join policy）
 *
 * 数据来源全部是 NapCat 已实现的 OneBot v11 标准接口：
 *
 * | 条件 | OneBot 接口 | 字段 | 说明 |
 * |---|---|---|---|
 * | 群聊等级 | `get_group_member_info` | `level` | NapCat 取 QQ NT 的 `memberRealLevel`，即群聊等级（1~100） |
 * | 最近发言 | `get_group_member_info` | `last_sent_time` | 最后一次发言时间（OneBot 标准为秒，NapCat 可能给毫秒，已做归一化） |
 * | 群聊之火（连续 7 天） | `get_group_honor_info` | `performer_list` | NapCat 的 type 映射：`performer` → 2 |
 * | 群聊炽焰（连续 30 天） | `get_group_honor_info` | `legend_list` | 同上：`legend` → 3 |
 * | 龙王（昨日最活跃） | `get_group_honor_info` | `talkative_list` | 同上：`talkative` → 1 |
 *
 * 注意两点：
 * 1. 群聊炽焰是群聊之火的升级形态（持有炽焰的人不再出现在火列表里），
 *    所以「连续 7 天」的判定是 `performer_list` **或** `legend_list`。
 * 2. 荣誉接口走的是 qun.qq.com 网页接口（需要登录 Cookie），比成员信息慢且更容易失败，
 *    因此按 (群, 类型) 缓存，并且只请求配置里真正用到的类型。
 */

/** OneBot `get_group_member_info` 返回值里我们关心的字段 */
export interface OneBotMemberInfo {
  user_id: number
  nickname?: string
  card?: string
  /** 群聊等级（字符串形式的数字） */
  level?: string
  role?: 'member' | 'admin' | 'owner'
  join_time?: number
  last_sent_time?: number
}

export interface OneBotHonorMember {
  user_id: number
  nickname?: string
  avatar?: string
  description?: string
  /** 连续天数（新版网页接口会返回；NapCat 的旧路径没有） */
  day_count?: number
}

/** OneBot `get_group_honor_info` 返回值（按 NapCat 的实现） */
export interface OneBotHonorInfo {
  talkative_list?: OneBotHonorMember[]
  performer_list?: OneBotHonorMember[]
  legend_list?: OneBotHonorMember[]
  strong_newbie_list?: OneBotHonorMember[]
  emotion_list?: OneBotHonorMember[]
}

export interface JoinVerdict {
  ok: boolean
  /** 不通过时的 i18n 后缀（`events.join.reason.<key>`）与参数 */
  reason?: { key: 'level' | 'active' | 'honor' | 'unavailable'; params?: Record<string, any> }
  /** 供日志/调试用的原始判定依据 */
  detail?: Record<string, any>
}

const MEMBER_TTL = 60 * 1000
const memberCache = new Map<string, { at: number; data: OneBotMemberInfo | null }>()
const honorCache = new Map<string, { at: number; data: OneBotHonorInfo | null }>()

/** 清空缓存（测试用；荣誉数据本身也受 cacheMinutes 控制） */
export function clearJoinPolicyCache() {
  memberCache.clear()
  honorCache.clear()
}

/** 把可能是秒、也可能是毫秒的时间戳归一化成毫秒 */
export function toMillis(value?: number): number | null {
  if (!value || value <= 0 || !Number.isFinite(value)) return null
  return value > 1e12 ? value : value * 1000
}

/**
 * 归一化 `requiredHonors`：控制台里把多选清空时可能留下 `null` 占位，
 * 这类无效值不能让条件继续生效（否则会变成"永远需要标识"）。
 */
export function normalizeHonors(honors: any): HonorRequirement[] {
  if (!Array.isArray(honors)) return []
  return honors.filter((honor): honor is HonorRequirement =>
    honor === 'fire7' || honor === 'fire30' || honor === 'dragon')
}

/** 配置里是否设置了任何参与条件 */
export function hasJoinConditions(config: Config): boolean {
  const join = config.join
  return join.minGroupLevel > 0 || join.minActiveDays > 0 || normalizeHonors(join.requiredHonors).length > 0
}

async function fetchMember(onebot: any, groupId: number, userId: number): Promise<OneBotMemberInfo | null> {
  const key = `${groupId}:${userId}`
  const cached = memberCache.get(key)
  if (cached && Date.now() - cached.at < MEMBER_TTL) return cached.data
  let data: OneBotMemberInfo | null = null
  try {
    data = await onebot.getGroupMemberInfo(groupId, userId, true)
  } catch (error) {
    logger.warn(`获取群 ${groupId} 成员 ${userId} 信息失败：${error?.message ?? error}`)
  }
  memberCache.set(key, { at: Date.now(), data })
  return data
}

async function fetchHonor(onebot: any, groupId: number, type: string, ttl: number): Promise<OneBotHonorInfo | null> {
  const key = `${groupId}:${type}`
  const cached = honorCache.get(key)
  if (cached && Date.now() - cached.at < ttl) return cached.data
  let data: OneBotHonorInfo | null = null
  try {
    const result = await onebot.getGroupHonorInfo(groupId, type)
    if (result && typeof result === 'object') data = result
  } catch (error) {
    logger.warn(`获取群 ${groupId} 荣誉（${type}）失败：${error?.message ?? error}`)
  }
  honorCache.set(key, { at: Date.now(), data })
  return data
}

/** 配置 → 需要请求的荣誉类型（尽量少请求：只取用到的那几种） */
export function requiredHonorTypes(honors: HonorRequirement[]): string[] {
  const types = new Set<string>()
  for (const honor of honors) {
    if (honor === 'dragon') types.add('talkative')
    if (honor === 'fire7') { types.add('performer'); types.add('legend') }
    if (honor === 'fire30') types.add('legend')
  }
  return [...types]
}

/**
 * 检查某个用户是否满足本次抽奖的参与条件。
 *
 * 未配置任何条件时零开销直接通过；非 OneBot 平台（拿不到这些接口）同样直接通过。
 */
export async function checkJoinPolicy(ctx: Context, session: any, config: Config): Promise<JoinVerdict> {
  const join = config.join
  if (!hasJoinConditions(config)) return { ok: true }

  const onebot = session.onebot
  if (!onebot || !session.guildId) {
    logger.debug('当前会话不支持 OneBot 群成员接口，跳过参与条件检查')
    return { ok: true, detail: { skipped: 'unsupported-platform' } }
  }

  const groupId = Number(session.guildId)
  const userId = Number(session.userId)
  const honors = normalizeHonors(join.requiredHonors)
  const needMember = join.minGroupLevel > 0 || join.minActiveDays > 0
  const needHonor = honors.length > 0
  const denyOnError = join.onFetchError === 'deny'

  // 1. 群聊等级 / 最近发言
  let member: OneBotMemberInfo | null = null
  if (needMember) {
    member = await fetchMember(onebot, groupId, userId)
    if (!member) {
      if (denyOnError) {
        logger.warn(`无法获取群 ${groupId} 成员 ${userId} 的信息，按 onFetchError=deny 拒绝`)
        return { ok: false, reason: { key: 'unavailable' } }
      }
      logger.warn(`无法获取成员信息，按参与条件配置放行：群 ${groupId} 用户 ${userId}`)
    }
  }

  if (member && join.minGroupLevel > 0) {
    const level = Number(member.level ?? 0) || 0
    if (level < join.minGroupLevel) {
      return {
        ok: false,
        reason: { key: 'level', params: { current: level, required: join.minGroupLevel } },
        detail: { level },
      }
    }
  }

  if (member && join.minActiveDays > 0) {
    const last = toMillis(member.last_sent_time)
    const days = last === null ? null : Math.floor((Date.now() - last) / 86400000)
    if (days === null || days > join.minActiveDays) {
      return {
        ok: false,
        reason: {
          key: 'active',
          params: {
            required: join.minActiveDays,
            last: days === null ? session.text('events.join.never-spoke') : session.text('events.join.days-ago', [days]),
          },
        },
        detail: { lastSentTime: member.last_sent_time, days },
      }
    }
  }

  // 2. 互动标识（QQ 群荣誉）
  if (needHonor) {
    const types = requiredHonorTypes(honors)
    const ttl = join.cacheMinutes * 60 * 1000
    const lists: Record<string, OneBotHonorMember[]> = {}
    const merge = (info: OneBotHonorInfo) => {
      for (const [key, value] of Object.entries(info)) {
        if (Array.isArray(value)) lists[key] = (lists[key] ?? []).concat(value)
      }
    }
    let failed = false
    for (const type of types) {
      const info = await fetchHonor(onebot, groupId, type, ttl)
      if (!info) { failed = true; continue }
      merge(info)
    }
    // 群荣誉接口失败时会返回全空列表，而真实群里至少会有人上榜：
    // 全部为空视为「取不到数据」，按 onFetchError 处理，避免误判成「你没有标识」
    const empty = (batch: Record<string, OneBotHonorMember[]>) => !batch.talkative_list?.length
      && !batch.performer_list?.length && !batch.legend_list?.length && !batch.emotion_list?.length
    let honorUnavailable = failed || empty(lists)
    // NapCat 的荣誉接口已失效（QQ 荣誉页改成 SPA，见 honorProvider 注释）：
    // 这里自动改用 QQ 新版网页接口兜底，成功则继续判定，不再走 onFetchError
    if (honorUnavailable) {
      const probe = await fetchHonorViaWeb(ctx, session, groupId, types)
      if (probe.info && !empty(probe.info as Record<string, OneBotHonorMember[]>)) {
        for (const key of Object.keys(lists)) delete lists[key]
        merge(probe.info)
        honorUnavailable = false
        logger.info(`群 ${groupId} 已改用 QQ 网页接口获取荣誉数据（NapCat 接口不可用）`)
      } else {
        logger.warn(`群 ${groupId} 两种途径都没能取到荣誉数据${probe.error ? `（网页接口：${probe.error}）` : ''}`)
      }
    }
    if (honorUnavailable) {
      if (denyOnError) {
        logger.warn(`无法获取群 ${groupId} 的荣誉数据，按 onFetchError=deny 拒绝用户 ${userId}`)
        return { ok: false, reason: { key: 'unavailable' } }
      }
      logger.warn(`无法获取群 ${groupId} 的荣誉数据，按参与条件配置跳过该项检查`)
      return { ok: true, detail: { member, skipped: 'honor-unavailable' } }
    }

    const inList = (name: string) => (lists[name] ?? []).some((m) => Number(m.user_id) === userId)
    const owned: Record<HonorRequirement, boolean> = {
      // 炽焰是火的升级形态，持有炽焰的人不再出现在火列表
      fire7: inList('performer_list') || inList('legend_list'),
      fire30: inList('legend_list'),
      dragon: inList('talkative_list'),
    }
    const missing = honors.filter((honor) => !owned[honor])
    const matched = honors.length - missing.length
    const passed = join.honorMode === 'all' ? missing.length === 0 : matched > 0
    if (!passed) {
      return {
        ok: false,
        reason: {
          key: 'honor',
          params: { required: honors.map((h) => session.text(`events.join.honor.${h}`)).join(session.text('general.comma')) },
        },
        detail: { owned, missing, mode: join.honorMode },
      }
    }
    return { ok: true, detail: { member, owned, mode: join.honorMode } }
  }

  return { ok: true, detail: { member } }
}
