import { DateTime, Duration } from 'luxon';
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

export function dateInputToDateTime(input: string, offset: string): DateTime {
  const timeArray = input.split('-')
  const t = {
    year: parseInt(timeArray[0]),
    month: parseInt(timeArray[1]),
    day: parseInt(timeArray[2]),
    hour: parseInt(timeArray[3]),
    minute: parseInt(timeArray[4]) || undefined
  }
  return DateTime.fromObject(t, { zone: offset })
}

export function dateInputToDuration(input: string): Duration {
  const timeArray = input.split('-')
  const t = {
    years: parseInt(timeArray[0]),
    months: parseInt(timeArray[1]),
    days: parseInt(timeArray[2]),
    hours: parseInt(timeArray[3]),
    minutes: parseInt(timeArray[4]) || undefined
  }
  return Duration.fromObject(t)
}

export function getRemindValueFromReminder(endTime: Date, reminder: any) {
  switch (reminder.type) {
    case '0':
      return reminder.time
    case '1':
      return DateTime.fromJSDate(endTime).minus(reminder.duration).toJSDate()
    case '2':
      return reminder.recurrence_rule
    default:
      return
  }
}

export function getRemindValueFromDefaultReminder(endTime: Date, reminder: any, config: Config) {
  // {type: string, value: string}
  // Date / Duration / RecurrenceRule
  const offset = offsetToUTCOffset(config.basic.defaultTimeOffset)
  switch (reminder.type) {
    case '0':
      return dateInputToDateTime(reminder.value, offset).toJSDate()
    case '1':
      const duration = dateInputToDuration(reminder.value)
      return DateTime.fromJSDate(endTime).minus(duration).toJSDate()
    case '2':
      // TODO: Support default interval reminder
      return
    default:
      return
  }
}

/** 把「一行一个奖品」的输入解析成奖品列表（忽略空行，数量缺省为 1） */
export function parsePrizeInput(input: string) {
  return String(input ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => stringToPrize(line))
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
