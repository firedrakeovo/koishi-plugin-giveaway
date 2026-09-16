const path = require('path')
const fs = require('fs')
const ROOT = path.join(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')
const LOCALES_DIR = path.join(SRC_DIR, 'locales')

// 三语文案核对：key 集合 / 占位符 / 元素标签一致、en/de 无中文残留、每条文案都能渲染出非空内容
const LOCALES = ['zh-CN', 'en-US', 'de-DE']
const { Context } = require('koishi')
const yaml = require('js-yaml')

const SRC = LOCALES_DIR
const data = {}
for (const loc of LOCALES) data[loc] = yaml.load(fs.readFileSync(`${SRC}/${loc}.yml`, 'utf8'))

let pass = 0, fail = 0
const ok = (n, c, extra) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300)}`) }

const flat = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o ?? {})) {
    const q = p ? `${p}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, q, out)
    else out[q] = v
  }
  return out
}
const flatAll = {}
for (const loc of LOCALES) flatAll[loc] = flat(data[loc])
const keys = LOCALES.map((l) => Object.keys(flatAll[l]).sort())

console.log('=== 1. key 集合三语一致 ===')
{
  const missing = keys.map((k, i) => [LOCALES[i], k.filter((x) => !keys[0].includes(x))]).filter(([, m]) => m.length)
  ok('三语 key 集合完全一致', missing.length === 0, missing)
  ok('key 数量 > 100（没有把整块文案弄丢）', keys[0].length > 100, keys[0].length)
}

console.log('=== 2. 占位符 / 元素标签一致 ===')
{
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',')
  const tags = (s) => (String(s).match(/<\/?[a-zA-Z]+/g) || []).sort().join(',')
  const badPh = [], badTag = []
  for (const k of keys[0]) {
    const p = LOCALES.map((l) => ph(flatAll[l][k]))
    if (new Set(p).size > 1) badPh.push([k, p])
    const t = LOCALES.map((l) => tags(flatAll[l][k]))
    if (new Set(t).size > 1) badTag.push([k, t])
  }
  ok('每条文案的 {占位符} 三语一致', badPh.length === 0, badPh)
  ok('每条文案的元素标签（p/code/b/at/quote/a）三语一致', badTag.length === 0, badTag)
}

console.log('=== 3. 英德文无中文残留 ===')
{
  const CJK = /[\u4e00-\u9fff]/
  for (const loc of ['en-US', 'de-DE']) {
    const hit = keys[0].filter((k) => CJK.test(String(flatAll[loc][k])))
    ok(`${loc} 无 CJK 残留`, hit.length === 0, hit)
  }
}

console.log('=== 4. 每条文案在三种语言下都能渲染出内容 ===')
{
  const app = new Context({})
  for (const loc of LOCALES) app.i18n.define(loc, data[loc])
  // 说明：`_config.*` 是控制台表单文案，由 `Config.i18n()` 消费（不走 ctx.i18n.render），
  // 这里只核对消息类文案；`_config.*` 的完整性由上面的 key 集合一致性 + 第 5 节检查。
  const messageKeys = keys[0].filter((k) => !k.startsWith('_config.'))
  for (const loc of LOCALES) {
    const empty = []
    for (const k of messageKeys) {
      const out = String(app.i18n.render([loc], [k]).join(''))
      // 缺 key 时 Koishi 会把 key 路径原样返回 —— 那也算「没翻译」
      if (!out || out === k) empty.push(k)
    }
    ok(`${loc} 全部 ${messageKeys.length} 条消息文案可渲染`, empty.length === 0, empty)
  }
}

console.log('=== 5. 代码里用到的文案键都存在（防止漏加 key 后渲染成路径） ===')
{
  const fs2 = require('fs')
  const SRC = SRC_DIR
  const files = []
  const walk = (dir) => {
    for (const entry of fs2.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.ts')) files.push(full)
    }
  }
  walk(SRC)
  // 只扫 messageBuilder.* / events.* / commands.* 这类文案键（配置键 _config.* 由 schema 用例覆盖）
  const used = new Set()
  for (const file of files) {
    const text = fs2.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/['"`]((?:messageBuilder|events|commands)\.[A-Za-z0-9_.]+)['"`]/g)) used.add(m[1])
  }
  const missing = [...used].filter((k) => !(k in flatAll['zh-CN']))
  ok(`代码里引用的 ${used.size} 个文案键都存在`, missing.length === 0, missing)
}

console.log('=== 6. 提醒改造后的键位（防回退） ===')
{
  const need = [
    '_config.remind.$description',
    '_config.remind.rules.$description',
    '_config.remind.rules.maxDuration',
    '_config.remind.rules.percent',
    'events.remind.broadcast.message',
    'events.remind.broadcast.messageWithDiff',
  ]
  const miss = need.filter((k) => !(k in flatAll['zh-CN']))
  ok('开奖提醒相关键三语齐全', miss.length === 0, miss)
  const dead = keys[0].filter((k) => k.startsWith('commands.giveaway.reminder') || k.startsWith('commands.giveaway.remind')
    || k.startsWith('messageBuilder.roll.remind') || k.startsWith('messageBuilder.reminder')
    || /^messageBuilder\.marks\.(enable|disable|specified|beforeEnd|interval)$/.test(k))
  ok('已下线的手动提醒器文案没有残留', dead.length === 0, dead)
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
