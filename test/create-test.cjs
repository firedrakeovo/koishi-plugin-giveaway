const path = require('path')
const fs = require('fs')
const ROOT = path.join(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')
const LOCALES_DIR = path.join(SRC_DIR, 'locales')

// 真实驱动 giveaway.add：文字表格模板流程（模板 → 一条填写后的回复 → 成功或取消）
const { Context, Service } = require('koishi')
const PLUGIN = ROOT

class DbStub extends Service {
  constructor(ctx) {
    super(ctx, 'database', true)
    this.policyRows = []
    Object.assign(this, {
      get: async (table, query) => table === 'roll_policy'
        ? this.policyRows.filter((row) => !query?.roll_id || row.roll_id === query.roll_id)
        : (table === 'user' || table === 'channel') ? [{ id: 0, offset: '' }] : [],
      create: async () => ({ id: 1 }),
      upsert: async () => [], remove: async () => [], set: async () => [], eval: async () => [],
      join: () => ({ execute: async () => [] }),
    })
  }
}
class AssetsStub extends Service {
  constructor(ctx) { super(ctx, 'assets', true); this.transform = async (s) => s }
}
function makeSession(answers) {
  const sent = []
  return {
    sent,
    session: {
      user: { id: 0, authority: 5, name: '测试者', offset: '' },
      channel: { id: 'g1', offset: '' },
      channelId: 'g1', guildId: 'g1', platform: 'onebot', userId: '10001',
      author: { name: '测试者' },
      event: { platform: 'onebot' },
      async send(m) { sent.push(String(m)); return [] },
      async prompt() { return answers.length ? answers.shift() : undefined },
      text: (key) => key,
    },
  }
}
let pass = 0, fail = 0
const ok = (n, c, extra) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c || extra === undefined ? '' : ' → ' + JSON.stringify(extra)}`) }

;(async () => {
  const app = new Context({ prefix: ['.', ''], nickname: ['ob'] })
  app.plugin(DbStub); app.plugin(AssetsStub)
  const mod = require(PLUGIN)
  app.plugin(mod.default || mod, {})
  await app.start()
  const command = app.$commander.resolve('giveaway.add')
  ok('指令已注册', !!command)

  let captured = null
  const dispose = app.on('giveaway/roll-add', (session, roll, prizes, extra) => { captured = { roll, prizes, extra } })
  const run = async ({ answers = [], options = {}, positional = [] } = {}) => {
    const { session, sent } = makeSession(answers.slice())
    captured = null
    const result = await command._actions[0]({ session, options }, ...positional)
    return { sent, result, captured: captured }
  }

  console.log('=== 1. 模板流程：完整填写 ===')
  {
    const form = ['奖品：显卡*1，鼠标*2', '开奖时间：09-15-20-00', '加入口令：参加', '标题：双十一抽奖', '描述：满 40 级可参加'].join('\n')
    const { sent, result, captured: c } = await run({ answers: [form] })
    ok('先发出了模板', sent[0] === '.createForm', sent)
    ok('一次往返即完成', sent.length === 1, sent)
    ok('创建成功（带口令时提示含口令）', result === '.successWithKey', result)
    ok('两个奖品', c.prizes.length === 2 && c.prizes[1].name === '鼠标', c.prizes)
    ok('时间与口令生效', c.roll.isAutoEnd === true && c.roll.joinKey === '参加', [c.roll.isAutoEnd, c.roll.joinKey])
    ok('开奖时间是有效日期（4 段写法不再解析成 Invalid Date）',
      c.roll.endTime instanceof Date && !isNaN(+c.roll.endTime), String(c.roll.endTime))
    ok('标题/描述来自表格', c.roll.title === '双十一抽奖' && c.roll.description === '满 40 级可参加', [c.roll.title, c.roll.description])
  }

  console.log('=== 2. 不填的项按默认（留空即可）===')
  {
    const { captured: c } = await run({ answers: ['奖品：显卡*1'] })
    ok('只填奖品也能创建', !!c && c.prizes.length === 1, c && c.prizes)
    ok('时间留空 → 不自动开奖', c.roll.endTime === '' && c.roll.isAutoEnd === false, c.roll.endTime)
    ok('口令留空 → 不用口令', c.roll.joinKey === '', c.roll.joinKey)
    ok('标题/描述走默认', c.roll.title === '.defaultTitle' && c.roll.description === '.defaultDescription')
  }
  {
    const { captured: c } = await run({ answers: ['奖品：显卡*1\n开奖时间：\n加入口令：\n标题：\n描述：'] })
    ok('全部留空的模板也按默认处理', c.roll.isAutoEnd === false && c.roll.joinKey === '' && c.roll.title === '.defaultTitle', [c.roll.isAutoEnd, c.roll.joinKey])
  }

  console.log('=== 3. 按标签解析：闲聊/无标签回复一律取消 ===')
  {
    const { sent, result, captured: c } = await run({ answers: ['在吗，今天天气不错'] })
    ok('提示未找到奖品行', sent.includes('.noPrize'), sent)
    ok('返回取消提示', result === '.cancelled', result)
    ok('没有创建任何抽奖', c === null)
  }
  {
    const { sent, result, captured: c } = await run({ answers: ['开奖时间：09-15-20-00'] })
    ok('只有时间没有奖品 → 取消', sent.includes('.noPrize') && result === '.cancelled' && c === null, sent)
  }
  {
    const { sent, result, captured: c } = await run({ answers: ['奖品：显卡*1\n开奖时间：明天晚上'] })
    ok('时间非法 → 报时间错并取消', sent.includes('.timeError') && result === '.cancelled' && c === null, sent)
  }

  console.log('=== 4. 容错：全角冒号 / 附带说明行 / 英文标签 ===')
  {
    const text = '请复制下面这份模板：\n奖品：显卡*1\n开奖时间：n\n说明：多个奖品用 | 分隔\n加入口令：参加'
    const { captured: c } = await run({ answers: [text] })
    ok('全角冒号 + 说明行都被正确处理', !!c && c.prizes.length === 1 && c.roll.joinKey === '参加' && c.roll.endTime === '', c && [c.roll.joinKey, c.roll.endTime])
  }
  {
    const { captured: c } = await run({ answers: ['Prizes: keyboard*1\nEnd time: 09-15-20-00\nJoin key: join'] })
    ok('英文标签同样识别', !!c && c.roll.joinKey === 'join' && c.roll.isAutoEnd === true, c && c.roll.joinKey)
  }
  {
    const { captured: c } = await run({ answers: ['奖品：显卡*1\n开奖时间：09-15-20-00', ''] })
    ok('多余的一行不影响', !!c)
  }

  console.log('=== 5. 取消 / 超时 ===')
  {
    const { result, captured: c } = await run({ answers: ['q'] })
    ok('回复 q → 取消', result === '.quit' && c === null, result)
    for (const word of ['cancel', '取消', 'abbrechen', 'CANCEL']) {
      const r = await run({ answers: [word] })
      ok(`回复「${word}」→ 取消（中/英/德都认）`, r.result === '.quit' && r.captured === null, r.result)
    }
  }
  {
    const { result, captured: c } = await run({ answers: ['取消'] })
    ok('回复「取消」→ 取消', result === '.quit' && c === null, result)
  }
  {
    const { result, captured: c } = await run({ answers: [] })
    ok('不回复 → 取消', result === '.cancelled' && c === null, result)
  }

  console.log('=== 6. 带参数：跳过模板（零往返）===')
  {
    const { sent, captured: c } = await run({ positional: ['显卡*1', '09-15-20-00', '参加'] })
    ok('没有输出模板', sent.length === 0, sent)
    ok('参数生效', c.roll.joinKey === '参加' && c.roll.isAutoEnd === true)
  }
  {
    const { captured: c } = await run({ positional: ['显卡*1', 'n', 'n'], options: { title: '命令行标题', repeat: true } })
    ok('命令行选项生效', c.roll.title === '命令行标题' && c.roll.rollType === '0', [c.roll.title, c.roll.rollType])
  }

  console.log('=== 7. 表格里的值优先于命令行选项 ===')
  {
    const { captured: c } = await run({ answers: ['奖品：显卡*1\n标题：表格标题'], options: { title: '命令行标题' } })
    ok('表格标题覆盖 -t', c.roll.title === '表格标题', c.roll.title)
  }

  console.log('=== 8. parseCreateForm 单测 ===')
  {
    const { parseCreateForm } = require(path.join(__dirname, '.perm.cjs'))
    const r1 = parseCreateForm('奖品：显卡*1\n开奖时间：09-15-20-00\n加入口令：参加')
    ok('三项解析正确', r1.ok && r1.prizeInput === '显卡*1' && r1.timeInput === '09-15-20-00' && r1.keyInput === '参加', r1)
    ok('缺奖品 → no-prize', parseCreateForm('开奖时间：09-15-20-00').error === 'no-prize')
    ok('时间非法 → time', parseCreateForm('奖品：x\n开奖时间：明天').error === 'time')
    ok('时间留空合法', parseCreateForm('奖品：x\n开奖时间：').ok === true)
    ok('整段复制也算通过（说明行被忽略）', parseCreateForm('说明：随便写点什么\n奖品：x').ok === true)
    ok('德语标签可识别', parseCreateForm('Preise: x\nEndzeit: n').ok === true)
  }

console.log('=== 9. 奖品分隔符：逗号为主，竖线仍兼容 ===')
{
  const { parsePrizeInput } = require(path.join(__dirname, '.perm.cjs'))
  const cases = [
    ['显卡*1,鼠标*2', 2, '半角逗号'],
    ['显卡*1，鼠标*2', 2, '全角逗号'],
    ['显卡*1、鼠标*2', 2, '顿号'],
    ['显卡*1|鼠标*2', 2, '竖线（兼容）'],
    ['显卡，鼠标，键盘', 3, '多个逗号'],
    ['显卡*2', 1, '单个奖品'],
    ['显卡*1 鼠标*2', 2, '空格分隔'],
    ['显卡 鼠标 键盘', 3, '空格分隔（无数量）'],
    ['显卡*1  鼠标*2\n键盘*3', 3, '空格+换行混用'],
    ['显卡 *1', 1, '名称与数量间多了空格（不产生空名碎片）'],
  ]
  for (const [input, want, label] of cases) ok(`${label} → ${want} 个奖品`, parsePrizeInput(input).length === want, parsePrizeInput(input))
  ok('逗号分隔时名称与数量都正确',
    JSON.stringify(parsePrizeInput('显卡*2，鼠标')) === '[{"name":"显卡","amount":"2"},{"name":"鼠标","amount":"1"}]', parsePrizeInput('显卡*2，鼠标'))
}
{
  const { captured: c } = await run({ answers: ['奖品：显卡*1、鼠标*2、键盘*3'] })
  ok('顿号分隔也能创建出 3 个奖品', c.prizes.length === 3 && c.prizes[2].name === '键盘', c.prizes)
}
{
  const { captured: c } = await run({ answers: ['奖品：显卡*2 鼠标 键盘*3'] })
  ok('空格分隔端到端可用', c.prizes.length === 3 && c.prizes[0].amount === '2' && c.prizes[1].amount === '1', c.prizes)
}

console.log('=== 10. 成功提示 / 模板纯文本 ===')
{
  const { result } = await run({ answers: ['奖品：显卡*1'] })
  ok('无口令时用普通成功提示', result === '.success', result)
}
{
  const yaml = require('js-yaml'), fs = require('fs')
  for (const loc of ['zh-CN', 'en-US', 'de-DE']) {
    const text = yaml.load(fs.readFileSync(`${LOCALES_DIR}/${loc}.yml`, 'utf8'))
      .commands['giveaway.add'].messages.createForm
    ok(`${loc} 模板是纯文本（无标签，便于复制）`, !/[<>]/.test(text), text.slice(0, 30))
    const labels = ['奖品：', '开奖时间：', '加入口令：', '标题：', '描述：']
    if (loc === 'zh-CN') ok('中文模板含五个标签行', labels.every((l) => text.includes(l)))
  }
}

console.log('=== 11. 参与条件：沿默认 / 删空 / 改写 ===')
{
  const { Context } = require('koishi')
  const app2 = new Context({ prefix: ['.', ''] })
  app2.plugin(DbStub); app2.plugin(AssetsStub)
  app2.plugin(mod, { join: { minGroupLevel: 40, minActiveDays: 1 } })
  await app2.start()
  const cmd2 = app2.$commander.resolve('giveaway.add')
  let cap = null
  app2.on('giveaway/roll-add', (s2, roll, prizes, extra) => { cap = { roll, prizes, extra } })
  const run2 = async (answer) => {
    const { session, sent } = makeSession([answer]); cap = null
    const result = await cmd2._actions[0]({ session, options: {} })
    return { sent, result, cap }
  }

  const keep = await run2('奖品：显卡*1\n参与条件：等级≥40 活跃≥1')
  ok('① 沿默认（与全局等价）→ 不落 per-roll 覆盖', !!keep.cap && !keep.cap.extra.policy, keep.cap && keep.cap.extra)
  const blank = await run2('奖品：显卡*1\n参与条件：')
  ok('② 删空 → 落一行"不限制"', !!blank.cap && !!blank.cap.extra.policy
    && blank.cap.extra.policy.minGroupLevel === 0 && blank.cap.extra.policy.requiredHonors.length === 0, blank.cap && blank.cap.extra)
  const custom = await run2('奖品：显卡*1\n参与条件：等级≥60 标识=龙王')
  ok('③ 改写 → 存自定义条件', !!custom.cap && custom.cap.extra.policy.minGroupLevel === 60
    && JSON.stringify(custom.cap.extra.policy.requiredHonors) === '["dragon"]', custom.cap && custom.cap.extra)
  const bad = await run2('奖品：显卡*1\n参与条件：随便写点什么')
  ok('④ 无法识别 → 报错并取消（未创建）', bad.sent.includes('.policyError') && bad.result === '.cancelled' && bad.cap === null, bad.sent)
  await app2.stop()
}

console.log('=== 12. 参与条件文本：渲染与解析 ===')
{
  const { renderPolicy, parsePolicy, policyFromConfig, policyEquals, mergePolicy, Config } = require(path.join(__dirname, '.perm.cjs'))
  const cfg = Config({ join: { minGroupLevel: 40, minActiveDays: 1, minContinuousDays: 7, requiredHonors: ['fire7', 'dragon'], honorMode: 'all', dragonScope: 'current' } })
  const policy = policyFromConfig(cfg)
  const text = renderPolicy(policy, 'zh')
  ok('渲染出的条件文本（不含「模式」）', text === '等级≥40 活跃≥1 连续≥7 标识=群聊之火,龙王', text)
  const back = parsePolicy(text)
  ok('渲染→解析往返一致', back.ok && policyEquals(back.policy, policy), back.policy)
  ok('留空 → 不限制', parsePolicy('').ok && !parsePolicy('').policy.minGroupLevel)
  ok('英文标签可解析', parsePolicy('Level≥50 Honors=blaze').policy.minGroupLevel === 50)
  ok('德文标签可解析', parsePolicy('Stufe≥30 Abzeichen=Feuer').policy.minGroupLevel === 30)
  const bad = parsePolicy('等级≥40 胡说八道')
  ok('无法识别 → 回传 unknown', bad.ok === false && !!bad.unknown, bad.unknown)
  ok('「模式=」不再属于条件文本 → 报错', parsePolicy('等级≥40 模式=全部').ok === false)
  ok('无条件的配置渲染为空串', renderPolicy(policyFromConfig(Config({})), 'zh') === '')
  ok('单个标识的条件文本', renderPolicy(policyFromConfig(Config({ join: { requiredHonors: ['dragon'] } })), 'zh') === '标识=龙王')
  // 标识判定 / 龙王口径 只在控制台配置：即使有 per-roll 行也必须跟控制台走
  const merged = mergePolicy(cfg, { minGroupLevel: 5, minActiveDays: 0, minContinuousDays: 0, requiredHonors: ['dragon'] })
  ok('per-roll 覆盖等级', merged.minGroupLevel === 5, merged.minGroupLevel)
  ok('per-roll 覆盖标识', JSON.stringify(merged.requiredHonors) === '["dragon"]', merged.requiredHonors)
  ok('per-roll 不会覆盖 honorMode（跟控制台）', merged.honorMode === 'all', merged.honorMode)
  ok('per-roll 不会覆盖 dragonScope（跟控制台）', merged.dragonScope === 'current', merged.dragonScope)
}

console.log('=== 13. per-roll 参与条件在加入时生效 ===')
{
  const { checkJoinPolicy, clearJoinPolicyCache, Config } = require(path.join(__dirname, '.perm.cjs'))
  const cfg = Config({})   // 全局不限制
  const session = {
    onebot: { getGroupMemberInfo: async () => ({ level: '12', last_sent_time: Math.floor(Date.now() / 1000) }) },
    guildId: '123456', userId: '10001', text: (k) => k,
  }
  app.database.policyRows = []
  clearJoinPolicyCache()
  ok('没有 per-roll 行 → 用全局（放行）', (await checkJoinPolicy(app, session, cfg, 1)).ok === true)

  app.database.policyRows = [{ roll_id: 1, minGroupLevel: 40, minActiveDays: 0, minContinuousDays: 0, requiredHonors: '' }]
  clearJoinPolicyCache()
  const r = await checkJoinPolicy(app, session, cfg, 1)
  ok('per-roll 覆盖生效（12 级 < 40 → 拒绝）', r.ok === false && r.reason.key === 'level', r.reason)
  ok('只影响该抽奖（roll 2 无行 → 仍放行）', (await checkJoinPolicy(app, session, cfg, 2)).ok === true)

  app.database.policyRows = [{ roll_id: 1, minGroupLevel: 0, minActiveDays: 0, minContinuousDays: 0, requiredHonors: '' }]
  clearJoinPolicyCache()
  ok('per-roll 行写成"不限制" → 放行', (await checkJoinPolicy(app, session, cfg, 1)).ok === true)
  app.database.policyRows = []
}

console.log('=== 14. 抽奖详情里显示参与条件 ===')
{
  const yaml = require('js-yaml'), fs = require('fs')
  const perm = require(path.join(__dirname, '.perm.cjs'))
  const dict = yaml.load(fs.readFileSync(`${LOCALES_DIR}/zh-CN.yml`, 'utf8'))
  // 简版 i18n：支持字面点号键（如 roll.detail）与 {name} 占位符
  // 逐段解析：优先匹配最长的「字面点号键」（如 roll.detail）
  const lookup = (path) => {
    let node = dict
    const segs = path.split('.')
    for (let i = 0; i < segs.length; i++) {
      if (node == null || typeof node !== 'object') return undefined
      let matched = false
      for (let j = segs.length; j > i; j--) {
        const key = segs.slice(i, j).join('.')
        if (key in node) { node = node[key]; i = j - 1; matched = true; break }
      }
      if (!matched) return undefined
    }
    return node
  }
  const text = (key, params) => {
    let value = lookup(key)
    if (value === undefined) return key
    value = String(value)
    if (params && !Array.isArray(params)) {
      for (const [k, v] of Object.entries(params)) value = value.split('{' + k + '}').join(String(v))
    } else if (Array.isArray(params)) {
      params.forEach((v, i) => { value = value.split('{' + i + '}').join(String(v)) })
    }
    return value
  }
  const roll = { id: 1, roll_code: '5645', title: '显卡大放送', description: '规则', isEnd: false, isAutoEnd: false, endTime: new Date() }
  const session = { app, text, locales: ['zh-CN'], channel: { id: 'g1', locales: [] } }

  const cfg = perm.Config({ join: { minGroupLevel: 40 } })
  app.database.policyRows = []
  const byGlobal = await perm.rollDetailMsgFromRoll(session, roll, '+8', 'zh-CN', cfg)
  ok('无 per-roll 行 → 详情显示全局条件', byGlobal.includes('参与条件：等级≥40'), byGlobal.split('\n').slice(0, 5))

  app.database.policyRows = [{ roll_id: 1, minGroupLevel: 60, minActiveDays: 0, minContinuousDays: 0, requiredHonors: 'dragon' }]
  const byRoll = await perm.rollDetailMsgFromRoll(session, roll, '+8', 'zh-CN', cfg)
  ok('有 per-roll 行 → 详情显示该抽奖自己的条件', byRoll.includes('参与条件：等级≥60 标识=龙王'), byRoll.split('\n').slice(0, 5))

  app.database.policyRows = [{ roll_id: 1, minGroupLevel: 0, minActiveDays: 0, minContinuousDays: 0, requiredHonors: '' }]
  const noLimit = await perm.rollDetailMsgFromRoll(session, roll, '+8', 'zh-CN', cfg)
  ok('显式不限制 → 详情显示「不限」', noLimit.includes('参与条件：不限'), noLimit.split('\n').slice(0, 5))

  app.database.policyRows = []
  const cfgEmpty = perm.Config({})
  const none = await perm.rollDetailMsgFromRoll(session, roll, '+8', 'zh-CN', cfgEmpty)
  ok('全局也没条件 → 同样显示「不限」', none.includes('参与条件：不限'))
  app.database.policyRows = []
}

console.log('=== 15. 控制台配置自检：空标识项会告警并说明实际生效值 ===')
{
  const warns = []
  const originalWarn = mod.logger.warn
  mod.logger.warn = (...args) => { warns.push(args.map(String).join(' ')) }
  const app2 = new Context({ prefix: ['.', ''] })
  app2.plugin(DbStub); app2.plugin(AssetsStub)
  app2.plugin(mod.default || mod, { join: { minGroupLevel: 40, requiredHonors: ['fire30', 'dragon', null] } })
  await app2.start()
  mod.logger.warn = originalWarn
  ok('配置里有空标识项 → 启动时告警', warns.length === 1 && warns[0].includes('互动标识'), warns)
  ok('告警里说明实际生效的标识', warns.length === 1 && warns[0].includes('群聊炽焰、龙王'), warns[0])
  ok('告警提示去控制台删空项', warns.length === 1 && warns[0].includes('控制台'), warns[0])
  await app2.stop()

  const cleanWarns = []
  mod.logger.warn = (...args) => { cleanWarns.push(args.map(String).join(' ')) }
  const app3 = new Context({ prefix: ['.', ''] })
  app3.plugin(DbStub); app3.plugin(AssetsStub)
  app3.plugin(mod.default || mod, { join: { minGroupLevel: 40, requiredHonors: ['fire30', 'dragon'] } })
  await app3.start()
  mod.logger.warn = originalWarn
  ok('配置干净 → 不告警', cleanWarns.length === 0, cleanWarns)
  await app3.stop()
}

console.log('=== 16. 开奖消息里 @ 中奖者 ===')
{
  const { h } = require('koishi')
  const cases = [['zh-CN', '获得了'], ['en-US', 'won'], ['de-DE', 'gewinnt']]
  for (const [loc, word] of cases) {
    const el = app.i18n.render([loc], ['messageBuilder.roll.end.body.winner'], { userName: '张三', userId: '12345' })[0]
    const json = JSON.stringify(el)
    ok(`${loc}：开奖行带 at 元素（id = 中奖者 QQ）`, json.includes('"type":"at"') && json.includes('"id":"12345"'), json)
    ok(`${loc}：开奖行文案已完整本地化`, json.includes(word), json)
    // 复刻真实发送路径：多段元素拼成字符串 → h.unescape → bot.sendMessage 里 h.normalize(字符串) = h.parse
    const roundTrip = JSON.stringify(h.parse(h.unescape('' + el)))
    ok(`${loc}：拼接 → unescape → parse 后 at 仍成立`, roundTrip.includes('"type":"at"') && roundTrip.includes('"id":"12345"'), roundTrip)
  }
  // 退群/取不到昵称时不能因为 user 为 null 而崩掉（userName 已不再参与渲染）
  const noName = app.i18n.render(['zh-CN'], ['messageBuilder.roll.end.body.winner'], { userName: '', userId: '12345' })[0]
  ok('取不到昵称时仍能渲染出 @ 中奖者', JSON.stringify(noName).includes('"id":"12345"'), JSON.stringify(noName))
}

console.log('=== 17. 三语语言包一致性（key / 占位符 / 元素标签） ===')
{
  const yaml = require('js-yaml'), fs = require('fs')
  const DIR = LOCALES_DIR
  const flat = (node, prefix) => {
    const out = {}
    if (Array.isArray(node)) node.forEach((v, i) => Object.assign(out, flat(v, `${prefix}[${i}]`)))
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) Object.assign(out, flat(v, prefix ? `${prefix}.${k}` : k))
    else out[prefix] = node
    return out
  }
  const locales = {}
  for (const loc of ['zh-CN', 'en-US', 'de-DE']) locales[loc] = flat(yaml.load(fs.readFileSync(`${DIR}/${loc}.yml`, 'utf8')), '')
  const keys = Object.keys(locales['zh-CN']).sort()
  const ph = (s) => (String(s).match(/\{[\w.]+\}/g) || []).sort().join(',')
  const tg = (s) => (String(s).match(/<\/?([a-zA-Z]+)/g) || []).map((t) => t.replace(/[<>/]/g, '')).sort().join(',')
  const mismatch = (fn) => Object.keys(locales['zh-CN']).filter((k) => {
    const a = locales['zh-CN'][k]
    return typeof a === 'string' && ['en-US', 'de-DE'].some((loc) => typeof locales[loc][k] === 'string' && fn(a) !== fn(locales[loc][k]))
  })
  ok('三语 key 完全一致（en/de 不缺条目）', ['en-US', 'de-DE'].every((loc) => JSON.stringify(Object.keys(locales[loc]).sort()) === JSON.stringify(keys)),
    ['en-US', 'de-DE'].map((loc) => Object.keys(locales[loc]).length))
  ok('三语占位符一致（{...} 不漏不增）', mismatch(ph).length === 0, mismatch(ph).slice(0, 5))
  ok('三语元素标签一致（<p>/<quote>/<at> 不破）', mismatch(tg).length === 0, mismatch(tg).slice(0, 5))
  const hasCJK = (s) => /[\u4e00-\u9fff]/.test(s)
  const leftovers = (loc) => Object.entries(locales[loc]).filter(([, v]) => typeof v === 'string' && hasCJK(v)).map(([k]) => k)
  ok('en-US 无中文残留（翻译已补齐）', leftovers('en-US').length === 0, leftovers('en-US').slice(0, 5))
  ok('de-DE 无中文残留（翻译已补齐）', leftovers('de-DE').length === 0, leftovers('de-DE').slice(0, 5))
  // 每个消息类 key 在三语里都要能渲染出非空内容（防止某语把字符串写成了嵌套对象 / 空值）
  const msgKeys = keys.filter((k) => /^(commands|events|messageBuilder)\./.test(k) && typeof locales['zh-CN'][k] === 'string')
  const empty = []
  for (const loc of ['zh-CN', 'en-US', 'de-DE']) {
    for (const k of msgKeys) {
      let out = ''
      try { out = app.i18n.render([loc], [k], {}).join('') } catch (e) { out = '' }
      if (!out || out === k) empty.push(`${loc}:${k}`)
    }
  }
  ok(`三语全部 ${msgKeys.length} 个消息 key 都能渲染出内容`, empty.length === 0, empty.slice(0, 5))
}

console.log('=== 18. 「抽奖」输出中文指令表（不再落到框架英文帮助） ===')
{
  // 用真实 i18n 的 session 驱动根指令 action（help 插件在指令无 action 时才接管，见 plugin-help 的 before('command/execute')）
  const mk = (authority, loc = 'zh-CN') => {
    const s = {
      app, locales: [loc], user: { id: 0, authority }, channel: { id: 'g1', locales: [] },
      isDirect: false, event: { platform: 'onebot', member: { roles: [] } },
      resolve: (v) => (typeof v === 'function' ? v(s) : v),
      text: (key, params) => {
        const paths = Array.isArray(key) ? key : [key]
        for (const p of paths) {
          const out = app.i18n.render([loc], [p], params || {}).join('')
          if (out) return out
        }
        return ''
      },
    }
    return s
  }
  const root = app.$commander.resolve('抽奖')
  ok('根指令已带 action（框架 help 快捷调用不再接管「抽奖」）', (root._actions || []).length === 1, (root._actions || []).length)
  const zh = String(await root._actions[0]({ session: mk(1), options: {} }))
  const names = ['抽奖列表', '抽奖详情', '加入抽奖', '退出抽奖', '抽奖成员', '创建抽奖', '开奖', '删除抽奖', '抽奖帮助', '时区', '语言', '频道id']
  ok('中文表里 12 条普通指令都是中文名', names.every((k) => zh.includes(k)), names.filter((k) => !zh.includes(k)))
  ok('指令表里不再出现提醒器相关指令',
    ['创建提醒器', '提醒器列表', '启用提醒器', '禁用提醒器', '删除提醒器', '抽奖提醒'].every((k) => !zh.includes(k)))
  ok('中文表里没有 giveaway xxx 形式的英文名', !/giveaway\s+\w/.test(zh), zh.match(/giveaway\s+\w+/g))
  ok('普通用户看不到管理员分组', !zh.includes('管理员') && !zh.includes('抽奖接口诊断'))
  const lines = (t) => t.split('\n').filter((l) => l.startsWith('    '))
  ok('普通视图列出 12 条（= 可执行指令数 - 2 条管理员）', lines(zh).length === 12, lines(zh).length)
  const admin = String(await root._actions[0]({ session: mk(5), options: {} }))
  ok('管理员能看到管理员分组（含新增的中文别名）',
    admin.includes('管理员') && admin.includes('抽奖接口诊断') && admin.includes('抽奖成员诊断'))
  const registered = app.$commander._commandList.filter((c) => c.name.startsWith('giveaway.') && (c._actions || []).length)
  const labelOf = (c) => Object.keys(c._aliases || {}).find((a) => /[\u4e00-\u9fff]/.test(a)) ?? c.name.replace(/\./g, ' ')
  const missing = registered.map(labelOf).filter((l) => !admin.includes(l))
  ok('指令表覆盖全部可执行指令（新增指令记得补 GROUPS）',
    lines(admin).length === registered.length && missing.length === 0,
    { listed: lines(admin).length, registered: registered.length, missing })
  const en = String(await root._actions[0]({ session: mk(1, 'en-US'), options: {} }))
  ok('英文环境用注册名（giveaway list）而不是中文别名', /giveaway list/.test(en) && !en.includes('抽奖列表'), en.split('\n').slice(1, 3))
}

console.log('=== 19. 图片渲染（可选依赖 puppeteer） ===')
{
  const { Context, Service } = require('koishi')
  const perm = require(path.join(__dirname, '.perm.cjs'))
  const PLUGIN2 = PLUGIN

  // 更完整的 database 桩：抽奖列表 + 中奖名单两条链路都要用到
  class RenderDbStub extends Service {
    constructor(ctx) {
      super(ctx, 'database', true)
      Object.assign(this, {
        get: async (table, query) => {
          if (table === 'roll_channel') return [{ roll_id: 1 }, { roll_id: 2 }]
          if (table === 'roll') return [
            { id: 1, roll_code: '5645', title: '显卡大放送', isEnd: 0, isAutoEnd: 1, endTime: new Date('2026-09-15T12:00:00Z') },
            { id: 2, roll_code: '5646', title: '<b>已结束</b>的抽奖', isEnd: 1, isAutoEnd: 0 },
          ].filter((r) => !query?.id || r.id === query.id)
          if (table === 'user' || table === 'channel') return [{ id: 0, offset: '', locales: [] }]
          if (table === 'roll_member') return [{ user_id: 0 }]
          if (table === 'binding') return [{ aid: 0, platform: 'onebot', pid: '12345' }]
          if (table === 'prize') return [{ id: 9, name: '显卡' }]
          return []
        },
        join: (tables) => ({
          execute: async () => Array.isArray(tables) && tables.includes('roll_prize')
            ? [{ roll_prize: { roll_id: 1, prize_id: 9 }, user_prize: { user_id: 0, prize_id: 9, amount: 2 } }]
            : [],
        }),
        create: async () => ({ id: 1 }), upsert: async () => [], remove: async () => [],
        set: async () => [], eval: async () => [],
      })
    }
  }
  class PuppeteerStub extends Service {
    constructor(ctx) {
      super(ctx, 'puppeteer', true)
      this.calls = []
      this.fail = false
      this.render = async (html) => {
        if (this.fail) throw new Error('boom')
        this.calls.push(html)
        return '<img src="data:image/png;base64,QUJD"/>'
      }
    }
  }
  const mkApp = async (render = {}) => {
    const a = new Context({ prefix: ['.', ''] })
    a.plugin(RenderDbStub); a.plugin(AssetsStub); a.plugin(PuppeteerStub)
    const m = require(PLUGIN2)
    a.plugin(m.default || m, { render })
    await a.start()
    await new Promise((r) => setTimeout(r, 200))
    return a
  }
  const mkSession = (a, answers = []) => {
    const sent = []
    const s = {
      app: a, user: { id: 0, authority: 5, offset: '' }, channel: { id: 'g1', offset: '', locales: [] },
      channelId: 'g1', guildId: 'g1', platform: 'test', userId: '10001', locales: ['zh-CN'],
      author: { name: '测试者' }, event: { platform: 'test', member: { roles: [] } },
      async send(m) { sent.push(String(m)); return [] },
      async prompt() { return answers.length ? answers.shift() : undefined },
      resolve: (v) => (typeof v === 'function' ? v(s) : v),
      text: (key, params) => {
        const paths = Array.isArray(key) ? key : [key]
        for (const p of paths) {
          const out = a.i18n.render(['zh-CN'], [p], params || {}).join('')
          if (out) return out
        }
        return ''
      },
    }
    return { session: s, sent }
  }

  // ① 抽奖列表：装了 puppeteer + 开关打开 → 出图，HTML 里带编号/标题/状态
  {
    const a = await mkApp({ list: true, result: true })
    const { session } = mkSession(a)
    const out = String(await a.$commander.resolve('抽奖列表')._actions[0]({ session, options: {} }))
    const html = a.puppeteer.calls[0] || ''
    ok('抽奖列表走图片渲染', out.includes('data:image/png'), out.slice(0, 80))
    ok('HTML 含抽奖编号与标题', html.includes('5645') && html.includes('显卡大放送'), html.length)
    ok('HTML 含进行中 / 已结束标记', html.includes('进行中') && html.includes('已结束'))
    ok('HTML 转义了标题里的标签（防注入/破版）', html.includes('&lt;b&gt;已结束&lt;/b&gt;的抽奖'), html.match(/&lt;b&gt;[^<]*/))
    ok('HTML 含截止时间与页脚', /截止 \d\d-\d\d \d\d:\d\d/.test(html) && html.includes('koishi-plugin-giveaway'))
    await a.stop()
  }
  // ② 开关关闭 → 回退文字，且不调用 render
  {
    const a = await mkApp({ list: false, result: false })
    const { session } = mkSession(a)
    const out = String(await a.$commander.resolve('抽奖列表')._actions[0]({ session, options: {} }))
    ok('关闭开关后回退文字列表', !out.includes('data:image/png') && out.includes('抽奖列表'), out.slice(0, 60))
    ok('关闭开关后不调用 puppeteer', a.puppeteer.calls.length === 0)
    await a.stop()
  }
  // ③ 渲染抛错 → 回退文字 + 打 warn，不冒泡异常
  {
    const a = await mkApp({ list: true, result: true })
    a.puppeteer.fail = true
    const warns = []
    const origWarn = require(PLUGIN2).logger.warn
    require(PLUGIN2).logger.warn = (...args) => { warns.push(args.map(String).join(' ')) }
    const { session } = mkSession(a)
    const out = String(await a.$commander.resolve('抽奖列表')._actions[0]({ session, options: {} }))
    require(PLUGIN2).logger.warn = origWarn
    ok('渲染失败回退文字且不抛异常', !out.includes('data:image/png') && out.includes('抽奖列表'), out.slice(0, 60))
    ok('渲染失败打了 warn（含原因）', warns.some((w) => w.includes('图片渲染失败') && w.includes('boom')), warns)
    await a.stop()
  }
  // ④ 开奖结果：文字（含真实 @）+ 图片（昵称来自 bot，头像走 qlogo 兜底）
  {
    const a = await mkApp({ list: true, result: true })
    const bot = { platform: 'onebot', getUser: async () => ({ name: '张三' }) }
    const elements = await perm.rollEndImage(a, { id: 1, roll_code: '5645', title: '显卡大放送' }, ['zh-CN'], bot, true, {})
    const json = JSON.stringify(elements)
    ok('开奖结果返回元素数组', Array.isArray(elements) && elements.length >= 3, elements && elements.length)
    ok('结果消息里保留真实 @ 中奖者', json.includes('"type":"at"') && json.includes('12345'), json.slice(0, 160))
    ok('结果消息里带图片元素', json.includes('"type":"img"') && json.includes('data:image/png'))
    const html = a.puppeteer.calls[0] || ''
    ok('结果 HTML 含开奖编号 / 奖品', html.includes('5645') && html.includes('显卡 × 2'), html.length)
    ok('结果 HTML 显示昵称（来自 bot.getUser）', html.includes('张三'), html.slice(html.indexOf('winner'), html.indexOf('winner') + 200))
    ok('结果 HTML 带头像（QQ 号拼 qlogo 兜底）',
      html.includes('class="avatar"') && html.includes('q1.qlogo.cn') && html.includes('nk=12345'), true)
    ok('头像加载失败时回落到昵称首字', html.includes('<span>张</span>'))
    await a.stop()
  }
  // ⑤ 没装 puppeteer：图片链路整体关闭，命令仍正常返回文字
  {
    const a = new Context({ prefix: ['.', ''] })
    a.plugin(RenderDbStub); a.plugin(AssetsStub)
    const m = require(PLUGIN2)
    a.plugin(m.default || m, { render: { list: true, result: true } })
    await a.start()
    const { session } = mkSession(a)
    const out = String(await a.$commander.resolve('抽奖列表')._actions[0]({ session, options: {} }))
    ok('未安装 puppeteer 时列表照常返回文字', !out.includes('data:image/png') && out.includes('抽奖列表'), out.slice(0, 60))
    ok('未安装 puppeteer 时插件照常注册指令', !!a.$commander.resolve('giveaway.add'))
    await a.stop()
  }
  // ⑥ 创建成功后输出「抽奖内容」卡片（文字提示 + 图片）
  {
    const a = await mkApp({ create: true, list: true, result: true })
    const form = ['奖品：显卡*1，鼠标*2', '开奖时间：09-30-20-00', '加入口令：参加', '标题：双十一抽奖', '描述：满 40 级可参加', '参与条件：等级≥60'].join('\n')
    const { session } = mkSession(a, [form])
    const out = String(await a.$commander.resolve('创建抽奖')._actions[0]({ session, options: {} }))
    await new Promise((r) => setTimeout(r, 400))
    const html = a.puppeteer.calls[0] || ''
    ok('创建成功后输出图片卡片', out.includes('data:image/png'), out.slice(0, 90))
    ok('出图时不再附带文字成功提示（图片代替文字）', !out.includes('.successWithKey') && !out.includes('创建抽奖成功'), out.slice(0, 90))
    ok('卡片含标题 / 口令 / 奖品 / 参与条件',
      html.includes('双十一抽奖') && html.includes('加入口令') && html.includes('参加')
      && html.includes('显卡 × 1') && html.includes('鼠标 × 2') && html.includes('等级≥60'), html.length)
    ok('卡片含编号与开奖时间（4 段写法解析为当年）', html.includes('编号 ') && html.includes('2026-09-30 20:00'), html.match(/\d{4}-\d\d-\d\d \d\d:\d\d/))
    await a.stop()
  }
  // ⑦ 关掉 render.create → 只发文字
  {
    const a = await mkApp({ create: false, list: true, result: true })
    const form = ['奖品：显卡*1', '开奖时间：n', '加入口令：参加'].join('\n')
    const { session } = mkSession(a, [form])
    const out = String(await a.$commander.resolve('创建抽奖')._actions[0]({ session, options: {} }))
    await new Promise((r) => setTimeout(r, 400))
    ok('关掉 render.create 后回退为文字成功提示', !out.includes('data:image/png') && out.includes('.successWithKey'), out.slice(0, 80))
    ok('关掉 render.create 后不调用 puppeteer', a.puppeteer.calls.length === 0)
    await a.stop()
  }
  // ⑧ 开奖时间解析：4 段（月-日-时-分）与 5 段（年-月-日-时-分）都要有效
  {
    const { dateInputToDateTime } = perm
    // 插件把配置里的 +8 规范化成 UTC+8（FixedOffsetZone 能直接解析，不依赖 ICU 的 offset-zone 支持）
    const { offsetToUTCOffset } = perm
    const tz = offsetToUTCOffset('+8')
    ok('时区规范化：+8 → UTC+8（luxon 固定偏移写法）', tz === 'UTC+8', tz)
    const four = dateInputToDateTime('09-30-20-00', tz)
    const five = dateInputToDateTime('2026-09-30-20-00', tz)
    ok('4 段写成月-日-时-分（当年），解析有效', four.isValid && four.year === 2026 && four.month === 9 && four.day === 30 && four.hour === 20, four.invalidReason || four.toISO())
    ok('5 段写成 年-月-日-时-分，解析有效', five.isValid && five.year === 2026 && five.month === 9 && five.day === 30 && five.hour === 20, five.invalidReason || five.toISO())
    ok('非法日期不再被静默接受', !dateInputToDateTime('2026-30-30-20-00', tz).isValid)
  }
  // ⑨ 头像地址生成与开关
  {
    const { defaultAvatarUrl, collectWinners } = perm
    ok('onebot 数字 id → qlogo 头像地址', /q1\.qlogo\.cn/.test(defaultAvatarUrl('onebot', '924740926') || '') && (defaultAvatarUrl('onebot', '924740926') || '').includes('nk=924740926'))
    ok('其他平台（无法拼地址）→ 不显示头像', defaultAvatarUrl('discord', '12345') === undefined)
    ok('非数字 id → 不显示头像', defaultAvatarUrl('onebot', 'abc123') === undefined)

    const a = await mkApp({ list: true, result: true, avatar: false })
    const bot = { platform: 'onebot', getUser: async () => ({ name: '李四', avatar: 'https://example.com/a.png' }) }
    const els = await perm.rollEndImage(a, { id: 1, roll_code: '5645', title: '显卡大放送' }, ['zh-CN'], bot, false, {})
    const html = a.puppeteer.calls[0] || ''
    ok('关掉头像开关后不渲染头像', !html.includes('class="avatar"') && html.includes('李四'), html.length)
    ok('头像开关不影响 @ 与图片', JSON.stringify(els).includes('"type":"at"') && JSON.stringify(els).includes('"type":"img"'))
    await a.stop()

    // bot 取资料失败：不抛异常、退化为 QQ 号
    const b = await mkApp({ list: true, result: true })
    const badBot = { platform: 'onebot', getUser: async () => { throw new Error('api down') } }
    const warns = []
    const origWarn = perm.logger.warn
    perm.logger.warn = (...args) => { warns.push(args.map(String).join(' ')) }
    const els2 = await perm.rollEndImage(b, { id: 1, roll_code: '5645', title: '显卡大放送' }, ['zh-CN'], badBot, true, {})
    perm.logger.warn = origWarn
    ok('取昵称失败时不影响出图（退化为 QQ 号）', JSON.stringify(els2).includes('"type":"img"') && (b.puppeteer.calls[0] || '').includes('12345'), true)
    ok('取昵称失败打了 warn', warns.some((w) => w.includes('取中奖者资料失败')), warns)
    await b.stop()
  }
  // ⑩ UI 风格可选：默认 / 二次元（同一套 DOM，只换主题 CSS）
  {
    const anime = await mkApp({ style: 'anime', list: true, result: true, create: true })
    const { session } = mkSession(anime)
    await anime.$commander.resolve('抽奖列表')._actions[0]({ session, options: {} })
    const animeHtml = anime.puppeteer.calls[0] || ''
    ok('style=anime → 输出二次元主题',
      animeHtml.includes('data-theme="anime"') && animeHtml.includes('--brand: #ff8fb8'), animeHtml.slice(0, 60))
    ok('二次元主题内容结构与默认一致（状态/编号/标题仍在）',
      animeHtml.includes('class="row"') && animeHtml.includes('进行中') && animeHtml.includes('#5645') && animeHtml.includes('显卡大放送'))
    await anime.stop()

    // 哥特已彻底删除：schema 会直接拒绝（详见 schema-test 的 gothic 用例），这里只验证归一化兜底
    const { normalizeStyle } = perm
    ok('normalizeStyle：三项原样返回，未知值回落 default',
      normalizeStyle('default') === 'default' && normalizeStyle('anime') === 'anime'
      && normalizeStyle('avemujica') === 'avemujica' && normalizeStyle('随便写的') === 'default'
      && normalizeStyle(undefined) === 'default')

    const plain = await mkApp({ style: 'default', list: true })
    const { session: s2 } = mkSession(plain)
    await plain.$commander.resolve('抽奖列表')._actions[0]({ session: s2, options: {} })
    const plainHtml = plain.puppeteer.calls[0] || ''
    ok('style=default（默认）→ 输出默认主题',
      plainHtml.includes('data-theme="default"') && plainHtml.includes('--brand: #4c7df0') && !plainHtml.includes('--brand: #ff8fb8'))
    await plain.stop()

    const mujica = await mkApp({ style: 'avemujica', list: true })
    const { session: sm } = mkSession(mujica)
    await mujica.$commander.resolve('抽奖列表')._actions[0]({ session: sm, options: {} })
    const mujicaHtml = mujica.puppeteer.calls[0] || ''
    ok('style=avemujica → 输出 Ave Mujica 主题',
      mujicaHtml.includes('data-theme="avemujica"') && mujicaHtml.includes('--card: #15121C')
      && mujicaHtml.includes('AVE MUJICA') && mujicaHtml.includes('#C84B7E'), mujicaHtml.slice(0, 80))
    ok('Ave Mujica 主题内容结构一致',
      mujicaHtml.includes('class="row"') && mujicaHtml.includes('进行中') && mujicaHtml.includes('#5645'))
    await mujica.stop()
  }
  // ⑪ 头图（render.banner）：支持 URL / 本机绝对路径，未配置则不渲染
  {
    const { bannerUrl } = perm
    ok('bannerUrl 保留 http(s) 地址', bannerUrl('https://example.com/a.png') === 'https://example.com/a.png')
    ok('bannerUrl 保留 data: 内联图', (bannerUrl('data:image/png;base64,AAA') || '').startsWith('data:image/png'))
    ok('bannerUrl 把本机绝对路径转成 file://', (bannerUrl('/tmp/head.png') || '').startsWith('file:///tmp/head.png'))
    ok('bannerUrl 空值 → undefined', bannerUrl('') === undefined && bannerUrl('   ') === undefined)

    const a = await mkApp({ style: 'avemujica', list: true, banner: 'https://example.com/head.png' })
    const { session } = mkSession(a)
    await a.$commander.resolve('抽奖列表')._actions[0]({ session, options: {} })
    const html = a.puppeteer.calls[0] || ''
    ok('配置了 banner → 卡片顶部渲染头图',
      html.includes('<div class="banner">') && html.includes('https://example.com/head.png'), html.slice(html.indexOf('banner'), html.indexOf('banner') + 120))
    await a.stop()

    const b = await mkApp({ style: 'avemujica', list: true })
    const { session: s2 } = mkSession(b)
    await b.$commander.resolve('抽奖列表')._actions[0]({ session: s2, options: {} })
    ok('未配置 banner → 不渲染头图', !(b.puppeteer.calls[0] || '').includes('class="banner"'))
    await b.stop()
  }
  // ⑫ 图片宽度：puppeteer 截的是 body 包围盒，body 必须收缩到卡片大小，
  //    否则截图会带上「视口宽度实测 1280px」的背景，群里表现为两侧大片黑边 + 字体很小
  {
    const a = await mkApp({ style: 'avemujica', list: true })
    const { session } = mkSession(a)
    await a.$commander.resolve('抽奖列表')._actions[0]({ session, options: {} })
    const html = a.puppeteer.calls[0] || ''
    ok('body 收缩到卡片大小（display: inline-block，不再铺满视口）',
      /body \{[^}]*display: inline-block/.test(html) && !/body \{[^}]*display: flex/.test(html))
    ok('卡片宽度由 --card-w 控制，默认 420px',
      html.includes('--card-w: 420px') && /\.card \{[^}]*width: var\(--card-w/.test(html))
    await a.stop()

    const b = await mkApp({ style: 'default', list: true, width: 520 })
    const { session: sb } = mkSession(b)
    await b.$commander.resolve('抽奖列表')._actions[0]({ session: sb, options: {} })
    ok('render.width 生效（520 → --card-w: 520px）', (b.puppeteer.calls[0] || '').includes('--card-w: 520px'))
    await b.stop()

    const { shellHtml } = perm
    const w = (n) => {
      const out = shellHtml({ eyebrow: 'e', title: 't', body: '', brand: 'b', cardWidth: n }, 'default')
      return Number((out.match(/--card-w: (\d+)px/) || [])[1])
    }
    ok('宽度越界自动夹到 320~900', w(10) === 320 && w(5000) === 900 && w(undefined) === 420, [w(10), w(5000), w(undefined)])
  }
  // ⑫.5 多语言化收尾：诊断指令的三语输出 + 取消词的中/英/德支持
  {
    const mkSession = (a, loc) => ({
      app: a, user: { id: 0, authority: 5, offset: '', locales: [loc] }, channel: { id: 'g1', offset: '', locales: [loc] },
      channelId: 'g1', guildId: 'g1', platform: 'test', userId: '10001', locales: [loc],
      author: { name: '测试者' }, event: { platform: 'test', member: { roles: [] } },
      async send() { return [] }, async prompt() { return undefined },
      text: (key, params) => String(a.i18n.render([loc], [`commands.giveaway.debug.honor.messages.${String(key).replace(/^\./, '')}`], params || []).join('')) || key,
    })
    for (const [loc, expect] of [['zh-CN', 'OneBot'], ['en-US', 'OneBot'], ['de-DE', 'OneBot']]) {
      const a = await mkApp({ list: false })
      const { session } = { session: mkSession(a, loc) }
      const out = String(await a.$commander.resolve('抽奖接口诊断')._actions[0]({ session, options: {} }))
      ok(`${loc}：诊断指令输出本地化文案（不是 key 路径）`, out.includes(expect) && !out.includes('commands.giveaway'), out.slice(0, 60))
      await a.stop()
    }
  }
  // ⑬ 抽奖详情出图：`抽奖详情 <编号>` 用同一张卡片重新调出创建内容（+ 状态 / 参与人数 / 中奖名单）
  {
    const a = await mkApp({ style: 'avemujica', detail: true, list: false })
    const { session } = mkSession(a)   // 桩里抽奖编号 5645（进行中）
    const out = String(await a.$commander.resolve('抽奖详情')._actions[0]({ session, options: {} }, '5645'))
    ok('开启 render.detail → 详情返回图片元素', out.includes('data:image/png'), out.slice(0, 80))
    const html = a.puppeteer.calls[0] || ''
    ok('详情卡片含状态 / 编号 / 参与人数', html.includes('进行中') && html.includes('5645') && /参与人数|members|Teilnehmer/.test(html), html.slice(0, 160))
    ok('详情卡片复用创建卡片的信息行（开奖时间 / 描述 / 参与条件）',
      html.includes('双十一显卡大放送') && html.includes('截止') === false || html.includes('class="kv"'), true)
    ok('未开奖的详情不显示中奖名单', !html.includes('中奖名单'))
    await a.stop()

    const b = await mkApp({ detail: false })
    const { session: sb } = mkSession(b)
    const text = String(await b.$commander.resolve('抽奖详情')._actions[0]({ session: sb, options: {} }, '5645'))
    ok('关闭 render.detail → 回退为文字详情（不调用 puppeteer）',
      !text.includes('data:image/png') && text.includes('5645') && b.puppeteer.calls.length === 0, text.slice(0, 60))
    await b.stop()

    // 已开奖的抽奖：详情卡片追加中奖名单（直接驱动 builder，桩里 id=1 的抽奖已设中奖数据）
    const c = await mkApp({ style: 'default', detail: true, avatar: true })
    const bot = { platform: 'onebot', getUser: async () => ({ name: '李四' }) }
    const img = await perm.rollDetailImage(c, { ...mkSession(c).session, bot }, { id: 1, roll_code: '5645', title: '显卡大放送', isEnd: 1, endTime: new Date() }, [{ name: '显卡', amount: 2 }], '+08:00', '不限', { style: 'default' })
    const html2 = c.puppeteer.calls[0] || ''
    ok('已开奖的详情卡片带中奖名单区块', !!img && html2.includes('中奖名单') && html2.includes('李四'), html2.length)
    ok('详情卡片里也显示参与人数与状态', /参与人数/.test(html2) && html2.includes('已结束'))
    await c.stop()
  }
  // ⑭ 参与名单：详情 / 抽奖成员出图，头像 + 昵称 + QQ 号，最大显示人数可配
  {
    const a = await mkApp({ style: 'avemujica', detail: true, member: true, avatar: true })
    const { session } = mkSession(a)
    const out = String(await a.$commander.resolve('抽奖详情')._actions[0]({ session, options: {} }, '5645'))
    const html = a.puppeteer.calls[0] || ''
    ok('进行中的详情卡片带参与名单区块', out.includes('data:image/png') && html.includes('参与名单'), html.length)
    ok('参与名单每行有头像 + 昵称/QQ 号',
      html.includes('class="winner"') && html.includes('class="avatar"') && html.includes('12345'), html.slice(0, 120))
    ok('详情卡片的参与名单不带奖品列（奖品只属于中奖名单）', !/class="prizes"/.test(html))
    await a.stop()

    const b = await mkApp({ style: 'default', member: true, detail: true })
    const { session: sb } = mkSession(b)
    const out2 = String(await b.$commander.resolve('抽奖成员')._actions[0]({ session: sb, options: {} }, '5645'))
    ok('抽奖成员出图（图片元素 + 参与名单标题）',
      out2.includes('data:image/png') && (b.puppeteer.calls[0] || '').includes('参与名单'), out2.slice(0, 60))
    await b.stop()

    const c = await mkApp({ member: false })
    const { session: sc } = mkSession(c)
    const text = String(await c.$commander.resolve('抽奖成员')._actions[0]({ session: sc, options: {} }, '5645'))
    ok('关闭 render.member → 回退为文字名单（不调用 puppeteer）',
      !text.includes('data:image/png') && c.puppeteer.calls.length === 0, text.slice(0, 60))
    await c.stop()

    // 上限：takeWithRemainder 纯函数 + 卡片里的「…… 等共 N 人」
    const { takeWithRemainder, memberLimitOf, DEFAULT_MEMBER_LIMIT } = perm
    ok('名单上限：不足上限时全部显示、无剩余', JSON.stringify(takeWithRemainder([1, 2, 3], 5)) === '{"items":[1,2,3],"rest":0}')
    ok('名单上限：超出时截断并给出剩余人数', JSON.stringify(takeWithRemainder([1, 2, 3, 4, 5], 2)) === '{"items":[1,2],"rest":3}')
    ok('名单上限归一化：非法 / 越界值兜底（默认 12，最大 100）',
      memberLimitOf(undefined) === DEFAULT_MEMBER_LIMIT && memberLimitOf(0) === 12 && memberLimitOf(999) === 100 && memberLimitOf(30) === 30,
      [memberLimitOf(undefined), memberLimitOf(0), memberLimitOf(999), memberLimitOf(30)])

    // 参与人数超过上限 → 只显示前 N 行 + 「…… 等共 X 人」（专用桩：5 个参与者）
    class ManyMemberStub extends Service {
      constructor(ctx) {
        super(ctx, 'database', true)
        Object.assign(this, {
          get: async (table) => table === 'roll_member'
            ? [1, 2, 3, 4, 5].map((i) => ({ user_id: i }))
            : table === 'binding' ? [{ aid: 0, platform: 'onebot', pid: '10001' }] : [],
        })
      }
    }
    const e = new Context({ prefix: ['.', ''] })
    e.plugin(ManyMemberStub); e.plugin(AssetsStub); e.plugin(PuppeteerStub)
    const m = require(PLUGIN2)
    e.plugin(m.default || m, { render: { member: true, memberLimit: 3 } })
    await e.start()
    const img = await perm.rollMemberImage(e, mkSession(e).session, { id: 1, roll_code: '5645', title: '抽奖' }, { style: 'default', memberLimit: 3 })
    const rows = (e.puppeteer.calls[0] || '').match(/class="winner"/g) || []
    ok('超过 render.memberLimit 时只显示前 3 行并提示剩余 2 人',
      !!img && rows.length === 3 && /等共 2 人|and 2 more|und 2 weitere/.test(e.puppeteer.calls[0] || ''), rows.length)
    await e.stop()
  }
}

console.log('=== 20. 提醒：按「剩余时长区间 + 百分比」配置（手动提醒器交互已下线）===')
{
  const { Context, Service } = require('koishi')
  const perm = require(path.join(__dirname, '.perm.cjs'))
  const mod = require(PLUGIN)
  const { getRemindTimeFromPercent } = perm
  const DEFAULT_RULES = [
    { maxDuration: '1h', percent: '20' },
    { maxDuration: '5h', percent: '15' },
    { maxDuration: '1d', percent: '10' },
    { maxDuration: '0', percent: '10' },
  ]

  // ① 手动提醒器相关的 6 条指令全部不再注册
  {
    const all = app.$commander._commandList.map((c) => c.name)
    const remindCmds = all.filter((n) => n === 'giveaway.remind' || n === 'giveaway.reminder' || n.startsWith('giveaway.reminder.'))
    ok('手动提醒器 / 查询提醒指令已全部下线', remindCmds.length === 0, remindCmds)
    // 对应文案也已从三语文件里清掉（由 i18n-test 统一核对，避免留死键）
  }

  // ② 纯函数：时长解析 + 按区间选百分比
  {
    const { parseDurationMinutes, parsePercents, pickRemindPercents } = perm
    ok('时长解析：30m = 30 / 90（纯数字）= 90 分钟', parseDurationMinutes('30m') === 30 && parseDurationMinutes('90') === 90)
    ok('时长解析：1h = 60 / 5h = 300 / 1d = 1440 / 7d = 10080 分钟',
      parseDurationMinutes('1h') === 60 && parseDurationMinutes('5h') === 300
      && parseDurationMinutes('1d') === 1440 && parseDurationMinutes('7d') === 10080)
    ok('时长解析：0 / 空 / 不限 = 不设上限（undefined）',
      parseDurationMinutes('0') === undefined && parseDurationMinutes('') === undefined && parseDurationMinutes('不限') === undefined)
    ok('时长解析：写错的值返回 null（用于启动告警）', parseDurationMinutes('随便') === null)
    ok('百分比解析：支持 20 与 20,10（顿号也可以）',
      JSON.stringify(parsePercents('20')) === '[20]' && JSON.stringify(parsePercents('20,10')) === '[20,10]'
      && JSON.stringify(parsePercents('20、10')) === '[20,10]')
    ok('百分比解析：0 / 100 / 非数字一律丢弃', JSON.stringify(parsePercents('0,100,abc')) === '[]')

    ok('区间匹配：≤1h → 20%', JSON.stringify(pickRemindPercents(30, DEFAULT_RULES)) === '[20]'
      && JSON.stringify(pickRemindPercents(60, DEFAULT_RULES)) === '[20]')
    ok('区间匹配：1~5h → 15%', JSON.stringify(pickRemindPercents(61, DEFAULT_RULES)) === '[15]'
      && JSON.stringify(pickRemindPercents(300, DEFAULT_RULES)) === '[15]')
    ok('区间匹配：5h~1d → 10%', JSON.stringify(pickRemindPercents(301, DEFAULT_RULES)) === '[10]'
      && JSON.stringify(pickRemindPercents(1440, DEFAULT_RULES)) === '[10]')
    ok('区间匹配：超过 1 天 → 落到兜底行（10%）', JSON.stringify(pickRemindPercents(10080, DEFAULT_RULES)) === '[10]'
      && JSON.stringify(pickRemindPercents(100 * 1440, DEFAULT_RULES)) === '[10]')
    ok('区间匹配：一个抽奖只命中一行 → 默认只提醒一次', pickRemindPercents(10080, DEFAULT_RULES).length === 1)
    ok('一行写多个百分比 → 提醒多次', JSON.stringify(pickRemindPercents(120, [{ maxDuration: '1d', percent: '20,5' }])) === '[20,5]')
    ok('规则表为空 → 不提醒', JSON.stringify(pickRemindPercents(120, [])) === '[]')
    ok('兜底行缺失时，超出所有上限的场次不提醒',
      JSON.stringify(pickRemindPercents(10080, [{ maxDuration: '1h', percent: '20' }])) === '[]')
    ok('无法识别的行被丢弃（不影响其他行）',
      JSON.stringify(pickRemindPercents(30, [{ maxDuration: '写错了', percent: '20' }, { maxDuration: '1h', percent: '20' }])) === '[20]')
    const t = new Date('2030-01-01T00:00:00Z')
    ok('提醒时刻 = 开奖时间 − 时长 × 百分比',
      getRemindTimeFromPercent(t, 60, 20).getTime() === t.getTime() - 12 * 60 * 1000)
  }

  let SEED_ROLLS = []
  class RemindDbStub extends Service {
    constructor(ctx) {
      super(ctx, 'database', true)
      this.rolls = SEED_ROLLS.map((r) => ({ ...r }))
      this.tables = { roll: this.rolls.slice() }
      Object.assign(this, {
        get: async (table, query) => {
          if (table === 'roll') {
            return this.rolls.filter((r) => (!query?.id || r.id === query.id)
              && (query?.isEnd === undefined || Number(!!r.isEnd) === Number(query.isEnd)))
          }
          if (table === 'roll_channel') return this.rolls.map((r) => ({ roll_id: r.id, channel_id: 'g1', channel_platform: 'test' }))
          if (table === 'user' || table === 'channel') return [{ id: 0, offset: '', locales: [] }]
          return []
        },
        // create 必须回显写入的数据（含 endTime / isEnd:0），否则监听器拿不到开奖时间
        create: async (table, data) => {
          const rows = (this.tables[table] = this.tables[table] ?? [])
          const row = { isEnd: 0, ...data, id: rows.length + 1 }
          rows.push(row)
          if (table === 'roll') this.rolls.push(row)
          return row
        },
        set: async (table, query, data) => {
          const rows = this.tables[table] ?? []
          const id = query && typeof query === 'object' ? query.id : query
          const row = rows.find((r) => r.id === id)
          if (row) Object.assign(row, typeof data === 'function' ? data(row) : data)
        },
        upsert: async () => [], remove: async () => [],
        eval: async () => [], join: () => ({ execute: async () => [] }),
      })
    }
  }
  const mkApp = async (rules, seedRolls = []) => {
    SEED_ROLLS = seedRolls
    const a = new Context({ prefix: ['.', ''] })
    a.plugin(RemindDbStub); a.plugin(AssetsStub)
    const cfg = { render: { create: false, list: false, result: false } }
    if (rules !== undefined) cfg.remind = { rules }   // 不传 = 用插件默认配置
    a.plugin(mod.default || mod, cfg)
    await a.start()
    await new Promise((r) => setTimeout(r, 100))
    return a
  }
  const mkSession = (a, answers = []) => {
    const s = {
      app: a, user: { id: 0, authority: 5, offset: '' }, channel: { id: 'g1', offset: '', locales: [] },
      channelId: 'g1', guildId: 'g1', platform: 'test', userId: '10001', locales: ['zh-CN'],
      author: { name: '测试者' }, event: { platform: 'test', member: { roles: [] } },
      async send() { return [] }, async prompt() { return answers.length ? answers.shift() : undefined },
      text: (key) => key,
    }
    return { session: s }
  }
  // 用插件解析时使用的时区（配置默认 +8 → UTC+8）格式化，避免用例结果随宿主机时区变化
  const { DateTime } = require('luxon')
  const atText = (ms) => DateTime.fromMillis(ms, { zone: 'UTC+8' }).toFormat('yyyy-MM-dd-HH-mm')
  const create = async (a, endTime) => {
    const form = ['奖品：显卡*1', endTime ? `开奖时间：${endTime}` : '开奖时间：'].join('\n')
    const { session } = mkSession(a, [form])
    await a.$commander.resolve('创建抽奖')._actions[0]({ session, options: {} })
    await new Promise((r) => setTimeout(r, 300))
  }
  const jobsSince = (before) => mod.remindManager.getAllJobs().filter((j) => !before.has(j.id))

  // ③ 排期：无论多长，默认每场只提醒一次，时刻 = 开奖时间 − 命中区间的百分比
  {
    const cases = [
      { name: '1 小时场次（≤1h → 20%）', ms: 3600 * 1000, percent: 20 },
      { name: '5 小时场次（1~5h → 15%）', ms: 5 * 3600 * 1000, percent: 15 },
      { name: '7 天场次（>1d → 兜底 10%）', ms: 7 * 24 * 3600 * 1000, percent: 10 },
    ]
    for (const c of cases) {
      const a = await mkApp()   // 默认配置
      const before = new Set(mod.remindManager.getAllJobs().map((j) => j.id))
      const ref = Date.now()
      await create(a, atText(ref + c.ms))
      const added = jobsSince(before)
      ok(`默认配置 + ${c.name} → 只提醒一次`, added.length === 1, added.length)
      if (added.length === 1) {
        const got = new Date(added[0].job.nextInvocation()).getTime()
        const want = ref + c.ms * (1 - c.percent / 100)
        ok(`提醒时刻 = 开奖时间 − ${c.percent}% 时长`, Math.abs(got - want) <= 61 * 1000,
          { 差秒: Math.round((got - want) / 1000) })
      }
      await a.stop()
    }
  }

  // ④ 配置：一行多百分比 → 多次提醒；空表 / 无开奖时间 / 已过期 → 不排
  {
    const a = await mkApp([{ maxDuration: '1d', percent: '20,5' }])
    const before = new Set(mod.remindManager.getAllJobs().map((j) => j.id))
    const ref = Date.now()
    await create(a, atText(ref + 10 * 3600 * 1000))
    const added = jobsSince(before)
    ok('一行写 20,5 → 排两个提醒任务', added.length === 2, added.length)
    const times = added.map((j) => new Date(j.job.nextInvocation()).getTime()).sort((x, y) => x - y)
    ok('两个提醒分别落在 80% 与 95% 处（越早的百分比越早提醒）',
      Math.abs(times[0] - (ref + 10 * 3600 * 1000 * 0.8)) <= 61 * 1000
      && Math.abs(times[1] - (ref + 10 * 3600 * 1000 * 0.95)) <= 61 * 1000,
      times.map((t) => Math.round((t - ref) / 1000)))
    await a.stop()

    const b = await mkApp([])
    const before2 = new Set(mod.remindManager.getAllJobs().map((j) => j.id))
    await create(b, atText(Date.now() + 3 * 3600 * 1000))
    ok('规则表为空 → 不排提醒任务', jobsSince(before2).length === 0, jobsSince(before2).length)
    await b.stop()

    const c = await mkApp()
    const before3 = new Set(mod.remindManager.getAllJobs().map((j) => j.id))
    await create(c, '')   // 不填开奖时间 → 无自动开奖，也就没有提醒
    ok('没填开奖时间的抽奖不排提醒任务', jobsSince(before3).length === 0, jobsSince(before3).length)
    await c.stop()

    // 重启重建（ready 钩子）：不知道原始创建时刻，就以「现在」为基准算剩余时长
    const maxIdBefore = Math.max(0, ...mod.remindManager.getAllJobs().map((j) => j.id))
    const refNow = Date.now()
    const d = await mkApp([{ maxDuration: '1d', percent: '20' }], [
      { id: 1, roll_code: '7001', isEnd: 0, endTime: new Date(refNow + 2 * 3600 * 1000) },
    ])
    const added4 = mod.remindManager.getAllJobs().filter((j) => j.id > maxIdBefore)
    ok('重启时按「现在」为基准给未结束的抽奖补排提醒', added4.length === 1, added4.length)
    if (added4.length === 1) {
      const got = new Date(added4[0].job.nextInvocation()).getTime()
      ok('补排的提醒时刻 = 开奖时间 − 20% 剩余时长', Math.abs(got - (refNow + 2 * 3600 * 1000 * 0.8)) <= 61 * 1000,
        Math.round((got - refNow) / 1000))
    }
    added4.forEach((j) => j.job.cancel())
    await d.stop()

    // 已经结束（开奖时间在过去）的记录：剩余时长 ≤ 0，重启时不排
    const e = await mkApp([{ maxDuration: '1d', percent: '20' }], [])
    const before5 = new Set(mod.remindManager.getAllJobs().map((j) => j.id))
    await create(e, atText(Date.now() - 30 * 60 * 1000))
    ok('已过开奖时间的抽奖不排提醒任务', jobsSince(before5).length === 0, jobsSince(before5).length)
    await e.stop()
  }

  // ⑤ 生命周期：开奖 / 删除后自动清理提醒任务
  {
    const a = await mkApp([{ maxDuration: '1d', percent: '20,10' }])
    const before = new Set(mod.remindManager.getAllJobs().map((j) => j.id))
    await create(a, atText(Date.now() + 10 * 3600 * 1000))
    const ids = jobsSince(before).map((j) => j.id)
    ok('开奖前排上了提醒任务（供后续清理验证）', ids.length === 2, ids)
    a.emit('giveaway/roll-end', 1)
    await new Promise((r) => setTimeout(r, 200))
    ok('开奖后提醒任务被取消（不会在开奖后再播报）', ids.every((id) => !mod.remindManager.getJob(id)), ids)
    await a.stop()

    const b = await mkApp([{ maxDuration: '1d', percent: '20' }])
    const before2 = new Set(mod.remindManager.getAllJobs().map((j) => j.id))
    await create(b, atText(Date.now() + 10 * 3600 * 1000))
    const ids2 = jobsSince(before2).map((j) => j.id)
    b.emit('giveaway/roll-expired', 1)
    await new Promise((r) => setTimeout(r, 200))
    ok('抽奖删除 / 记录清理后提醒任务被取消', ids2.length === 1 && ids2.every((id) => !mod.remindManager.getJob(id)), ids2)
    await b.stop()
  }
}

  dispose()
  await app.stop()
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('❌ 运行失败:', e); process.exit(1) })
