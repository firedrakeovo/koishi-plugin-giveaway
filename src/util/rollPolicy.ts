import { Config, HonorRequirement } from '../config'

/**
 * 单个抽奖的参与条件（per-roll）。
 *
 * 创建抽奖时模板里的「参与条件：」一行就是它的文本形态：
 * 用户**沿用不改** = 用控制台全局配置；**删空** = 这个抽奖不限制；**改写** = 自定义。
 *
 * 这里只包含**文本能表达**的门槛；互动标识的判定口径（任一 / 全部）与「龙王」口径
 * （昨日活跃榜 / 仅当前龙王）属于控制台全局配置，不参与 per-roll 覆盖。
 *
 * 文本形态是固定 token，便于人改也便于解析（三种语言都认）：
 * ```
 * 等级≥40 活跃≥1 连续≥7 标识=群聊炽焰,龙王
 * ```
 * - 等级：群聊等级下限；活跃：最近 N 天内有发言；连续：最长连续发言天数
 * - 标识：群聊之火 / 群聊炽焰 / 龙王
 * - 值为 0 或留空的项直接不渲染；整行留空表示不限制
 */
export interface RollPolicy {
  minGroupLevel: number
  minActiveDays: number
  minContinuousDays: number
  requiredHonors: HonorRequirement[]
}

type Lang = 'zh' | 'en' | 'de'

const LABELS: Record<Lang, {
  level: string; active: string; streak: string; honors: string
  honorsNames: Record<HonorRequirement, string>
}> = {
  zh: {
    level: '等级', active: '活跃', streak: '连续', honors: '标识',
    honorsNames: { fire7: '群聊之火', fire30: '群聊炽焰', dragon: '龙王' },
  },
  en: {
    level: 'Level', active: 'Active', streak: 'Streak', honors: 'Honors',
    honorsNames: { fire7: 'fire', fire30: 'blaze', dragon: 'dragon' },
  },
  de: {
    level: 'Stufe', active: 'Aktiv', streak: 'Serie', honors: 'Abzeichen',
    honorsNames: { fire7: 'Feuer', fire30: 'Flamme', dragon: 'Drachenkoenig' },
  },
}

/** 三种语言 + 常见别名的标识写法 → 内部值 */
const HONOR_ALIASES: Array<[RegExp, HonorRequirement]> = [
  [/^(火|群聊之火|fire7|fire|feuer)$/i, 'fire7'],
  [/^(炽焰|群聊炽焰|fire30|blaze|flamme)$/i, 'fire30'],
  [/^(龙王|dragon|drachenkoenig|drachenkönig)$/i, 'dragon'],
]

/** 从会话推断用哪种标签渲染（只影响显示，解析三种都认） */
export function pickLang(session: any): Lang {
  const locale = String(session?.locales?.[0] ?? session?.locale ?? 'zh-CN')
  if (locale.startsWith('en')) return 'en'
  if (locale.startsWith('de')) return 'de'
  return 'zh'
}

/** 标识 → 显示名（日志 / 提示用，取中文名） */
export function honorLabel(honor: HonorRequirement): string {
  return LABELS.zh.honorsNames[honor]
}

/** 配置里被丢弃的标识项（控制台里留空的一行会被存成 null，另有手填的错值） */
export function invalidHonors(honors: any): any[] {
  return Array.isArray(honors)
    ? honors.filter((honor) => !(honor === 'fire7' || honor === 'fire30' || honor === 'dragon'))
    : []
}

/** 控制台全局配置 → 策略对象（只取文本能表达的项） */
export function policyFromConfig(config: Config): RollPolicy {
  const join = config.join
  return {
    minGroupLevel: join.minGroupLevel,
    minActiveDays: join.minActiveDays,
    minContinuousDays: join.minContinuousDays,
    requiredHonors: (join.requiredHonors ?? []).filter(
      (honor): honor is HonorRequirement => honor === 'fire7' || honor === 'fire30' || honor === 'dragon'),
  }
}

/** 策略 → 模板里的那一行文本（没有限制时返回空串） */
export function renderPolicy(policy: RollPolicy, lang: Lang = 'zh'): string {
  const labels = LABELS[lang]
  const tokens: string[] = []
  if (policy.minGroupLevel > 0) tokens.push(`${labels.level}≥${policy.minGroupLevel}`)
  if (policy.minActiveDays > 0) tokens.push(`${labels.active}≥${policy.minActiveDays}`)
  if (policy.minContinuousDays > 0) tokens.push(`${labels.streak}≥${policy.minContinuousDays}`)
  if (policy.requiredHonors.length > 0) {
    tokens.push(`${labels.honors}=${policy.requiredHonors.map((honor) => labels.honorsNames[honor]).join(',')}`)
  }
  return tokens.join(' ')
}

