import { Context, Session, $, h } from 'koishi'
import { DateTime } from 'luxon'
import { bots, logger } from '../index'

/**
 * 图片渲染（可选依赖 puppeteer）
 *
 * 通过 `koishi-plugin-puppeteer` 提供的 `ctx.puppeteer.render(html)` 把抽奖列表 / 开奖结果
 * 渲染成图片。该服务是可选的：
 *
 * - 没装、没启用，或 `render()` 抛错 → 一律返回 `null`，调用方回退到原来的文字消息；
 * - 渲染失败会打一条 warn 日志，不会影响开奖 / 列表本身的逻辑。
 */

/** puppeteer 服务（可选依赖，缺失时整个图片渲染链路自动关闭） */
interface PuppeteerLike {
  render(content: string, callback?: (page: any, next: (handle?: any) => Promise<string>) => Promise<string>): Promise<string>
}

function puppeteerOf(ctx: Context): PuppeteerLike | undefined {
  const service = (ctx as any).puppeteer
  return service && typeof service.render === 'function' ? service as PuppeteerLike : undefined
}

/** puppeteer 是否可用（装了但还没启动时也算不可用） */
export function hasPuppeteer(ctx: Context): boolean {
  return !!puppeteerOf(ctx)
}

/** 渲染 HTML → 图片元素；失败返回 null（调用方回退文字） */
export async function renderImage(ctx: Context, html: string): Promise<string | null> {
  const puppeteer = puppeteerOf(ctx)
  if (!puppeteer) return null
  try {
    const output = await puppeteer.render(html)
    return typeof output === 'string' && output ? output : null
  } catch (error) {
    logger.warn(`图片渲染失败，已回退为文字消息：${(error as Error)?.message ?? error}`)
    return null
  }
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** HTML 转义：抽奖标题 / 昵称都是用户输入，直接拼进模板会破坏排版 */
function esc(input: unknown): string {
  return String(input ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char])
}

type Translate = (path: string, params?: Record<string, any>) => string

/** 统一的文案取值：三语都走 i18n，图片里的标签也随语言变化 */
function translator(ctx: Context, locales: string[]): Translate {
  return (path, params) => ctx.i18n.render(locales, [`messageBuilder.render.${path}`], params ?? {}).join('')
}

function localeList(session: Session, ctx: Context): string[] {
  // session.channel 在本插件的 Tables 里没有声明 locales，这里按实际结构取
  const s = session as any
  const own = s?.locales?.length ? [...s.locales] : []
  const channel = s?.channel?.locales?.length ? [...s.channel.locales] : []
  const locales = [...own, ...channel]
  return locales.length ? locales : [...ctx.root.options.i18n.locales]
}

/** 频道语言偏好（开奖广播没有 session，只能按频道表取） */
export async function channelLocaleList(ctx: Context, channelId: string, platform: string): Promise<string[]> {
  const row: any = (await ctx.database.get('channel', { id: channelId, platform }))[0]
  const locales = row?.locales?.length ? [...row.locales] : [...ctx.root.options.i18n.locales]
  return locales
}

