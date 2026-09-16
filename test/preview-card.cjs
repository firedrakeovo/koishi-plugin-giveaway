const path = require('path')
const fs = require('fs')
const ROOT = path.join(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')
const LOCALES_DIR = path.join(SRC_DIR, 'locales')

// 渲染预览：把插件生成的卡片 HTML 用真实 Chromium 截图（模拟 koishi-plugin-puppeteer 的
// 「截 body 包围盒」行为），用来判断图片宽度 / 两侧留白 / 字号观感。
//
// 用法：node preview-card.cjs [list|create|end] [style] [out.png] [卡片宽度覆盖]
const perm = require(path.join(__dirname, '.perm.cjs'))
// puppeteer-core 只是预览工具的可选依赖：没装就跳过（不参与 CI 默认流程）
let puppeteer = null
try { puppeteer = require('puppeteer-core') } catch { puppeteer = null }

// 沙箱里完整版 chrome 起不来（crashpad），用 chrome-headless-shell（与生产渲染结果一致）
const EXE = process.env.CHROME || ''
const OUTDIR = path.join(__dirname, 'previews')
fs.mkdirSync(OUTDIR, { recursive: true })
const [, , kind = 'list', style = 'avemujica', out = `${OUTDIR}/${kind}-${style}.png`, widthCss] = process.argv

/** 用真实 i18n（三语文件）+ 假 puppeteer 抓出插件真正要发给 puppeteer 的 HTML */
async function captureHtml(kind, style) {
  const { Context } = require('koishi')
  const yaml = require('js-yaml')
  const SRC = LOCALES_DIR
  let html = ''
  const app = new Context({})
  for (const loc of ['zh-CN', 'en-US', 'de-DE']) app.i18n.define(loc, yaml.load(fs.readFileSync(`${SRC}/${loc}.yml`, 'utf8')))
  app.puppeteer = { render: async (h) => { html = h; return '<img/>' } }
  // 开奖结果卡片要查中奖名单：给个最小 database 桩
  app.database = {
    get: async (table) => table === 'roll_member' ? [{ user_id: 0 }] : table === 'prize' ? [{ id: 9, name: '显卡', amount: 1 }] : table === 'binding' ? [{ aid: 0, platform: 'onebot', pid: '12345' }] : [],
    join: () => ({ execute: async () => [{ roll_prize: { roll_id: 1, prize_id: 9 }, user_prize: { user_id: 0, prize_id: 9, amount: 1 } }] }),
  }
  const session = {
    app, user: { id: 0, offset: '+08:00' }, channel: { id: 'g1', locales: [] },
    channelId: 'g1', platform: 'onebot', locales: ['zh-CN'],
    text: (k, params) => String(app.i18n.render(['zh-CN'], [k], params || {}).join('')),
  }
  const ctx = app
  const options = { style, banner: '' }
  const rows = [
    { id: 1, roll_code: '5645', title: '双十一显卡大放送', isEnd: 0, isAutoEnd: 1, endTime: new Date(Date.now() + 3600 * 1000) },
    { id: 2, roll_code: '5646', title: '群友专属抽奖', isEnd: 0, isAutoEnd: 0 },
    { id: 3, roll_code: '5647', title: '已经结束的抽奖', isEnd: 1, isAutoEnd: 1, endTime: new Date(Date.now() - 3600 * 1000) },
  ]
  if (kind === 'list') {
    await perm.rollListImage(ctx, session, { open: rows.slice(0, 2), ended: rows.slice(2) }, '+08:00', 'g1', options)
  } else if (kind === 'member') {
    await perm.rollMemberImage(ctx, session, { id: 1, roll_code: '5645', title: '双十一显卡大放送', isEnd: 0 }, options)
  } else if (kind === 'detail' || kind === 'detail-ended') {
    await perm.rollDetailImage(ctx, session, {
      id: 1, roll_code: '5645', title: '双十一显卡大放送', description: '满 40 级可参加，口令见下',
      joinKey: '参加', isAutoEnd: 1, isEnd: kind === 'detail-ended' ? 1 : 0, endTime: new Date(Date.now() + 3600 * 1000),
    }, [{ name: '显卡', amount: 1 }, { name: '机械键盘', amount: 2 }], '+08:00', '等级≥40 活跃≥1 标识=群聊炽焰,龙王', options)
  } else if (kind === 'create') {
    await perm.rollCreatedImage(ctx, session, { id: 1, roll_code: '5645', title: '双十一显卡大放送', description: '满 40 级可参加，口令见下', joinKey: '参加', endTime: new Date(Date.now() + 3600 * 1000) },
      [{ name: '显卡', amount: 1 }, { name: '机械键盘', amount: 2 }], '+08:00', '等级≥40 活跃≥1 标识=群聊炽焰,龙王', options)
  } else {
    const bot = { platform: 'onebot', getUser: async () => ({ name: '张三' }) }
    await perm.rollEndImage(ctx, { id: 1, roll_code: '5645', title: '双十一显卡大放送' }, ['zh-CN'], bot, true, options)
  }
  return html
}

const measure = () => ({
  body: document.body.getBoundingClientRect().toJSON(),
  card: document.querySelector('.card')?.getBoundingClientRect().toJSON(),
  innerWidth: window.innerWidth,
})

async function shoot(kind, style, out, widthCss) {
  if (!puppeteer) throw new Error('未安装 puppeteer-core（npm i -D puppeteer-core）或未设置 CHROME，无法截图预览')
  let html = await captureHtml(kind, style)
  if (!html) throw new Error('没有抓到 HTML')
  if (widthCss) html = html.replace(/--card-w:\s*\d+px/, `--card-w: ${widthCss}px`)

  const browser = await puppeteer.launch({ executablePath: EXE, headless: 'shell', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 768, deviceScaleFactor: 2 })   // koishi-plugin-puppeteer 的默认 viewport
  await page.setContent(html, { waitUntil: 'load' })
  const body = await page.$('body')
  const clip = await body.boundingBox()
  const buf = await page.screenshot({ clip })
  const m = await page.evaluate(measure)
  fs.writeFileSync(out, buf)
  await browser.close()

  const png = fs.readFileSync(out)
  const px = png.readUInt32BE(16), py = png.readUInt32BE(20)   // PNG IHDR 宽高（物理像素）
  return {
    kind, style, out,
    viewportCss: m.innerWidth,
    bodyCss: Math.round(m.body.width),
    cardCss: m.card && Math.round(m.card.width),
    sideBarCss: m.card && Math.round((m.body.width - m.card.width) / 2),
    bodyPaddingCss: m.body.width - (m.card ? m.card.width : 0),
    pngWidth: px, pngHeight: py, dsf: 2,
  }
}

module.exports = { captureHtml, shoot }

if (require.main === module) {
  shoot(kind, style, out, widthCss)
    .then((m) => console.log(JSON.stringify(m, null, 2)))
    .catch((e) => { console.error('❌', e); process.exit(1) })
}
