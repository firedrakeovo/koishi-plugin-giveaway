const path = require('path')
const fs = require('fs')
const ROOT = path.join(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')
const LOCALES_DIR = path.join(SRC_DIR, 'locales')

const J = require(path.join(__dirname, '.perm.cjs'))
const { checkJoinPolicy, clearJoinPolicyCache, toMillis, requiredHonorTypes, hasJoinConditions, Config } = J

;(async () => {
let pass = 0, fail = 0
const ok = (n, c, extra) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c || !extra ? '' : ' → ' + JSON.stringify(extra)}`) }

// ---- 打桩的 OneBot 接口 ----
const DAY = 86400000
function makeSession({ user = 10001, group = 123456, onebot = true } = {}) {
  const calls = { member: 0, honor: [] }
  const mock = onebot ? {
    memberInfo: null,
    memberError: null,
    honors: {},           // type -> HonorInfo
    honorError: null,
    cookies: 'uin=o1234567; skey=@abcdef; p_skey=xyz',
    cookieError: null,
    async getCookies() {
      if (this.cookieError) throw new Error(this.cookieError)
      return this.cookies
    },
    async getGroupMemberInfo() {
      calls.member++
      if (this.memberError) throw new Error(this.memberError)
      return this.memberInfo
    },
    async getGroupHonorInfo(gid, type) {
      calls.honor.push(type)
      if (this.honorError) throw new Error(this.honorError)
      return this.honors[type] ?? {}
    },
  } : undefined
  const session = {
    onebot: mock,
    guildId: String(group),
    userId: String(user),
    text: (key, params) => (params ? `${key}(${JSON.stringify(params)})` : key),
  }
  return { session, mock, calls }
}
// 每个场景独立：先清缓存再检查。ctx 里放一个可控的 http 桩，避免测试真的发网络请求
let webHandler = async () => ({ retcode: 100000, msg: 'login error [errcode:100000:0]', data: [] })
const ctx = { http: { get: (url) => webHandler(url) } }
const check = async (session, cfg) => { clearJoinPolicyCache(); return checkJoinPolicy(ctx, session, cfg) }
const honor = (users) => ({ talkative_list: [], performer_list: [], legend_list: [], ...users })
const list = (ids) => ids.map((user_id) => ({ user_id, nickname: 'u' + user_id }))

console.log('=== 1. 时间戳归一化 / 荣誉类型推导 ===')
ok('秒 → 毫秒', toMillis(1700000000) === 1700000000000)
ok('毫秒保持不变', toMillis(1700000000000) === 1700000000000)
ok('0 / undefined → null', toMillis(0) === null && toMillis(undefined) === null)
ok('fire7 需要 performer + legend', JSON.stringify(requiredHonorTypes(['fire7'])) === '["performer","legend"]')
ok('fire30 只需 legend', JSON.stringify(requiredHonorTypes(['fire30'])) === '["legend"]')
ok('dragon 只需 talkative', JSON.stringify(requiredHonorTypes(['dragon'])) === '["talkative"]')
ok('无配置时 hasJoinConditions=false', hasJoinConditions(Config({})) === false)
ok('有等级条件时为 true', hasJoinConditions(Config({ join: { minGroupLevel: 40 } })) === true)

console.log('=== 2. 未配置条件：零开销 ===')
{
  const { session, calls } = makeSession()
  const r = await check(session, Config({}))
  ok('直接通过', r.ok === true)
  ok('没有调用任何接口', calls.member === 0 && calls.honor.length === 0, calls)
}

console.log('=== 3. 群聊等级 ===')
{
  const cfg = Config({ join: { minGroupLevel: 40 } })
  const { session, mock } = makeSession()
  mock.memberInfo = { user_id: 10001, level: '12' }
  const r = await check(session, cfg)
  ok('12 级 < 40 → 拒绝', r.ok === false && r.reason.key === 'level')
  ok('拒绝理由带当前/要求等级', r.reason.params.current === 12 && r.reason.params.required === 40, r.reason.params)
}
{
  const cfg = Config({ join: { minGroupLevel: 40 } })
  const { session, mock } = makeSession()
  mock.memberInfo = { user_id: 10001, level: '55' }
  ok('55 级 ≥ 40 → 通过', (await check(session, cfg)).ok === true)
  mock.memberInfo = { user_id: 10001 }
  ok('没有 level 字段（0 级）→ 拒绝', (await check(session, cfg)).ok === false)
}

console.log('=== 4. 最近发言（活跃度兜底）===')
for (const [label, val] of [['秒', Math.floor((Date.now() - 3 * DAY) / 1000)], ['毫秒', Date.now() - 3 * DAY]]) {
  const { session, mock } = makeSession()
  mock.memberInfo = { user_id: 10001, last_sent_time: val }
  ok(`3 天前发言（${label}）→ 通过`, (await check(session, Config({ join: { minActiveDays: 7 } }))).ok === true)
}
{
  const { session, mock } = makeSession()
  mock.memberInfo = { user_id: 10001, last_sent_time: Math.floor((Date.now() - 30 * DAY) / 1000) }
  const r = await check(session, Config({ join: { minActiveDays: 7 } }))
  ok('30 天前发言 → 拒绝', r.ok === false && r.reason.key === 'active')
  ok('理由里带上次发言天数', String(r.reason.params.last).includes('30'), r.reason.params)
}
{
  const { session, mock } = makeSession()
  mock.memberInfo = { user_id: 10001, last_sent_time: 0 }
  const r = await check(session, Config({ join: { minActiveDays: 7 } }))
  ok('从未发言 → 拒绝且提示从未发言', r.ok === false && String(r.reason.params.last).includes('never-spoke'), r.reason.params)
}

console.log('=== 5. 互动标识 ===')
{
  const cfg = Config({ join: { requiredHonors: ['fire7'] } })
  const { session, mock, calls } = makeSession()
  mock.honors.performer = honor({ performer_list: list([10001]) })
  mock.honors.legend = honor({ legend_list: [] })
  ok('持有群聊之火 → 通过', (await check(session, cfg)).ok === true)
  ok('只请求了 performer 与 legend', JSON.stringify(calls.honor) === '["performer","legend"]', calls.honor)
}
{
  const cfg = Config({ join: { requiredHonors: ['fire7'] } })
  const { session, mock } = makeSession()
  mock.honors.performer = honor({ performer_list: [] })
  mock.honors.legend = honor({ legend_list: list([10001]) })
  ok('只有炽焰（30 天）也算满足「连续 7 天」', (await check(session, cfg)).ok === true)
}
{
  const cfg = Config({ join: { requiredHonors: ['fire30'] } })
  const { session, mock } = makeSession()
  mock.honors.legend = honor({ legend_list: list([10001]) })
  ok('持有炽焰 → 满足 fire30', (await check(session, cfg)).ok === true)
  const { session: s2, mock: m2 } = makeSession()
  m2.honors.legend = honor({ legend_list: list([10002]) })   // 榜单非空（别人持有），本人没有
  const r = await check(s2, cfg)
  ok('无炽焰 → 拒绝并列出所需标识', r.ok === false && r.reason?.key === 'honor' && String(r.reason.params.required).includes('fire30'), r.reason?.params)
  const { session: s3, mock: m3 } = makeSession()
  m3.honors.legend = honor({ legend_list: [] })              // 全空 = 取不到数据
  const r3 = await check(s3, cfg)
  ok('榜单全空 + allow → 跳过标识检查放行', r3.ok === true && r3.detail.skipped === 'honor-unavailable', r3.detail)
}
{
  const { session, mock } = makeSession()
  mock.honors.talkative = honor({ talkative_list: list([10001, 10002]) })
  ok('龙王榜 → 通过', (await check(session, Config({ join: { requiredHonors: ['dragon'] } }))).ok === true)
}
{
  const cfg = Config({ join: { requiredHonors: ['fire7', 'dragon'], honorMode: 'all' } })
  const { session, mock } = makeSession()
  mock.honors.performer = honor({ performer_list: list([10001]) })
  mock.honors.legend = honor({ legend_list: [] })
  mock.honors.talkative = honor({ talkative_list: [] })
  ok('mode=all 只满足一个 → 拒绝', (await check(session, cfg)).ok === false)
  const { session: s2, mock: m2 } = makeSession()
  m2.honors.performer = honor({ performer_list: [] })
  m2.honors.legend = honor({ legend_list: [] })
  m2.honors.talkative = honor({ talkative_list: list([10001]) })
  ok('mode=all 但只有龙王 → 拒绝', (await check(s2, cfg)).ok === false)
  const cfgAny = Config({ join: { requiredHonors: ['fire7', 'dragon'], honorMode: 'any' } })
  const { session: s3, mock: m3 } = makeSession()
  m3.honors.performer = honor({ performer_list: [] })
  m3.honors.legend = honor({ legend_list: [] })
  m3.honors.talkative = honor({ talkative_list: list([10001]) })
  ok('mode=any 有龙王即可 → 通过', (await check(s3, cfgAny)).ok === true)
}

console.log('=== 6. 接口失败策略 ===')
{
  const { session, mock, calls } = makeSession()
  mock.memberError = '群成员不存在'
  ok('成员接口报错 + allow → 放行', (await check(session, Config({ join: { minGroupLevel: 40, onFetchError: 'allow' } }))).ok === true)
  clearJoinPolicyCache()
  const { session: s2, mock: m2 } = makeSession()
  m2.memberError = '群成员不存在'
  const r = await check(s2, Config({ join: { minGroupLevel: 40, onFetchError: 'deny' } }))
  ok('成员接口报错 + deny → 拒绝(unavailable)', r.ok === false && r.reason.key === 'unavailable')
  void calls
}
{
  const deny = Config({ join: { requiredHonors: ['dragon'], onFetchError: 'deny' } })
  const allow = Config({ join: { requiredHonors: ['dragon'], onFetchError: 'allow' } })
  const { session, mock } = makeSession()
  mock.honorError = 'cookie 失效'
  ok('荣誉接口报错 + deny → 拒绝', (await check(session, deny)).ok === false)
  clearJoinPolicyCache()
  const { session: s2, mock: m2 } = makeSession()
  m2.honorError = 'cookie 失效'
  ok('荣誉接口报错 + allow → 放行', (await check(s2, allow)).ok === true)
}
{
  // 荣誉接口“静默失败”：NapCat 失败时返回空列表
  const deny = Config({ join: { requiredHonors: ['dragon'], onFetchError: 'deny' } })
  const { session, mock } = makeSession()
  mock.honors.talkative = {}
  const r = await check(session, deny)
  ok('荣誉全空 + deny → 拒绝(unavailable) 而不是“你没有标识”', r.ok === false && r.reason.key === 'unavailable')
}

console.log('=== 7. 缓存 ===')
{
  clearJoinPolicyCache()
  const cfg = Config({ join: { minGroupLevel: 40, cacheMinutes: 5 } })
  const { session, mock, calls } = makeSession()
  mock.memberInfo = { user_id: 10001, level: '55' }
  await checkJoinPolicy({}, session, cfg)
  await checkJoinPolicy({}, session, cfg)
  ok('成员信息 60s 内复用（只取一次）', calls.member === 1, calls)
}
{
  clearJoinPolicyCache()
  const cfg = Config({ join: { requiredHonors: ['dragon'], cacheMinutes: 5 } })
  const { session, mock, calls } = makeSession()
  mock.honors.talkative = honor({ talkative_list: list([10001]) })
  await checkJoinPolicy({}, session, cfg)
  await checkJoinPolicy({}, session, cfg)
  ok('荣誉数据按缓存时长复用（只取一次）', calls.honor.length === 1, calls.honor)
}
{
  clearJoinPolicyCache()
  const cfg = Config({ join: { requiredHonors: ['dragon'], cacheMinutes: 0 } })
  const { session, mock, calls } = makeSession()
  mock.honors.talkative = honor({ talkative_list: list([10001]) })
  await checkJoinPolicy({}, session, cfg)
  await checkJoinPolicy({}, session, cfg)
  ok('cacheMinutes=0 → 每次都取', calls.honor.length === 2, calls.honor)
}

console.log('=== 8. 非 OneBot 平台 ===')
{
  const { session } = makeSession({ onebot: false })
  const r = await checkJoinPolicy({}, session, Config({ join: { minGroupLevel: 40 } }))
  ok('拿不到 onebot 接口 → 跳过检查放行', r.ok === true && r.detail.skipped === 'unsupported-platform')
}


console.log('=== 9. requiredHonors 里的无效值（控制台清空时留下的 null）===')
{
  const { normalizeHonors, hasJoinConditions } = J
  ok('normalizeHonors 过滤 null/undefined/非法值', JSON.stringify(normalizeHonors(['fire30', null, 'dragon', undefined, 'bogus'])) === '["fire30","dragon"]')
  ok('全是无效值 → 空数组', JSON.stringify(normalizeHonors([null, undefined])) === '[]')
  ok('requiredHonors=[null] 时视为没有条件', hasJoinConditions(Config({ join: { requiredHonors: [null] } })) === false)
  ok('[null] 时零开销直接通过', (await check(makeSession().session, Config({ join: { requiredHonors: [null] } }))).ok === true)
  ok('[fire30,null] 时仍要求 fire30', hasJoinConditions(Config({ join: { requiredHonors: ['fire30', null] } })) === true)
}

console.log('=== 10. QQ 网页接口兜底（NapCat 荣誉接口已失效）===')
{
  // 会话里带上 getCookies；NapCat 返回空 → 走网页接口
  const cfg = Config({ join: { requiredHonors: ['fire7'] } })
  const { session, mock, calls } = makeSession()
  mock.honors.performer = { performer_list: [] }
  mock.honors.legend = { legend_list: [] }
  const seen = []
  webHandler = async (url) => {
    seen.push(url)
    if (url.includes('honor_continuous') && url.includes('continuous_type=2')) {
      return { retcode: 0, data: { continuous_list: [{ uin: 10001, nick: '我', day_count: 9 }, { uin: 10002, nick: '他', day_count: 8 }] } }
    }
    return { retcode: 0, data: { continuous_list: [], talkative_list: [] } }
  }
  const r = await check(session, cfg)
  ok('网页接口有数据时判定通过（本人 day_count=9）', r.ok === true, r.reason?.params)
  ok('请求带上了 Cookie 与 gc 参数', seen.length > 0 && seen.every((u) => u.includes('gc=123456')), seen)
  ok('命中 honor_continuous 接口', seen.some((u) => u.includes('honor_continuous')), seen)
  void calls
}
{
  // 网页接口也没有 → 按 onFetchError 处理
  const { session, mock } = makeSession()
  mock.honors.talkative = {}
  webHandler = async () => ({ retcode: 100000, msg: 'login error', data: [] })
  const deny = Config({ join: { requiredHonors: ['dragon'], onFetchError: 'deny' } })
  const allow = Config({ join: { requiredHonors: ['dragon'], onFetchError: 'allow' } })
  const rd = await check(session, deny)
  ok('两条路都失败 + deny → 拒绝(unavailable)', rd.ok === false && rd.reason.key === 'unavailable')
  const ra = await check(session, allow)
  ok('两条路都失败 + allow → 跳过检查放行', ra.ok === true && ra.detail.skipped === 'honor-unavailable')
}
{
  // Cookie 取不到
  const { session, mock } = makeSession()
  mock.honors.talkative = {}
  mock.cookieError = 'get_cookies 不支持'
  const r = await check(session, Config({ join: { requiredHonors: ['dragon'], onFetchError: 'allow' } }))
  ok('拿不到 Cookie 时不崩、按 allow 放行', r.ok === true)
}
{
  // 网页接口返回里说话的人不是本人 → 拒绝，并给出所需标识
  const { session, mock } = makeSession()
  mock.honors.talkative = {}
  webHandler = async (url) => url.includes('honor_talkative')
    ? { retcode: 0, data: { talkative_list: [{ uin: 10002, nick: '别人' }] } }
    : { retcode: 0, data: { continuous_list: [] } }
  const r = await check(session, Config({ join: { requiredHonors: ['dragon'] } }))
  ok('榜单有别人但没有本人 → 拒绝(honor)', r.ok === false && r.reason.key === 'honor', r.reason?.params)
}


console.log('=== 12. bkn 计算与鉴权变体（csfr error 100021）===')
{
  const { calcBkn, parseCookies, resetAuthVariant, AUTH_VARIANTS } = J
  const cookies = parseCookies('uin=o1234567; skey=@AbCdEfGh; p_skey=XYZ123')
  ok('parseCookies 解析出 skey/p_skey', cookies.skey === '@AbCdEfGh' && cookies.p_skey === 'XYZ123')
  ok('calcBkn 输出为纯数字字符串', /^\d+$/.test(calcBkn('@AbCdEfGh')))
  ok('calcBkn 空串返回空', calcBkn('') === '')
  // 与 NapCat 自己的实现（napcat.mjs 里的 getBknFromSKey）交叉验证。
  // 需要本地 NapCat 源码：设置 NAPCAT_SRC=/path/to/napcat.mjs 才会启用，CI 里自动跳过。
  const napcatPath = process.env.NAPCAT_SRC
  if (napcatPath && fs.existsSync(napcatPath)) {
    const napcat = fs.readFileSync(napcatPath, 'utf8')
    // 用括号配对提取 NapCat 自己的 getBknFromSKey 实现
    const start = napcat.indexOf('getBknFromSKey(e)')
    let depth = 0, from = napcat.indexOf('{', start), to = -1
    for (let i = from; i < napcat.length; i++) {
      if (napcat[i] === '{') depth++
      else if (napcat[i] === '}') { depth--; if (depth === 0) { to = i; break } }
    }
    const impl = new Function('e', napcat.slice(from + 1, to))
    const inputs = ['@AbCdEfGh', 'skey-1234567890', 'x', '!@#$%^&*()_+']
    const pairs = inputs.map((v) => [impl(v), calcBkn(v)])
    ok('与 NapCat getBknFromSKey 结果一致（4 组输入）', pairs.every(([a, b]) => a === b), pairs)
  } else {
    console.log('  ⏭ 跳过与 NapCat 的 bkn 交叉验证（设置 NAPCAT_SRC 指向 napcat.mjs 可启用）')
  }
  ok('鉴权变体表包含 bkn(skey)', AUTH_VARIANTS.some((v) => v.name === 'bkn(skey)'))

  // 只带 cookie 会 100021，加 bkn 后成功 → 应自动选中 bkn 变体并判定通过
  resetAuthVariant()
  const { session, mock } = makeSession()
  mock.honors.talkative = {}
  const urls = []
  webHandler = async (url) => {
    urls.push(url)
    const withBkn = /[?&]bkn=\d+/.test(url)
    return withBkn
      ? { retcode: 0, data: { talkative_list: [{ uin: 10001, nick: '我', day_count: 3 }] } }
      : { retcode: 100021, msg: 'csrf error [errcode:100021:0]', data: [] }
  }
  const r = await check(session, Config({ join: { requiredHonors: ['dragon'] } }))
  ok('自动补上 bkn 后判定通过', r.ok === true, r.reason?.params)
  ok('确实发出过带 bkn 的请求', urls.some((u) => /[?&]bkn=\d+/.test(u)), urls.map((u) => u.slice(-40)))
  ok('第一次请求未带 bkn（用于探路）', urls.length > 1 && !/[?&]bkn=\d+/.test(urls[0]))
}

console.log('=== 13. 自定义最长连续发言天数（day_count_max）===')
{
  const { maxContinuousDays, requiredHonorTypes, hasJoinConditions } = J
  ok('maxContinuousDays 取各榜最大值', maxContinuousDays({ a: [{ user_id: 1, day_count: 3, day_count_max: 9 }], b: [{ user_id: 1, day_count: 20 }] }, 1) === 20)
  ok('maxContinuousDays 无记录返回 null', maxContinuousDays({ a: [{ user_id: 2, day_count_max: 5 }] }, 1) === null)
  ok('设了连续天数时也拉 火/炽焰 榜', JSON.stringify(requiredHonorTypes([], true)) === '["performer","legend"]')
  ok('hasJoinConditions 计入连续天数', hasJoinConditions(Config({ join: { minContinuousDays: 5 } })) === true)

  const cfg = Config({ join: { minContinuousDays: 14 } })
  const { session, mock, calls } = makeSession()
  mock.honors.performer = { performer_list: [{ user_id: 10001, nickname: '我', day_count: 14, day_count_max: 14 }] }
  mock.honors.legend = { legend_list: [] }
  const pass = await check(session, cfg)
  ok('最长连续 14 天 ≥ 14 → 通过', pass.ok === true, pass.reason?.params)
  ok('请求了 火/炽焰 两个榜', JSON.stringify(calls.honor) === '["performer","legend"]', calls.honor)
}
{
  const cfg = Config({ join: { minContinuousDays: 14 } })
  const { session, mock } = makeSession()
  mock.honors.performer = { performer_list: [{ user_id: 10001, nickname: '我', day_count: 9, day_count_max: 9 }] }
  mock.honors.legend = { legend_list: [] }
  const r = await check(session, cfg)
  ok('最长 9 天 < 14 → 拒绝(continuous)', r.ok === false && r.reason.key === 'continuous', r.reason?.params)
  ok('拒绝理由带当前/要求天数', r.reason.params.current === 9 && r.reason.params.required === 14, r.reason.params)
}
{
  const cfg = Config({ join: { minContinuousDays: 7 } })
  const { session, mock } = makeSession()
  // 榜上有别人、没有本人 → 不算"取不到数据"，而是本人无连续记录
  mock.honors.performer = { performer_list: [{ user_id: 10002, nickname: '别人', day_count_max: 30 }] }
  mock.honors.legend = { legend_list: [] }
  const r = await check(session, cfg)
  ok('本人不在任何榜单 → 拒绝(continuous, current=0)', r.ok === false && r.reason.key === 'continuous' && r.reason.params.current === 0, r.reason?.params)
}

console.log('=== 14. 龙王口径（榜单 / 仅当前龙王）===')
{
  const cfgList = Config({ join: { requiredHonors: ['dragon'], dragonScope: 'list' } })
  const cfgTop = Config({ join: { requiredHonors: ['dragon'], dragonScope: 'current' } })
  const { session, mock } = makeSession()
  mock.honors.talkative = {
    talkative_list: [{ user_id: 10002, nickname: 'A' }, { user_id: 10001, nickname: '我' }],
    current_talkative: { user_id: 10002, nickname: 'A', day_count: 4 },
  }
  ok('list 口径：在昨日活跃榜即可通过', (await check(session, cfgList)).ok === true)
  const rTop = await check(session, cfgTop)
  ok('current 口径：不是榜首 → 拒绝', rTop.ok === false && rTop.reason.key === 'honor', rTop.reason?.params)

  const { session: s2, mock: m2 } = makeSession()
  m2.honors.talkative = { talkative_list: [{ user_id: 10001, nickname: '我' }], current_talkative: { user_id: 10001, nickname: '我' } }
  ok('current 口径：榜首本人 → 通过', (await check(s2, cfgTop)).ok === true)

  const { session: s3, mock: m3 } = makeSession()
  m3.honors.talkative = { talkative_list: [{ user_id: 10001, nickname: '我' }] }   // 没有 current_talkative 字段
  const rNoCur = await check(s3, cfgTop)
  ok('current 口径：缺少 current_talkative 时按未达标处理', rNoCur.ok === false && rNoCur.reason.key === 'honor')
}

// 诊断指令是否注册，用部署副本跑 runner-deployed.cjs 验证（见部署流程）

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
})()
