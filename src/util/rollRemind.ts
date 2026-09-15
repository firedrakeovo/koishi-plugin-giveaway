import {globalState, remindManager} from '../index'
import {getRemindTimeFromPercent, pickRemindPercents, RemindRule} from './remindPlan'

/**
 * 开奖提醒（控制台按「剩余时长区间 + 百分比」配置）。
 *
 * 手动提醒器交互已下线，提醒只由控制台 `remind.rules` 驱动：
 * 一个抽奖 × 命中的百分比 = 一个 job，job 的生命周期完全由插件管理
 * （抽奖开奖 / 过期 / 删除时一并清理，避免残留 job 在开奖后仍然播报）。
 */
const rollJobs = new Map<number, number[]>()

export type EmitFn = (event: string, ...args: any[]) => void

/**
 * 给某个抽奖按控制台规则排定提醒任务，返回真正排上的任务数。
 *
 * @param reference 计算「剩余时长」的起点：创建抽奖时是当前时刻；机器人重启重建时也是当前时刻
 *                  （即把「现在到开奖」当作剩余时长，已过去的提醒自然不会被排上）
 */
export function scheduleRollReminds(
  emit: EmitFn,
  rollId: number,
  endTime: Date | string | undefined,
  rules: RemindRule[] = [],
  reference: Date = new Date(),
): number {
  clearRollReminds(rollId)
  if (!endTime) return 0
  const end = endTime instanceof Date ? endTime : new Date(endTime)
  if (isNaN(+end)) return 0
  const durationMinutes = (end.getTime() - reference.getTime()) / 60_000
  if (durationMinutes <= 0) return 0

  const ids: number[] = []
  for (const percent of pickRemindPercents(durationMinutes, rules)) {
    const at = getRemindTimeFromPercent(end, durationMinutes, percent)
    if (isNaN(+at) || at.getTime() <= Date.now()) continue
    const id = globalState.remindInitialId++
    if (remindManager.addJob(id, at, function () {
      emit('giveaway/remind-broadcast', rollId)
    })) ids.push(id)
  }
  if (ids.length) rollJobs.set(rollId, ids)
  return ids.length
}

/** 取消某个抽奖的全部提醒任务（开奖、过期、删除时调用）。 */
export function clearRollReminds(rollId: number): number {
  const ids = rollJobs.get(rollId)
  if (!ids) return 0
  for (const id of ids) remindManager.deleteJob(id)
  rollJobs.delete(rollId)
  return ids.length
}

/** 当前已排定的提醒任务数（排查/测试用）。 */
export function pendingRollReminds(): number {
  let total = 0
  for (const ids of rollJobs.values()) total += ids.length
  return total
}
