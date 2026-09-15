import {globalState, remindManager} from '../index'
import {getRemindValueFromBeforeEnd} from './general'

/**
 * 开奖提醒（控制台配置的「开奖前 N」）。
 *
 * 手动提醒器交互已下线，提醒只由控制台 `remind.beforeEnd` 驱动：
 * 每个抽奖 × 每个偏移 = 一个 job，job 的生命周期完全由插件管理
 * （抽奖开奖 / 过期 / 删除时一并清理，避免残留 job 在开奖后仍然播报）。
 */
const rollJobs = new Map<number, number[]>()

export type EmitFn = (event: string, ...args: any[]) => void

/** 给某个抽奖按偏移排定提醒任务，返回真正排上的任务数（已过去的偏移会被跳过）。 */
export function scheduleRollReminds(emit: EmitFn, rollId: number, endTime: Date | string | undefined, offsets: string[] = []): number {
  clearRollReminds(rollId)
  if (!endTime) return 0
  const end = endTime instanceof Date ? endTime : new Date(endTime)
  if (isNaN(+end)) return 0
  const ids: number[] = []
  for (const offset of offsets ?? []) {
    let at: Date
    try {
      at = getRemindValueFromBeforeEnd(end, offset)
    } catch {
      continue   // 配置写坏了（例如偏移为空行）就跳过，不影响创建抽奖
    }
    if (!at || isNaN(+at) || at.getTime() <= Date.now()) continue
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
