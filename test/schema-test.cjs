const path = require('path')
const fs = require('fs')
const ROOT = path.join(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')
const LOCALES_DIR = path.join(SRC_DIR, 'locales')

const { Config } = require(path.join(__dirname, '.perm.cjs'))
const json = Config.toJSON(), refs = json.refs
const LOCALES = ['zh-CN', 'en-US', 'de-DE']
let pass = 0, fail = 0
const ok = (n, c) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}`) }
const at = (path) => path.split('.').reduce((n, seg) => refs[n.dict[seg]], refs[json.uid])

// 收集控制台表单的全部节点（分组 + 字段 + 数组成员）
const nodes = []
function walk(node, prefix) {
  if (!node || !node.dict) return
  for (const [k, id] of Object.entries(node.dict)) {
    const child = refs[id]
    const p = prefix ? `${prefix}.${k}` : k
    nodes.push([p, child])
    if (child.type === 'object') walk(child, p)
    else if (child.type === 'array' && refs[child.inner]) {
      const inner = refs[child.inner]
      if (inner.type === 'union') child._labels = inner.list.map((id) => refs[id].meta?.description)
      else walk(inner, p)
    }
    else if (child.type === 'union') child._labels = child.list.map((id) => refs[id].meta?.description)
  }
}
walk(refs[json.uid], '')

console.log('=== 控制台表单结构（顶层分组 + 字段）===')
for (const [p, n] of nodes) {
  const tag = [n.type, n.meta?.role && `role=${n.meta.role}`].filter(Boolean).join(' ')
  const def = n.meta?.default === undefined ? '' : ` 默认=${JSON.stringify(n.meta.default)}`
  const depth = p.split('.').length > 1 ? '    ' : '  '
  console.log(`${depth}${p} [${tag}]${def}`)
}
ok('顶层分组 = basic / permission / join / render / remind', JSON.stringify(Object.keys(refs[json.uid].dict)) === '["basic","permission","join","render","remind"]')
ok('旧文档分组 usage 已移除', refs[json.uid].dict.usage === undefined)
ok('旧的管理员名单 basic.adminUsers 已移除', at('basic').dict.adminUsers === undefined)
const styleUnion = at('render.style')
ok('render.style 只有 default / anime / avemujica 三项（哥特已彻底删除）',
  JSON.stringify(styleUnion.list.map((id) => refs[id].value)) === '["default","anime","avemujica"]',
  styleUnion.list.map((id) => refs[id].value))
ok('union 里没有任何兼容分支（不做老配置兼容）',
  styleUnion.list.every((id) => refs[id].type === 'const'), styleUnion.list.map((id) => refs[id].type))
{
  // 有意为之：老配置里的 gothic 现在会直接校验失败（升级后重新选一次风格）
  let legacyRejected = false
  try { Config({ render: { style: 'gothic' } }) } catch { legacyRejected = true }
  ok('老配置的 gothic 现在会被拒绝（不再兼容）', legacyRejected)
  let typoRejected = false
  try { Config({ render: { style: 'nope' } }) } catch { typoRejected = true }
  ok('乱写的风格值同样被拒绝', typoRejected)
}
ok('render.detail 默认开启（抽奖详情用图片重新调出卡片）', at('render.detail').meta.default === true)
ok('render.member 默认开启（抽奖成员用图片列出参与名单）', at('render.member').meta.default === true)
ok('render.memberLimit 默认 12、范围 1~100（可设置最大显示参与人数）',
  at('render.memberLimit').meta.default === 12 && at('render.memberLimit').meta.min === 1 && at('render.memberLimit').meta.max === 100)
ok('render 各项默认开启（装了 puppeteer 就出图）',
  at('render.create').meta.default === true && at('render.list').meta.default === true
  && at('render.result').meta.default === true && at('render.avatar').meta.default === true)

console.log('\n=== 界面文案：每个节点在三个语言下都有描述 ===')
for (const loc of LOCALES) {
  const missing = nodes.filter(([, n]) => n.type === 'union'
    ? !(n._labels || []).every((d) => d?.[loc])
    : !n.meta?.description?.[loc]).map(([p]) => p)
  ok(`${loc}: ${nodes.length} 个节点全部有描述`, missing.length === 0)
  if (missing.length) console.log('     缺失:', missing.join(', '))
}

console.log('\n=== 默认值与约束 ===')
const cases = [['basic.cacheHours', 72], ['basic.defaultTimeOffset', '+8'],
  ['permission.authorityCreate', 1], ['permission.authorityManage', 3],
  ['permission.allowGuildAdminDelete', true], ['permission.allowGuildAdminEnd', true]]
for (const [p, want] of cases) ok(`${p} = ${JSON.stringify(want)}`, JSON.stringify(at(p).meta.default) === JSON.stringify(want))
ok('权限等级上限为 4（与 Koishi 一致）', at('permission.authorityCreate').meta.max === 4 && at('permission.authorityManage').meta.max === 4)
ok('开奖提醒规则表 role=table', at('remind.rules').meta.role === 'table')
ok('开奖提醒默认 4 档规则（1h→20% / 5h→15% / 1d→10% / 不限→10%）',
  JSON.stringify(at('remind.rules').meta.default) === JSON.stringify([
    { maxDuration: '1h', percent: '20' }, { maxDuration: '5h', percent: '15' },
    { maxDuration: '1d', percent: '10' }, { maxDuration: '0', percent: '10' },
  ]), at('remind.rules').meta.default)
ok('提醒配置只剩规则表一项', JSON.stringify(Object.keys(at('remind').dict)) === '["rules"]', Object.keys(at('remind').dict))
ok('空配置可解析（控制台保存 {} 不报错）', !!Config({}))
console.log('\n=== 参与条件（join）默认值与标签 ===')
const joinCases = [['join.minGroupLevel', 0], ['join.minActiveDays', 0], ['join.minContinuousDays', 0],
  ['join.honorMode', 'any'], ['join.dragonScope', 'list'], ['join.onFetchError', 'allow'], ['join.cacheMinutes', 5]]
for (const [p, want] of joinCases) ok(`${p} = ${JSON.stringify(want)}`, JSON.stringify(at(p).meta.default) === JSON.stringify(want))
ok('join.requiredHonors 默认空数组（=不限制）', JSON.stringify(at('join.requiredHonors').meta.default) === '[]')
const honorUnion = refs[at('join.requiredHonors').inner]
ok('requiredHonors 三个可选标识', JSON.stringify(honorUnion.list.map((id) => refs[id].value)) === '["fire7","fire30","dragon"]')
ok('requiredHonors 标签三语齐全', honorUnion.list.map((id) => refs[id]).every((b) => b.meta?.description?.['zh-CN'] && b.meta?.description?.['en-US'] && b.meta?.description?.['de-DE']))
// 控制台里新增的空行值是 null，而 schemastery-vue 用 optional(schema)(null) 判断选项是否匹配：
// 非 required 的 const 会接受 null → 空行在界面上显示成第一个选项（群聊之火），实际存的是 null
const optional = (s) => {
  if (s.type === 'const') return s
  if (s.type === 'transform') return optional(s.inner)
  s = new (require('schemastery'))(s).required(false)
  if (s.type === 'union') s.list = s.list.map(optional)
  return s
}
const uiCheck = (s, v) => { try { optional(s)(v); return true } catch { return false } }
const realHonorUnion = Config.dict.join.dict.requiredHonors.inner
ok('requiredHonors 候选项都是 required（空行不再伪装成「群聊之火」）',
  honorUnion.list.map((id) => refs[id]).every((b) => b.meta?.required === true))
ok('空值(null) 在控制台匹配不到任何选项 → 下拉显示为空',
  realHonorUnion.list.findIndex((b) => uiCheck(b, null)) === -1)
ok('真实值仍能匹配到对应选项',
  JSON.stringify(realHonorUnion.list.map((b, i) => uiCheck(b, ['fire7', 'fire30', 'dragon'][i]))) === '[true,true,true]')
ok('历史配置里的 null 仍可解析（升级不会让插件加载失败）',
  JSON.stringify(Config({ join: { requiredHonors: ['fire30', 'dragon', null] } }).join.requiredHonors) === '["fire30","dragon",null]')
ok('非法标识仍被拦截', (() => { try { Config({ join: { requiredHonors: ['bogus'] } }); return false } catch { return true } })())
const modeUnion = at('join.honorMode')
ok('honorMode 可选 any/all', JSON.stringify(modeUnion.list.map((id) => refs[id].value)) === '["any","all"]')
const errUnion = at('join.onFetchError')
ok('onFetchError 可选 allow/deny', JSON.stringify(errUnion.list.map((id) => refs[id].value)) === '["allow","deny"]')
ok('群聊等级上限 100 / 活跃与连续天数上限 365', at('join.minGroupLevel').meta.max === 100
  && at('join.minActiveDays').meta.max === 365 && at('join.minContinuousDays').meta.max === 365)
const dragonUnion = at('join.dragonScope')
ok('dragonScope 可选 list/current', JSON.stringify(dragonUnion.list.map((id) => refs[id].value)) === '["list","current"]')
ok('dragonScope 标签三语齐全', dragonUnion.list.map((id) => refs[id]).every((b) => b.meta?.description?.['zh-CN'] && b.meta?.description?.['en-US'] && b.meta?.description?.['de-DE']))
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
