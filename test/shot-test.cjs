// 真实渲染验收：用 Chromium（与 koishi-plugin-puppeteer 同样的「截 body 包围盒」方式）
// 检查卡片图片里不再有两侧大片背景（黑边）、宽度可控。
//
// 需要 puppeteer-core 与 Chromium（CHROME 环境变量或常见路径）；找不到就跳过而不是失败。
const fs = require('fs')
const path = require('path')
const CANDIDATES = [
  process.env.CHROME,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean)

let pass = 0, fail = 0, skip = 0
const ok = (n, c, extra) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c || extra === undefined ? '' : ' → ' + JSON.stringify(extra)}`) }

;(async () => {
  const exe = CANDIDATES.find((p) => fs.existsSync(p))
  if (!exe) { console.log('⚠️  找不到 Chromium（设置 CHROME 环境变量后重跑），跳过真实渲染验收'); process.exit(0) }
  process.env.CHROME = exe
  const { shoot } = require(path.join(__dirname, 'preview-card.cjs'))
  const OUT = path.join(__dirname, 'previews')
  fs.mkdirSync(OUT, { recursive: true })

  console.log('=== 真实截图：卡片必须收缩到自身宽度（两侧只留 14px 背景内边距）===')
  for (const kind of ['list', 'create', 'end', 'detail', 'detail-ended', 'member']) {
    for (const style of ['default', 'anime', 'avemujica']) {
      const m = await shoot(kind, style, `${OUT}/${kind}-${style}.png`)
      const barOk = m.sideBarCss <= 15 && m.bodyCss - m.cardCss <= 30
      ok(`${kind}/${style}：无两侧大片背景（卡片 ${m.cardCss}px / body ${m.bodyCss}px）`, barOk,
        barOk ? undefined : { sideBarCss: m.sideBarCss, bodyCss: m.bodyCss, cardCss: m.cardCss })
    }
  }

  console.log('=== 图片像素宽度 = 卡片宽度（×2 DPI），与浏览器视口宽度无关 ===')
  {
    const a = await shoot('list', 'avemujica', `${OUT}/width-420.png`)
    ok('默认 420：图片宽 896px（(420+28)×2），远小于旧实现按视口算出的 2560px',
      a.pngWidth === (a.cardCss + 28) * 2 && a.pngWidth < 1000, { pngWidth: a.pngWidth, viewportCss: a.viewportCss })

    const b = await shoot('list', 'avemujica', `${OUT}/width-640.png`, 640)
    ok('宽度可调：640 → 图片宽 1336px，仍然没有黑边',
      b.pngWidth === (b.cardCss + 28) * 2 && b.sideBarCss <= 15, { pngWidth: b.pngWidth, cardCss: b.cardCss, sideBarCss: b.sideBarCss })
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败${skip ? ` / ${skip} 跳过` : ''}`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('❌ 运行失败:', e); process.exit(1) })
