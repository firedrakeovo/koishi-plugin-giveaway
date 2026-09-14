import { Config, HonorRequirement } from '../config'

/**
 * 单个抽奖的参与条件（per-roll）。
 *
 * 创建抽奖时模板里的「参与条件：」一行就是它的文本形态：
 * 用户**沿用不改** = 用控制台全局配置；**删空** = 这个抽奖不限制；**改写** = 自定义。
 *
 * 文本形态是固定 token，便于人改也便于解析（三种语言都认）：
 * ```
 * 等级≥40 活跃≥1 连续≥7 标识=群聊炽焰,龙王 模式=任一
 * ```
 * - 等级：群聊等级下限；活跃：最近 N 天内有发言；连续：最长连续发言天数
 * - 标识：群聊之火 / 群聊炽焰 / 龙王；模式：任一 / 全部
 * - 值为 0 或留空的项直接不渲染；整行留空表示不限制
 */
export interface RollPolicy {
  minGroupLevel: number
  minActiveDays: number
  minContinuousDays: number
  requiredHonors: HonorRequirement[]
  honorMode: 'any' | 'all'
  dragonScope: 'list' | 'current'
}

type Lang = 'zh' | 'en' | 'de'

const LABELS: Record<Lang, {
  level: string; active: string; streak: string; honors: string; mode: string
  any: string; all: string; honorsNames: Record<HonorRequirement, string>
}> = {
  zh: {
    level: '等级', active: '活跃', streak: '连续', honors: '标识', mode: '模式',
    any: '任一', all: '全部',
    honorsNames: { fire7: '群聊之火', fire30: '群聊炽焰', dragon: '龙王' },
  },
  en: {
    level: 'Level', active: 'Active', streak: 'Streak', honors: 'Honors', mode: 'Mode',
    any: 'any', all: 'all',
    honorsNames: { fire7: 'fire', fire30: 'blaze', dragon: 'dragon' },
  },
  de: {
    level: 'Stufe', active: 'Aktiv', streak: 'Serie', honors: 'Abzeichen', mode: 'Modus',
    any: 'beliebig', all: 'alle',
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

/** 控制台全局配置 → 策略对象 */
export function policyFromConfig(config: Config): RollPolicy {
  const join = config.join
  return {
    minGroupLevel: join.minGroupLevel,
    minActiveDays: join.minActiveDays,
    minContinuousDays: join.minContinuousDays,
    requiredHonors: (join.requiredHonors ?? []).filter(
      (honor): honor is HonorRequirement => honor === 'fire7' || honor === 'fire30' || honor === 'dragon'),
    honorMode: join.honorMode,
    dragonScope: join.dragonScope,
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
  if (policy.requiredHonors.length > 1) {
    tokens.push(`${labels.mode}=${policy.honorMode === 'all' ? labels.all : labels.any}`)
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
  minGroupLevel: 0, minActiveDays: 0, minContinuousDays: 0,
  requiredHonors: [], honorMode: 'any', dragonScope: 'list',
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
  const mode = consume(/(?:模式|mode|modus)\s*[=:]\s*([^\s]+)/i)
  if (mode) {
    const value = mode[1].toLowerCase()
    if (['任一', 'any', 'beliebig'].includes(value)) policy.honorMode = 'any'
    else if (['全部', 'all', 'alle'].includes(value)) policy.honorMode = 'all'
    else return { ok: false, policy, unknown: mode[1] }
  }

  // 去掉已识别的部分与分隔符后，若还有残留内容 → 视为无法识别
  const leftover = rest.replace(/[\s,，、;；|｜:：=≥>]+/g, '')
  if (leftover) return { ok: false, policy, unknown: leftover }

  return { ok: true, policy }
}

/** 把 per-roll 策略叠加到全局 join 配置上（未提供策略时原样返回） */
export function mergePolicy(config: Config, policy: RollPolicy | null): Config['join'] {
  if (!policy) return config.join
  return {
    ...config.join,
    minGroupLevel: policy.minGroupLevel,
    minActiveDays: policy.minActiveDays,
    minContinuousDays: policy.minContinuousDays,
    requiredHonors: policy.requiredHonors,
    honorMode: policy.honorMode,
    dragonScope: policy.dragonScope,
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
    honorMode: policy.honorMode,
    dragonScope: policy.dragonScope,
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
    honorMode: row?.honorMode === 'all' ? 'all' : 'any',
    dragonScope: row?.dragonScope === 'current' ? 'current' : 'list',
  }
}

/** 两份策略是否等价（用于判断是否真的需要落 per-roll 覆盖） */
export function policyEquals(a: RollPolicy, b: RollPolicy): boolean {
  return a.minGroupLevel === b.minGroupLevel
    && a.minActiveDays === b.minActiveDays
    && a.minContinuousDays === b.minContinuousDays
    && a.honorMode === b.honorMode
    && a.dragonScope === b.dragonScope
    && a.requiredHonors.length === b.requiredHonors.length
    && a.requiredHonors.every((honor) => b.requiredHonors.includes(honor))
}

/**
 * 文本里没有表达的字段（如龙王口径、标识只有一个时的模式）从全局策略继承，
 * 避免用户只改了等级却把其它维度重置掉。
 */
export function inheritPolicy(parsed: RollPolicy, base: RollPolicy): RollPolicy {
  return {
    ...parsed,
    dragonScope: base.dragonScope,
    honorMode: parsed.requiredHonors.length > 1 ? parsed.honorMode : base.honorMode,
  }
}
