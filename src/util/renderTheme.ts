/**
 * 卡片外观（HTML 骨架 + 主题 CSS）
 *
 * 结构与业务数据无关，三张卡片（创建 / 列表 / 开奖结果）共用同一套 DOM，
 * 只通过 `data-theme` 切换主题，因此新增风格只要再写一份主题 CSS 即可。
 */

export type RenderStyle = 'default' | 'anime'

/** 可选风格（供 Schema 与控制台展示） */
export const RENDER_STYLES: RenderStyle[] = ['default', 'anime']

export interface ShellOptions {
  eyebrow: string
  title: string
  meta?: string[]
  body: string
  /** 页脚左侧：插件品牌（走 i18n） */
  brand: string
  /** 页脚右侧：可选补充信息 */
  footRight?: string
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** HTML 转义：抽奖标题 / 昵称都是用户输入，直接拼进模板会破坏排版 */
export function esc(input: unknown): string {
  return String(input ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char])
}

/** 结构样式：只描述布局与层级，颜色/圆角等由主题变量决定 */
const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  body { margin: 0; padding: 22px; display: flex; justify-content: center; color: var(--ink);
    font-family: var(--sans); font-size: 15px; line-height: 1.5; background-color: var(--bg);
    background-image: var(--bg-image); }
  .card { position: relative; width: 760px; overflow: hidden; background: var(--card);
    border: 1px solid var(--card-border); border-radius: var(--radius); box-shadow: var(--card-shadow); }
  .head { position: relative; padding: 24px 30px 20px; color: #fff; overflow: hidden; background: var(--head-bg); }
  .head::after { content: ""; position: absolute; width: 220px; height: 220px; right: -70px; top: -110px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,.28) 0%, rgba(255,255,255,0) 70%); }
  .head > * { position: relative; }
  .head .eyebrow { font-size: 11px; letter-spacing: 2.6px; text-transform: uppercase; opacity: .85; }
  .head .title { margin-top: 10px; font-size: 26px; font-weight: 700; letter-spacing: .3px; }
  .head .meta { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
  .head .meta span { padding: 4px 11px; border-radius: 999px; font-size: 12.5px; background: var(--meta-bg); }
  .body { padding: 6px 30px 4px; }
  .row { display: flex; align-items: center; gap: 14px; padding: 15px 0; border-bottom: 1px solid var(--line); }
  .row:last-child { border-bottom: 0; }
  .chip { flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 999px;
    font-size: 12px; font-weight: 600; }
  .chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .85; }
  .chip.open { color: var(--ok); background: var(--ok-bg); }
  .chip.ended { color: var(--muted-ink); background: var(--muted-bg); }
  .code { flex: none; font-family: var(--mono); font-size: 14px; color: var(--ink-2); letter-spacing: .5px; }
  .name { flex: 1; font-size: 16.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .time { flex: none; font-size: 12.5px; color: var(--ink-3); }
  .kv { display: flex; gap: 16px; padding: 13px 0; border-bottom: 1px solid var(--line); }
  .kv .k { flex: none; width: 92px; color: var(--ink-3); font-size: 13.5px; letter-spacing: .3px; }
  .kv .v { flex: 1; word-break: break-word; }
  .key { display: inline-block; padding: 3px 10px; border-radius: 8px; font-family: var(--mono); font-size: 15px;
    color: var(--key-ink); background: var(--key-bg); border: 1px dashed var(--key-border); }
  .section { padding: 16px 0 2px; }
  .section .sec-title { display: flex; align-items: center; gap: 8px; font-size: 12.5px; letter-spacing: .6px;
    color: var(--ink-3); margin-bottom: 12px; }
  .section .sec-title::before { content: ""; width: 3px; height: 12px; border-radius: 2px; background: var(--accent-bar); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .prize { padding: 6px 13px; border-radius: var(--chip-radius); font-size: 14px; color: var(--chip-ink); background: var(--chip-bg); }
  .cond { color: var(--chip-ink); }
  .winner { display: flex; align-items: center; gap: 14px; padding: 15px 0; border-bottom: 1px solid var(--line); }
  .winner:last-child { border-bottom: 0; }
  .rank { flex: none; width: 30px; text-align: center; font-size: 19px; line-height: 1; font-weight: 600; color: var(--ink-3); }
  .avatar { position: relative; flex: none; width: 44px; height: 44px; border-radius: 50%; overflow: hidden;
    display: flex; align-items: center; justify-content: center; color: var(--avatar-ink); font-size: 17px; font-weight: 700;
    background: var(--avatar-bg); box-shadow: var(--avatar-ring); }
  .avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .who { flex: 1; min-width: 0; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who .nick { font-size: 16.5px; font-weight: 600; }
  .who .qq { margin-left: 8px; font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
  .prizes { flex: none; max-width: 300px; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
  .empty { padding: 30px 0 34px; text-align: center; color: var(--ink-3); }
  .foot { display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 14px 30px 18px; font-size: 11.5px; color: var(--foot-ink); letter-spacing: .3px; }
`

/** 默认风格：Koishi 品牌蓝紫渐变 + 简洁卡片 */
const DEFAULT_THEME_CSS = `
  :root {
    --brand: #4c7df0; --brand-2: #8a63f4;
    --ink: #1d2430; --ink-2: #5b6472; --ink-3: #9aa3b2;
    --line: #e9ecf1; --bg: #edf0f5; --card: #fff; --card-border: rgba(24, 39, 75, .06);
    --ok: #15803d; --ok-bg: #e7f7ed; --muted-ink: #6b7280; --muted-bg: #f0f1f4;
    --chip-bg: #eef3ff; --chip-ink: #3b4a66; --chip-radius: 11px;
    --key-bg: #f3efff; --key-ink: #7c3aed; --key-border: #d9cbff;
    --avatar-bg: linear-gradient(135deg, #e8efff, #f1e9ff); --avatar-ink: #4c7df0;
    --avatar-ring: 0 0 0 2px #fff, 0 0 0 3.5px rgba(76, 125, 240, .22);
    --accent-bar: linear-gradient(#4c7df0, #8a63f4);
    --head-bg: linear-gradient(135deg, #4c7df0, #8a63f4);
    --meta-bg: rgba(255, 255, 255, .18); --foot-ink: #b8c0cd;
    --radius: 20px;
    --card-shadow: 0 1px 0 rgba(255,255,255,.8) inset, 0 2px 6px rgba(24,39,75,.05), 0 22px 48px -28px rgba(24,39,75,.5);
    --bg-image: radial-gradient(110% 80% at 10% 0%, #ffffff 0%, rgba(237,240,245,0) 62%),
                radial-gradient(90% 70% at 100% 100%, rgba(138, 99, 244, .12) 0%, rgba(237,240,245,0) 58%);
    --sans: "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
`

/** 二次元风格：樱花粉 / 薰衣草紫 / 天空蓝，圆润描边 + 星光点缀 */
const ANIME_THEME_CSS = `
  :root {
    --brand: #ff8fb8; --brand-2: #b39dff;
    --ink: #3b2b3f; --ink-2: #7c6a84; --ink-3: #b3a1bb;
    --line: #ffe4f0; --bg: #fff3f9; --card: #fff; --card-border: #ffd9ea;
    --ok: #d94f8c; --ok-bg: #ffe1ef; --muted-ink: #a396ad; --muted-bg: #f7eefb;
    --chip-bg: #fff0f7; --chip-ink: #a63f70; --chip-radius: 999px;
    --key-bg: #fff2f8; --key-ink: #d1479a; --key-border: #ffb8d8;
    --avatar-bg: linear-gradient(135deg, #ffe3f1, #e8e0ff); --avatar-ink: #e0568f;
    --avatar-ring: 0 0 0 3px #fff, 0 0 0 6px rgba(255, 143, 184, .45);
    --accent-bar: linear-gradient(#ff8fb8, #b39dff);
    --head-bg: linear-gradient(135deg, #ff9ec7 0%, #c79cff 55%, #8fd8ff 100%);
    --meta-bg: rgba(255, 255, 255, .3); --foot-ink: #d7b9cd;
    --radius: 26px;
    --card-shadow: 0 0 0 6px rgba(255, 255, 255, .75) inset, 0 3px 0 #ffe6f2,
                   0 24px 44px -26px rgba(214, 106, 168, .55);
    --bg-image: radial-gradient(60% 50% at 12% 6%, #ffe6f4 0%, rgba(255, 243, 249, 0) 60%),
                radial-gradient(50% 45% at 92% 92%, #e9e2ff 0%, rgba(255, 243, 249, 0) 62%),
                radial-gradient(circle at 88% 10%, rgba(255, 214, 235, .9) 0 6px, rgba(255, 243, 249, 0) 7px),
                radial-gradient(circle at 78% 18%, rgba(214, 226, 255, .9) 0 4px, rgba(255, 243, 249, 0) 5px);
    --sans: "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  body { padding: 24px; }
  /* 顶栏：斜纹波点 + 描边字，像贴纸标题 */
  .head { border-radius: 0 0 22px 22px; padding-bottom: 22px; }
  .head::before { content: ""; position: absolute; inset: 0; opacity: .35;
    background-image: radial-gradient(rgba(255,255,255,.65) 1.4px, rgba(255,255,255,0) 1.6px);
    background-size: 16px 16px; }
  .head .eyebrow { opacity: .95; text-shadow: 0 1px 0 rgba(196, 90, 150, .35); }
  .head .title { font-weight: 800; text-shadow: 0 2px 0 rgba(196, 90, 150, .28); }
  .head .meta span { box-shadow: 0 1px 0 rgba(196, 90, 150, .22); }
  /* 顶栏右上角星光 + 页脚旁的花瓣（都落在留白处，不压正文） */
  .card::before, .card::after { position: absolute; pointer-events: none; line-height: 1; }
  .card::before { content: "✨"; top: 20px; right: 22px; font-size: 20px; opacity: .95; }
  .card::after { content: "🌸"; bottom: 12px; right: 20px; font-size: 15px; opacity: .8; }
  /* 行与胶囊更圆润 */
  .row { padding: 16px 0; }
  .row:nth-child(odd) .name { color: #4a3550; }
  .chip { box-shadow: 0 1px 0 rgba(214, 106, 168, .18); }
  .chip.open::before { content: "💗"; width: auto; height: auto; background: none; font-size: 11px; }
  .chip.ended::before { content: "🤍"; width: auto; height: auto; background: none; font-size: 11px; }
  .code { color: #b8678f; }
  .prize::before { content: "🎁 "; }
  .prize { border: 1px solid #ffe0ee; }
  .key { background-image: linear-gradient(135deg, #fff2f8, #f6efff); }
  .winner:nth-child(odd) { background: linear-gradient(90deg, rgba(255, 240, 247, .9), rgba(255, 255, 255, 0)); }
  .winner { border-radius: 14px; }
  .rank { font-size: 21px; }
  .empty { color: #c491b0; }
  .foot { color: #d7b9cd; }
`

const THEMES: Record<RenderStyle, string> = {
  default: DEFAULT_THEME_CSS,
  anime: ANIME_THEME_CSS,
}

/** 拼出完整 HTML：骨骼 + 主题 + 数据 */
export function shellHtml(options: ShellOptions, style: RenderStyle = 'default'): string {
  const theme = THEMES[style] ?? THEMES.default
  const meta = (options.meta ?? []).filter(Boolean)
  return `<!DOCTYPE html>
<html data-theme="${esc(style)}"><head><meta charset="utf-8"><style>
${BASE_CSS}${theme}</style></head>
<body><div class="card">
  <div class="head">
    <div class="eyebrow">${esc(options.eyebrow)}</div>
    <div class="title">${esc(options.title)}</div>
    ${meta.length ? `<div class="meta">${meta.map((item) => `<span>${esc(item)}</span>`).join('')}</div>` : ''}
  </div>
  <div class="body">${options.body}</div>
  <div class="foot"><span>${esc(options.brand)}</span><span>${esc(options.footRight ?? '')}</span></div>
</div></body></html>`
}
