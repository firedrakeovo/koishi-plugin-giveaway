import { DateTime } from 'luxon';
import {Config} from "../config";
import {offsetToUTCOffset} from "./time";

export function stringToPrize(s: string) {
  const lastIndex = Math.max(s.lastIndexOf('*'), s.lastIndexOf('＊'))
  if (lastIndex === -1) {
    return { name: s, amount: '1' }
  } else {
    let name = s.substring(0, lastIndex)
    let amount = s.substring(lastIndex + 1)
    if (isNaN(Number(amount)) || amount === '') {
      name += amount
      amount = '1'
    }
    return { name: name, amount: amount }
  }
}

export async function generateUniqueCode(existingCodes: string[]): Promise<string> {
  let newCode
  do {
    newCode = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  } while (existingCodes.includes(newCode))
  return newCode
}

export function checkDateInput(input: string, length: number): boolean {
  let regexPattern = ""
  // minute can be empty when the length greater than 1
  switch (length) {
    case 1:
      // minute
      regexPattern = "^\\d{1,2}$"
      break
    case 2:
      // Hour-minute
      regexPattern = "^\\d{1,2}(-\\d{1,2})?$"
      break
    case 3:
      // Day-hour-minute
      regexPattern = "^\\d{1,2}-\\d{1,2}(-\\d{1,2})?$"
      break
    case 4:
      // Month-day-hour-minute
      regexPattern = "^\\d{1,2}-\\d{1,2}-\\d{1,2}(-\\d{1,2})?$"
      break
    case 5:
      // Year-month-day-hour-minute
      regexPattern = "^\\d{1,4}-\\d{1,2}-\\d{1,2}-\\d{1,2}(-\\d{1,2})?$"
      break
    default:
      return false
  }

  const regex = new RegExp(regexPattern);

  return regex.test(input);
}

/**
 * 「开奖时间 / 提醒时间」文本 → DateTime
 *
 * 支持两种写法（模板说明与历史示例都能用）：
 * - 5 段：`年-月-日-时-分`，如 `2026-09-15-20-00`
 * - 4 段：`月-日-时-分`（年份取当前年），如 `09-15-20-00`
 *
 * 老实现按下标把第 0 段当 year：4 段输入会解析成 year=09、month=15 → Invalid Date，
 * 抽奖的自动开奖时间直接失效（模板里的示例正是 4 段写法）。
 */
export function dateInputToDateTime(input: string, offset: string): DateTime {
  const parts = String(input ?? '').split('-').map((part) => parseInt(part, 10))
  const [year, month, day, hour, minute] = parts.length >= 5
    ? parts
    : [new Date().getFullYear(), parts[0], parts[1], parts[2], parts[3]]
  return DateTime.fromObject({ year, month, day, hour, minute: minute || undefined }, { zone: offset })
}

/**
 * 把奖品输入解析成奖品列表（忽略空项，数量缺省为 1）。
 *
 * 分隔符：换行、空格、逗号（半角 `,` / 全角 `，` / 顿号 `、`），并兼容旧的 `|` / `｜`。
 * 注意奖品名里不要包含这些分隔符（带空格的名字会被拆成两个奖品）。
 */
export function parsePrizeInput(input: string) {
  return String(input ?? '')
    .split(/[\r\n\s,，、|｜]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => stringToPrize(line))
    // `显卡 *1` 这类输入会拆出 `*1`，解析后名字为空 → 丢弃
    .filter((prize) => prize.name.trim().length > 0)
}

/**
 * 解析「开奖时间 + 加入口令」的合并回答：
 * 第一段是开奖时间（`n` 表示不自动开奖），其余全部视作口令（可含空格，`n` 或留空表示不用口令）。
 * 例：`09-15-20-00 参加` / `n 参加` / `09-15-20-00`（口令默认不用）/ `n n`
 */
export function parseTimeAndKey(input: string) {
  const parts = String(input ?? '').trim().split(/\s+/).filter(Boolean)
  const timeInput = parts.shift() ?? 'n'
  const keyInput = parts.join(' ')
  return { timeInput, keyInput }
}


/** 创建模板里的字段（三种语言都认） */
const CREATE_LABELS: Record<string, 'prize' | 'time' | 'key' | 'title' | 'description' | 'policy'> = {
  '奖品': 'prize', 'prizes': 'prize', 'prize': 'prize', 'preise': 'prize',
  '开奖时间': 'time', 'end time': 'time', 'endtime': 'time', 'endzeit': 'time',
  '加入口令': 'key', 'join key': 'key', 'joinkey': 'key', 'beitrittswort': 'key',
  '标题': 'title', 'title': 'title', 'titel': 'title',
  '描述': 'description', 'description': 'description', 'beschreibung': 'description',
  '参与条件': 'policy', 'conditions': 'policy', 'condition': 'policy',
  'bedingungen': 'policy', 'bedingung': 'policy',
}

/**
 * 解析「文字表格」形式的创建输入，例如：
 *
 * ```
 * 奖品：显卡*1|鼠标*2
 * 开奖时间：09-15-20-00
 * 加入口令：参加
 * 标题：
 * 描述：
 * ```
 *
 * 按**标签**取值（不认位置），因此群里的随口一句不会被当成奖品；
 * 未填写的项留空，由调用方按默认处理。
 */
export function parseCreateForm(input: string) {
  const fields: Record<string, string> = {}
  for (const line of String(input ?? '').split(/\r\n|\r|\n/)) {
    // 标签取「冒号前的整段」（英文标签含空格，如 `End time:`）
    const matched = /^\s*([^:：\n]{1,24}?)\s*[:：]\s*(.*)$/.exec(line)
    if (!matched) continue
    const field = CREATE_LABELS[matched[1].trim().toLowerCase()] ?? CREATE_LABELS[matched[1].trim()]
    if (field) fields[field] = matched[2].trim()
  }
  const result = {
    prizeInput: fields.prize ?? '',
    timeInput: fields.time ?? '',
    keyInput: fields.key ?? '',
    titleInput: fields.title ?? '',
    descriptionInput: fields.description ?? '',
    policyInput: fields.policy ?? '',
  }
  if (!result.prizeInput) return { ok: false as const, error: 'no-prize' as const, ...result }
  if (result.timeInput !== '' && result.timeInput !== 'n' && !checkDateInput(result.timeInput, 5)) {
    return { ok: false as const, error: 'time' as const, ...result }
  }
  return { ok: true as const, error: null, ...result }
}