export interface PolicyParseResult {
  ok: boolean
  policy: RollPolicy
  /** 无法识别的内容（原样回显，便于提示用户） */
  unknown?: string
}

const EMPTY_POLICY: RollPolicy = {
  minGroupLevel: 0, minActiveDays: 0, minContinuousDays: 0, requiredHonors: [],
}

/**
 * 解析「参与条件」一行。留空 = 不限制；无法识别的内容会通过 `unknown` 回传（调用方据此报错）。
 */
export function parsePolicy(input: string): PolicyParseResult {
  const text = String(input ?? '').trim()
  const policy: RollPolicy = { ...EMPTY_POLICY, requiredHonors: [] }
  if (!text || text === 'n' || text === '无' || text === '不限制' || text.toLowerCase() === 'none') {
    return { ok: true, policy }
  }

  let rest = text
  const consume = (re: RegExp): RegExpExecArray | null => {
    const matched = re.exec(rest)
    if (matched) rest = rest.replace(matched[0], ' ')
    return matched
  }

  const level = consume(/(?:等级|level|stufe)\s*[≥>=]?\s*(\d+)/i)
  if (level) policy.minGroupLevel = Number(level[1])
  const active = consume(/(?:活跃|active|aktiv)\s*[≥>=]?\s*(\d+)/i)
  if (active) policy.minActiveDays = Number(active[1])
  const streak = consume(/(?:连续|streak|serie)\s*[≥>=]?\s*(\d+)/i)
  if (streak) policy.minContinuousDays = Number(streak[1])

  const honors = consume(/(?:标识|honors?|abzeichen)\s*[=:]\s*([^\s]+)/i)
  if (honors) {
    for (const raw of honors[1].split(/[,，、/|｜]+/).filter(Boolean)) {
      const alias = HONOR_ALIASES.find(([re]) => re.test(raw))
      if (!alias) return { ok: false, policy, unknown: raw }
      if (!policy.requiredHonors.includes(alias[1])) policy.requiredHonors.push(alias[1])
    }
  }

  // 去掉已识别的部分与分隔符后，若还有残留内容 → 视为无法识别
  const leftover = rest.replace(/[\s,，、;；|｜:：=≥>]+/g, '')
  if (leftover) return { ok: false, policy, unknown: leftover }

  return { ok: true, policy }
}

/**
 * 把 per-roll 策略叠加到全局 join 配置上（未提供策略时原样返回）。
 *
 * 只覆盖模板里能表达的项，其余（互动标识判定口径、龙王口径、取数失败策略、缓存时长）
 * 永远由控制台配置决定，避免创建时的快照把后来改的控制台配置顶掉。
 */
export function mergePolicy(config: Config, policy: RollPolicy | null): Config['join'] {
  if (!policy) return config.join
  return {
    ...config.join,
    minGroupLevel: policy.minGroupLevel,
    minActiveDays: policy.minActiveDays,
    minContinuousDays: policy.minContinuousDays,
    requiredHonors: policy.requiredHonors,
  }
}

/** 策略里是否有任何限制 */
export function policyHasConditions(policy: RollPolicy): boolean {
  return policy.minGroupLevel > 0 || policy.minActiveDays > 0
    || policy.minContinuousDays > 0 || policy.requiredHonors.length > 0
}

/** 策略 → 数据库行 */
export function policyToRow(rollId: number, policy: RollPolicy) {
  return {
    roll_id: rollId,
    minGroupLevel: policy.minGroupLevel,
    minActiveDays: policy.minActiveDays,
    minContinuousDays: policy.minContinuousDays,
    requiredHonors: policy.requiredHonors.join(','),
  }
}

/** 数据库行 → 策略 */
export function rowToPolicy(row: any): RollPolicy {
  return {
    minGroupLevel: Number(row?.minGroupLevel ?? 0) || 0,
    minActiveDays: Number(row?.minActiveDays ?? 0) || 0,
    minContinuousDays: Number(row?.minContinuousDays ?? 0) || 0,
    requiredHonors: String(row?.requiredHonors ?? '').split(',').filter(
      (honor): honor is HonorRequirement => honor === 'fire7' || honor === 'fire30' || honor === 'dragon'),
  }
}

/** 两份策略是否等价（用于判断是否真的需要落 per-roll 覆盖） */
export function policyEquals(a: RollPolicy, b: RollPolicy): boolean {
  return a.minGroupLevel === b.minGroupLevel
    && a.minActiveDays === b.minActiveDays
    && a.minContinuousDays === b.minContinuousDays
    && a.requiredHonors.length === b.requiredHonors.length
    && a.requiredHonors.every((honor) => b.requiredHonors.includes(honor))
}