function shell(t: Translate, title: string, summary: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
    background: #eef1f6; padding: 20px;
  }
  .card { width: 780px; background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 8px 28px rgba(24, 39, 75, .10); }
  .head { padding: 22px 30px; color: #fff; background: linear-gradient(135deg, #4c7df0, #8a63f4); }
  .head .title { font-size: 26px; font-weight: 700; letter-spacing: .5px; }
  .head .summary { margin-top: 8px; font-size: 14px; opacity: .92; }
  .body { padding: 6px 30px 14px; }
  .row { display: flex; align-items: center; gap: 14px; padding: 16px 0; border-bottom: 1px solid #f0f2f5; }
  .row:last-child { border-bottom: none; }
  .chip { flex: none; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .chip.open { color: #1a7f45; background: #e6f6ec; }
  .chip.ended { color: #6b7280; background: #f0f1f4; }
  .code { flex: none; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 15px; color: #5b6472; }
  .name { flex: 1; font-size: 17px; color: #1f2530; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .time { flex: none; font-size: 13px; color: #98a1b0; }
  .winner { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid #f0f2f5; }
  .winner:last-child { border-bottom: none; }
  .who { flex: none; width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who .nick { font-size: 17px; font-weight: 600; color: #1f2530; }
  .who .qq { margin-left: 8px; font-size: 12px; color: #98a1b0; }
  .prizes { flex: 1; display: flex; flex-wrap: wrap; gap: 8px; }
  .prize { padding: 5px 12px; border-radius: 10px; font-size: 14px; color: #3c4a63; background: #eef3ff; }
  .empty { padding: 26px 0 30px; text-align: center; color: #98a1b0; font-size: 15px; }
  .foot { padding: 0 30px 20px; text-align: right; font-size: 12px; color: #b6bdc9; }
</style></head>
<body><div class="card">
  <div class="head"><div class="title">${esc(title)}</div><div class="summary">${esc(summary)}</div></div>
  <div class="body">${body}</div>
  <div class="foot">${esc(t('footer'))}</div>
</div></body></html>`
}

export interface RollListItem {
  roll_code: string
  title: string
  isEnd: boolean
  endTime?: Date | null
  isAutoEnd?: boolean | number
}

/** 取某频道下的抽奖（列表 / 图片渲染共用）；返回 null 表示该频道没有任何抽奖 */
export async function collectRollList(ctx: Context, cid: string, platform: string): Promise<{ open: RollListItem[]; ended: RollListItem[] } | null> {
  const rows = await ctx.database.get('roll_channel', { channel_id: cid, channel_platform: platform }, ['roll_id'])
  if (!rows.length) return null
  const open: RollListItem[] = []
  const ended: RollListItem[] = []
  for (const row of rows) {
    const res = await ctx.database.get('roll', { id: row.roll_id }, ['roll_code', 'isEnd', 'title', 'endTime', 'isAutoEnd'])
    if (res.length !== 1) continue
    const roll = res[0]
    const item: RollListItem = {
      roll_code: roll.roll_code,
      title: roll.title,
      isEnd: !!roll.isEnd,
      endTime: roll.endTime,
      isAutoEnd: roll.isAutoEnd,
    }
    ;(item.isEnd ? ended : open).push(item)
  }
  return { open, ended }
}

/** 抽奖列表图片（失败或没有数据时返回 null，由调用方回退文字） */
export async function rollListImage(ctx: Context, session: Session, data: { open: RollListItem[]; ended: RollListItem[] }, offset: string): Promise<string | null> {
  const t = translator(ctx, localeList(session, ctx))
  const rows: string[] = []
  const push = (item: RollListItem) => {
    const deadline = item.isAutoEnd && item.endTime
      ? t('list.deadline', { 0: DateTime.fromJSDate(new Date(item.endTime), { zone: 'UTC' }).setZone(offset).toFormat('MM-dd HH:mm') })
      : t('list.noDeadline')
    rows.push(`<div class="row">
      <span class="chip ${item.isEnd ? 'ended' : 'open'}">${esc(item.isEnd ? t('list.marks.ended') : t('list.marks.open'))}</span>
      <span class="code">#${esc(item.roll_code)}</span>
      <span class="name">${esc(item.title)}</span>
      <span class="time">${esc(deadline)}</span>
    </div>`)
  }
  data.open.forEach(push)
  data.ended.forEach(push)
  const body = rows.length
    ? rows.join('\n')
    : `<div class="empty">${esc(t('list.empty'))}</div>`
  const html = shell(t, t('list.title'), t('list.summary', { 0: data.open.length, 1: data.ended.length }), body)
  return renderImage(ctx, html)
}

export interface WinnerGroup {
  name: string
  pid: string
  prizes: Array<{ name: string; amount: number }>
}

/** 中奖名单（按中奖人聚合奖品） */
export async function collectWinners(ctx: Context, roll: any): Promise<WinnerGroup[]> {
  const members = await ctx.database.get('roll_member', { roll_id: roll.id }, ['user_id'])
  if (!members.length) return []
  const joined = await ctx.database.join(['roll_prize', 'user_prize'], (rollPrize, userPrize) => $.eq(rollPrize.prize_id, userPrize.prize_id)).execute()
  const winners: WinnerGroup[] = []
  for (const member of members) {
    const prizes: Array<{ name: string; amount: number }> = []
    for (const row of joined) {
      if (row.roll_prize?.roll_id !== roll.id || row.user_prize?.user_id !== member.user_id) continue
      const prize = (await ctx.database.get('prize', { id: row.roll_prize.prize_id }))[0]
      prizes.push({ name: prize?.name ?? '?', amount: row.user_prize.amount })
    }
    if (!prizes.length) continue
    const binding = (await ctx.database.get('binding', { aid: member.user_id }))[0]
    let name = ''
    if (binding) {
      // bots 由 index.ts 在 ready 时写入；取不到昵称就退化成只显示号码
      for (const bot of bots ?? []) {
        if (bot.platform !== binding.platform) continue
        const user = await bot.getUser(binding.pid)
        name = user?.name ?? ''
      }
    }
    winners.push({ name, pid: binding?.pid ?? String(member.user_id), prizes })
  }
  return winners
}

/**
 * 开奖结果消息：`文字（含真实 @ 中奖者）+ 结果图片`
 *
 * @ 必须留在文字里 —— 图片虽然好看，但无法提醒到人。渲染失败时返回 null，
 * 调用方回退成原来的完整文字消息。
 */
export async function rollEndImage(ctx: Context, roll: any, locales: string[]): Promise<h[] | null> {
  const winners = await collectWinners(ctx, roll)
  const t = translator(ctx, locales)
  const rows = winners.map((winner) => `<div class="winner">
      <div class="who"><span class="nick">${esc(winner.name || winner.pid)}</span><span class="qq">${esc(winner.pid)}</span></div>
      <div class="prizes">${winner.prizes.map((prize) => `<span class="prize">${esc(t('result.prize', { 0: prize.name, 1: prize.amount }))}</span>`).join('')}</div>
    </div>`).join('\n')
  const body = winners.length ? rows : `<div class="empty">${esc(t('result.noWinner'))}</div>`
  const html = shell(t, t('result.title'), t('result.summary', { 0: roll.roll_code, 1: winners.length }), body)
  const image = await renderImage(ctx, html)
  if (!image) return null

  const header = ctx.i18n.render(locales, ['messageBuilder.roll.end.header'], [roll.roll_code])
  const mentions = winners.length ? [h.text('\n'), ...winners.map((winner) => h.at(winner.pid))] : []
  return [...header, ...mentions, h.text('\n'), ...h.parse(image)]
}
