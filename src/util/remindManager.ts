import schedule, { Job } from 'node-schedule'
import {logger} from "../index";

interface ScheduledRemind {
  id: number
  job: Job
}

class RemindManager {
  private jobs: Map<number, ScheduledRemind>

  constructor() {
    this.jobs = new Map()
  }

  addJob(id: number, rule: schedule.RecurrenceRule | string | Date, callback: () => void): boolean {
    if (this.jobs.has(id)) {
      logger.warn(`Remind job with id ${id} already exists`)
      return false
    }

    const job = schedule.scheduleJob(rule, callback)
    // node-schedule 对「已经过去的时间点」返回 null：不能当成已排期的任务，
    // 否则既不会触发，之后 job.cancel() 还会抛异常、中断调用方的清理流程
    if (!job) {
      logger.warn(`Remind job ${id} not scheduled：时间点已过去或规则无效（${String(rule)}）`)
      return false
    }
    this.jobs.set(id, { id, job })
    logger.success(`Remind job ${id} scheduled`)
    return true
  }

  deleteJob(id: number): boolean {
    const scheduledJob = this.jobs.get(id)
    if (scheduledJob) {
      scheduledJob.job?.cancel()
      this.jobs.delete(id)
      logger.success(`Remind job ${id} deleted`)
      return true
    } else {
      logger.warn(`Remind job with id ${id} does not exist`)
      return false
    }
  }

  getJob(id: number): Job | undefined {
    const scheduledJob = this.jobs.get(id)
    return scheduledJob?.job
  }

  getAllJobs(): ScheduledRemind[] {
    return Array.from(this.jobs.values())
  }
}

export default RemindManager
