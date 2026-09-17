import { Context } from "koishi"

declare module 'koishi' {
  interface Tables {
    roll: Roll,
    prize: Prize,
    roll_creator: RollCreator,
    roll_member: RollMember,
    roll_channel: RollChannel,
    roll_prize: RollPrize,
    user_prize: UserPrize
    roll_policy: RollPolicy
  }
  interface User {
    offset: string
  }
  interface Channel {
    offset: string
  }
}

export interface Roll {
  id: number
  roll_code: string
  platform: string
  joinKey: string
  isAutoEnd: number
  rollType: string
  endTime: Date
  isEnd: number
  title: string
  description: string
}

export interface RollPolicy {
  id: number
  roll_id: number
  minGroupLevel: number
  minActiveDays: number
  minContinuousDays: number
  requiredHonors: string
}

export interface Prize {
  id: number
  name: string
  amount: number
}

export interface RollCreator {
  id: number
  roll_id: number
  user_id: number
}

export interface RollMember {
  id: number
  roll_id: number
  user_id: number
}

export interface RollChannel {
  id: number
  roll_id: number
  channel_id: string
  channel_platform: string
}

export interface RollPrize {
  id: number
  roll_id: number
  prize_id: number
}

export interface UserPrize {
  id: number
  user_id: number
  prize_id: number
  amount: number
}

export const name = 'Database'

export function apply(ctx: Context) {
  ctx.model.extend('user', {
    offset: 'string',
  })

  ctx.model.extend('channel', {
    offset: 'string',
  })

  ctx.model.extend('roll', {
    id: 'unsigned',
    roll_code: 'string',
    platform: 'string',
    joinKey: 'string',
    isAutoEnd: 'integer',
    rollType: 'string',
    endTime: 'timestamp',
    isEnd: 'integer',
    title: 'string',
    description: 'string'
  }, {
    autoInc: true,
  })

  ctx.model.extend('prize', {
    id: 'unsigned',
    name: 'string',
    amount: 'unsigned'
  }, {
    autoInc: true,
  })

  // 单个抽奖的参与条件（per-roll 覆盖；没有行 = 沿用控制台全局配置）
  ctx.model.extend('roll_policy', {
    id: 'unsigned',
    roll_id: 'unsigned',
    minGroupLevel: 'unsigned',
    minActiveDays: 'unsigned',
    minContinuousDays: 'unsigned',
    requiredHonors: 'string',
  }, {
    autoInc: true,
  })

  ctx.model.extend('roll_creator', {
    id: 'unsigned',
    roll_id: 'unsigned',
    user_id: 'unsigned'
  }, {
    autoInc: true,
  })

  ctx.model.extend('roll_member', {
    id: 'unsigned',
    roll_id: 'unsigned',
    user_id: 'unsigned'
  }, {
    autoInc: true,
    // 同一个抽奖里同一用户只能有一条参与记录（并发重复写入由数据库兜底）。
    // 注意：`unique: [[...]]` 只在**新建表**时写入表级约束，已存在的表不会被补；
    // 用 `indexes` 声明唯一索引则会在表首次被访问时创建，老库同样生效。
    // minato 的 IndexDef 类型漏了 `unique` 字段（运行时 parseIndex 支持），这里按运行时能力声明
    indexes: [{ keys: { roll_id: 'asc', user_id: 'asc' }, unique: true } as any],
  })

  ctx.model.extend('roll_channel', {
    id: 'unsigned',
    roll_id: 'unsigned',
    channel_id: 'string',
    channel_platform: 'string'
  }, {
    autoInc: true,
  })

  ctx.model.extend('roll_prize', {
    id: 'unsigned',
    roll_id: 'unsigned',
    prize_id: 'unsigned'
  }, {
    autoInc: true,
  })

  ctx.model.extend('user_prize', {
    id: 'unsigned',
    user_id: 'unsigned',
    prize_id: 'unsigned',
    amount: 'unsigned'
  }, {
    autoInc: true,
  })
}
