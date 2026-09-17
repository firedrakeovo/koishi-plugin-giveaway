// 交互边界回归：加入/退出/开奖/排期/清理 上的硬性问题（都曾真实存在，逐条锁定）
const path = require('path')
const ROOT = path.join(__dirname, '..')
const { Context, Service } = require('koishi')
const { DateTime } = require('luxon')
const perm = require(path.join(__dirname, '.perm.cjs'))

let pass = 0, fail = 0
const ok = (n, c, extra) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c || extra === undefined ? '' : ' → ' + JSON.stringify(extra)}`) }

/** 记录所有写操作与删除操作，便于断言「有没有被写进去」 */
class RecordingDb extends Service {
  constructor(ctx) {
    super(ctx, 'database', true)
    this.rolls = []
    this.members = []
    this.binds = [{ aid: 1, platform: 'test', pid: '10001' }]
    this.created = []
    this.removed = []
    Object.assign(this, {
      get: async (table, query = {}) => {
        if (table === 'roll') {
          return this.rolls.filter((r) => (query.roll_code === undefined || r.roll_code === query.roll_code)
            && (query.id === undefined || r.id === query.id)
            && (query.isEnd === undefined || Number(!!r.isEnd) === Number(query.isEnd)))
        }
        if (table === 'roll_channel') return this.rolls.map((r) => ({ roll_id: r.id, channel_id: 'g1', channel_platform: 'test' }))
        if (table === 'roll_member') return this.members.filter((m) => m.roll_id === query.roll_id && (query.user_id === undefined || m.user_id === query.user_id))
        if (table === 'binding') return this.binds
        if (table === 'user' || table === 'channel') return [{ id: 0, offset: '', locales: [] }]
        if (table === 'roll_creator') return this.rolls.map((r) => ({ roll_id: r.id, user_id: 0 }))
        return []
      },
      create: async (table, data) => {
        // 模拟数据库唯一索引：roll_member 的 (roll_id, user_id) 重复时抛错
        if (table === 'roll_member' && this.enforceUnique !== false
          && this.members.some((m) => m.roll_id === data.roll_id && m.user_id === data.user_id)) {
          const err = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: roll_member.roll_id, roll_member.user_id')
          err.code = 'SQLITE_CONSTRAINT'
          throw err
        }
        this.created.push([table, data])
        if (table === 'roll') this.rolls.push({ ...data, id: this.rolls.length + 1 })
        if (table === 'roll_member') this.members.push({ ...data, id: this.members.length + 1 })
        return { ...data, id: 1 }
      },
      set: async () => { return [] },
      remove: async (table, query) => { this.removed.push([table, query]) },
      upsert: async () => [], eval: async () => [],
      join: () => ({ execute: async () => [] }),
    })
  }
}
class AssetsStub extends Service {
  constructor(ctx) { super(ctx, 'assets', true); this.transform = async (s) => s }
}

/** 等条件成立（事件监听器是异步的：断言与 app.stop() 之前必须等它写完） */
async function waitFor(cond, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (cond()) return true
    await new Promise((r) => setTimeout(r, 20))
  }
  return false
}

const mkSession = (app, sent) => ({
  app, user: { id: 0, authority: 5, offset: '', locales: [] }, channel: { id: 'g1', offset: '', locales: [] },
  channelId: 'g1', guildId: 'g1', platform: 'test', userId: '10001', locales: ['zh-CN'],
  author: { name: 't' }, event: { platform: 'test', member: { roles: [] } }, messageId: 'm1',
  async send(m) { sent && sent.push(String(m)); return [] },
  sendQueued(m) { sent && sent.push(String(m)); return [] },
  async prompt() { return undefined },
  text: (key, params) => key + (params ? JSON.stringify(params) : ''),
})

async function mkApp(config = {}) {
  const app = new Context({ prefix: ['.', ''] })
  app.plugin(RecordingDb); app.plugin(AssetsStub)
  const mod = require(ROOT)
  app.plugin(mod.default || mod, { render: { create: false, detail: false, member: false, list: false, result: false }, ...config })
  await app.start()
  await new Promise((r) => setTimeout(r, 200))
  return app
}

;(async () => {
  console.log('=== 1. 加入 / 退出：编号不存在时不抛异常 ===')
  {
    const app = await mkApp()
    app.database.rolls = []
    const sent = []
    const session = mkSession(app, sent)
    const joinOut = await app.$commander.resolve('加入抽奖')._actions[0]({ session, options: {} }, '9999')
    ok('加入不存在的编号 → 返回 notFound 文案', joinOut === '.notFound', joinOut)
    const quitOut = await app.$commander.resolve('退出抽奖')._actions[0]({ session, options: {} }, '9999')
    ok('退出不存在的编号 → 返回 notFound 文案', quitOut === '.notFound', quitOut)
    await app.stop()
  }

  console.log('=== 2. 没有 binding 的用户：给提示而不是崩溃 ===')
  {
    const app = await mkApp()
    app.database.rolls = [{ id: 1, roll_code: '5645', title: 't', isEnd: 0, isAutoEnd: 0, rollType: '1', joinKey: '' }]
    app.database.binds = []
    const session = mkSession(app)
    const out = await app.$commander.resolve('加入抽奖')._actions[0]({ session, options: {} }, '5645')
    ok('无 binding → 返回 noBinding 文案', out === '.noBinding', out)
    ok('无 binding → 不写入参与记录', app.database.created.filter(([t]) => t === 'roll_member').length === 0)
    await app.stop()
  }

  console.log('=== 3. 已开奖的抽奖：不能加入、不能退出（两条路径统一拦截）===')
  {
    const app = await mkApp()
    app.database.rolls = [{ id: 1, roll_code: '5645', title: 't', isEnd: 1, isAutoEnd: 1, rollType: '1', joinKey: '' }]
    const sent = []
    const session = mkSession(app, sent)
    await app.$commander.resolve('加入抽奖')._actions[0]({ session, options: {} }, '5645')
    await waitFor(() => sent.some((m) => m.startsWith('events.join.ended')))
    ok('指令路径加入已开奖抽奖 → 未写入参与记录', app.database.created.filter(([t]) => t === 'roll_member').length === 0)
    ok('指令路径加入已开奖抽奖 → 回复「已开奖」', sent.some((m) => m.startsWith('events.join.ended')), sent)

    // 关键词路径（直接 emit 同一事件）也应被拦住
    app.database.created.length = 0
    app.emit('giveaway/roll-join', session, 1, 1, '5645')
    await new Promise((r) => setTimeout(r, 100))
    ok('关键词路径加入已开奖抽奖 → 同样未写入', app.database.created.filter(([t]) => t === 'roll_member').length === 0)

    const quitOut = await app.$commander.resolve('退出抽奖')._actions[0]({ session, options: {} }, '5645')
    await waitFor(() => sent.some((m) => m.startsWith('events.quit.ended')))
    ok('已开奖不能退出（名单已定）', app.database.removed.filter(([t]) => t === 'roll_member').length === 0 && sent.some((m) => m.startsWith('events.quit.ended')), quitOut)
    await app.stop()
  }

  console.log('=== 4. 中奖名额：不允许重复中奖时不超过参与人数 ===')
  {
    const { uniqueWinners, getWinnerList } = perm
    const few = uniqueWinners(['u1', 'u2'], [1, 2, 3, 4, 5])
    ok('2 人 / 5 个奖品 → 只抽 2 个名额', few.length === 2, few.length)
    ok('2 人 / 5 个奖品 → 没有重复中奖者', new Set(few.map((w) => w.userId)).size === 2, few)
    const many = uniqueWinners(['u1', 'u2', 'u3'], [1, 2])
    ok('人多奖少 → 抽满奖品数且不重复', many.length === 2 && new Set(many.map((w) => w.userId)).size === 2, many)

    // 历史脏数据（同一人两条参与记录）也不会被抽中两次
    const fakeCtx = {
      database: {
        get: async (table) => table === 'roll_member' ? [{ user_id: 5 }, { user_id: 5 }]
          : table === 'roll_prize' ? [{ prize_id: 9 }]
            : table === 'prize' ? [{ id: 9, amount: 2 }]
              : table === 'roll' ? [{ id: 1, rollType: '1' }] : [],
      },
    }
    const winners = await getWinnerList(fakeCtx, 1)
    ok('参与记录重复时按 user_id 去重（只中一次）', winners.length === 1 && winners[0].userId === 5, winners)
  }

  console.log('=== 4.5 参与记录的唯一索引 ===')
  {
    // 声明层面：roll_member 必须带 (roll_id, user_id) 唯一索引（防止并发重复写入）
    const dbSrc = require('fs').readFileSync(path.join(ROOT, 'src/database.ts'), 'utf8')
    const block = dbSrc.slice(dbSrc.indexOf("ctx.model.extend('roll_member'"), dbSrc.indexOf("ctx.model.extend('roll_channel'"))
    ok('database.ts 给 roll_member 声明了 (roll_id, user_id) 唯一索引',
      /unique:\s*\[\s*\[\s*'roll_id'\s*,\s*'user_id'\s*\]\s*\]/.test(block), block.slice(0, 160))

    // 行为层面：即使并发下真的撞上唯一约束，也要按「已参与」回应而不是抛异常
    const app = await mkApp()
    app.database.rolls = [{ id: 1, roll_code: '5645', title: 't', isEnd: 0, isAutoEnd: 0, rollType: '1', joinKey: '' }]
    const sent = []
    const session = mkSession(app, sent)
    // 先造一条已有的参与记录，再让处理器去写（桩会抛唯一约束）
    app.database.members.push({ roll_id: 1, user_id: 1 })
    app.database.created.length = 0
    app.emit('giveaway/roll-join', session, 1, 1, '5645')
    await waitFor(() => sent.length > 0)
    ok('撞上唯一约束 → 按「已参与」提示，不抛异常', sent.some((m) => m.startsWith('events.roll.add.failed')), sent)
    ok('撞上唯一约束 → 没有写入第二条记录', app.database.created.filter(([t]) => t === 'roll_member').length === 0)
    await app.stop()
  }

  console.log('=== 5. 排期：过去的时间点不再被当成「已排期」 ===')
  {
    const mod = require(ROOT)
    const past = new Date(Date.now() - 60_000)
    const queued = mod.autoEndManager.addJob(90001, past, () => {})
    ok('autoEndManager.addJob(过去时间) → false', queued === false, queued)
    ok('未排期的任务不会被记进 jobs', mod.autoEndManager.getAllJobs().filter((j) => j.id === 90001).length === 0)
    let threw = null
    try { mod.autoEndManager.deleteJob(90001) } catch (e) { threw = e }
    ok('删除未排期任务不抛异常', threw === null, threw && threw.message)

    const future = new Date(Date.now() + 3600_000)
    ok('未来的时间点仍能正常排期', mod.autoEndManager.addJob(90002, future, () => {}) === true)
    mod.autoEndManager.deleteJob(90002)
  }

  console.log('=== 6. 创建抽奖：拒绝过去的开奖时间 ===')
  {
    const app = await mkApp()
    const sent = []
    const session = mkSession(app, sent)
    const out = await app.$commander.resolve('创建抽奖')._actions[0]({ session, options: {} }, '显卡*1', '2020-01-01-00-00')
    ok('过去的开奖时间 → 提示 timePast 并取消', out === '.cancelled' && sent.some((m) => m === '.timePast'), [out, sent])
    ok('过去的开奖时间 → 没有创建抽奖', app.database.rolls.length === 0)
    ok('过去的开奖时间 → 没有排自动开奖任务', require(ROOT).autoEndManager.getAllJobs().filter((j) => j.job).length === 0)

    const form = ['奖品：显卡*1', `开奖时间：${DateTime.now().setZone('UTC+8').plus({ hours: 2 }).toFormat('yyyy-MM-dd-HH-mm')}`].join('\n')
    const okSession = mkSession(app, [])
    await app.$commander.resolve('创建抽奖')._actions[0]({ session: okSession, options: {} })
    await new Promise((r) => setTimeout(r, 200))
    await app.$commander.resolve('创建抽奖')._actions[0]({ session: { ...okSession, prompt: async () => form }, options: {} })
    await waitFor(() => app.database.created.filter(([t]) => t === 'roll_channel').length === 1)
    ok('未来的开奖时间 → 正常创建', app.database.rolls.length === 1, app.database.rolls.length)
    ok('roll-add 监听器把奖品 / 频道关联都写完了', app.database.created.filter(([t]) => ['roll', 'prize', 'roll_prize', 'roll_creator', 'roll_channel'].includes(t)).length === 5,
      app.database.created.map(([t]) => t))
    await app.stop()
  }

  console.log('=== 7. 4 段式开奖时间取「目标时区」的年份 ===')
  {
    const { dateInputToDateTime } = perm
    const far = 'UTC+14'
    const dt = dateInputToDateTime('12-31-23-59', far)
    ok('年份 = 目标时区当前年（不是宿主机年份）',
      dt.isValid && dt.year === DateTime.now().setZone(far).year, [dt.isValid, dt.year, DateTime.now().setZone(far).year])
  }

  console.log('=== 8. 记录过期清理覆盖 roll_policy ===')
  {
    const app = await mkApp()
    app.database.rolls = [{ id: 1, roll_code: '5645', title: 't', isEnd: 1, isAutoEnd: 1, rollType: '1' }]
    app.emit('giveaway/roll-expired', 1)
    await waitFor(() => app.database.removed.map(([t]) => t).includes('roll_policy'))
    const tables = app.database.removed.map(([t]) => t)
    ok('清理了 roll_policy（per-roll 参与条件）', tables.includes('roll_policy'), tables)
    for (const t of ['roll', 'roll_creator', 'roll_member', 'roll_channel', 'roll_prize']) {
      ok(`清理了 ${t}`, tables.includes(t), tables)
    }
    await app.stop()
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('❌ 运行失败:', e); process.exit(1) })
