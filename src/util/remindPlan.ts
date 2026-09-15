/**
 * 提醒计划（按「剩余时长区间 + 百分比」计算提醒时刻）。
 *
 * 控制台配置的是一张规则表，每行 = 一个时长上限 + 提醒位置（剩余时长的百分比）：
 *
 * | maxDuration | percent | 含义 |
 * | --- | --- | --- |
 * | `1h`  | `20` | 距开奖 ≤1 小时的抽奖，在开奖前 20% 的时长处提醒一次 |
 * | `5h`  | `15` | 1~5 小时：开奖前 15% |
 * | `0`   | `10` | 兜底（`0` / 留空 = 不限）：更长的场次开奖前 10% |
 *
 * 一个抽奖只会命中**一行**（上限升序第一个 ≥ 实际时长的行），所以默认每次抽奖只提醒一次；
 * 想提醒多次就在同一行写多个百分比（`20,10`）。
 */

export interface RemindRule {
  maxDuration?: string
  percent?: string
}

export interface NormalizedRule {
  /** 时长上限（分钟）；`undefined` = 不限（兜底行） */
  maxMinutes?: number
  /** 提醒位置：剩余时长的百分比（1~99），已排序（越大的越早提醒） */
  percents: number[]
}

const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|分钟|h|hr|hrs|hour|hours|小时|d|day|days|天)?$/i
const UNLIMITED = ['', '0', '不限', 'any', '*']

/**
 * 解析时长文本：`30m` / `90`（纯数字 = 分钟）/ `1h` / `1d` / `7天`。
 *
 * - 返回**分钟数**：正常识别
 * - 返回 `undefined`：不限（空、`0`、`不限`、`*`）
 * - 返回 `null`：无法识别（配置写错了）
 */
export function parseDurationMinutes(input?: string | number): number | undefined | null {
  if (input === undefined || input === null) return undefined
  const text = String(input).trim()
  if (UNLIMITED.includes(text.toLowerCase())) return undefined
  const m = DURATION_RE.exec(text)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!isFinite(n) || n <= 0) return null
  const unit = (m[2] ?? 'm').toLowerCase()
  const scale = unit.startsWith('d') || unit === '天' ? 1440 : (unit.startsWith('h') || unit === '小时' ? 60 : 1)
  return n * scale
}

/** 解析百分比字段（`20` 或 `20,10`）→ 1~99 的百分比数组（无效项丢弃） */
export function parsePercents(input?: string | number): number[] {
  if (input === undefined || input === null) return []
  return String(input)
    .split(/[,，、\s]+/)
    .map((s) => parseFloat(s))
    .filter((n) => isFinite(n) && n > 0 && n < 100)
}

/** 归一化规则表：丢掉无法识别 / 没有有效百分比的行，其余按上限升序排好 */
export function normalizeRules(rules: RemindRule[] = []): { rules: NormalizedRule[], invalid: RemindRule[] } {
  const out: NormalizedRule[] = []
  const invalid: RemindRule[] = []
  for (const rule of rules ?? []) {
    if (!rule) { invalid.push(rule); continue }
    const maxMinutes = parseDurationMinutes(rule.maxDuration)
    const percents = parsePercents(rule.percent)
    if (maxMinutes === null || percents.length === 0) { invalid.push(rule); continue }
    out.push({ maxMinutes, percents })
  }
  return { rules: out, invalid }
}

/**
 * 按「创建时距开奖的时长」挑出要用的提醒百分比：
 * 取上限升序中第一个 `时长 ≤ 上限` 的行；都没有就退回不限行（没有则返回空 = 不提醒）。
 */
export function pickRemindPercents(durationMinutes: number, rules: RemindRule[] = []): number[] {
  if (!isFinite(durationMinutes) || durationMinutes <= 0) return []
  const { rules: normalized } = normalizeRules(rules)
  const bounded = normalized
    .filter((r) => r.maxMinutes !== undefined)
    .sort((a, b) => (a.maxMinutes as number) - (b.maxMinutes as number))
  const hit = bounded.find((r) => durationMinutes <= (r.maxMinutes as number))
  if (hit) return hit.percents
  const fallback = normalized.find((r) => r.maxMinutes === undefined)
  return fallback ? fallback.percents : []
}

/** 提醒时刻 = 开奖时间 − 时长 × 百分比 */
export function getRemindTimeFromPercent(endTime: Date, durationMinutes: number, percent: number): Date {
  return new Date(endTime.getTime() - durationMinutes * 60_000 * percent / 100)
}
