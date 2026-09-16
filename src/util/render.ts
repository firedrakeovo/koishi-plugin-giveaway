import { Context, Session, $, h } from 'koishi'
import { DateTime } from 'luxon'
import { bots, logger } from '../index'
import { pathToFileURL } from 'node:url'
import { normalizeStyle, RenderStyle, esc, shellHtml } from './renderTheme'

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

/**
 * 每张卡片的渲染选项（风格 + 可选头图 + 卡片宽度）
 *
 * `width` 是**卡片宽度（CSS px）**：puppeteer 截的是 body 包围盒，卡片多宽图片就多宽。
 * 群里图片会按聊天窗口宽度缩放，所以卡片越窄、字体显示得越大（默认 420）。
 */
export interface RenderOptions {
  style?: RenderStyle
  /** 头图：支持 http(s) / data: / file: URL，或本机绝对路径（自动转 file://） */
  banner?: string
  /** 卡片宽度（320~900，默认 420） */
  width?: number
  /** 参与名单最多显示几人（默认 12） */
  memberLimit?: number
}

/** 头图地址规范化：本机绝对路径转成 file:// URL，其余原样交给浏览器 */
export function bannerUrl(value?: string): string | undefined {
  const raw = String(value ?? '').trim()
  if (!raw) return undefined
  if (/^(https?:|data:|file:)/i.test(raw)) return raw
  if (raw.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(raw)) return pathToFileURL(raw).href
  return raw
}

function shellOptions(base: any, options: RenderOptions) {
  return { ...base, banner: bannerUrl(options?.banner), cardWidth: options?.width }
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
export async function rollListImage(ctx: Context, session: Session, data: { open: RollListItem[]; ended: RollListItem[] }, offset: string, cid?: string, options: RenderOptions = {}): Promise<string | null> {
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
  const html = shellHtml(shellOptions({
    eyebrow: t('eyebrow'),
    title: t('list.title'),
    meta: [t('list.summary', { 0: data.open.length, 1: data.ended.length }), cid ? t('list.channel', { 0: cid }) : ''],
    body,
    brand: t('footer'),
  }, options), options?.style)
  return renderImage(ctx, html)
}

export interface WinnerGroup {
  name: string
  pid: string
  avatar?: string
  prizes: Array<{ name: string; amount: number }>
}

/** 参与人信息的最小接口（真实 bot / 测试桩都满足） */
export interface BotLike {
  platform?: string
  getUser?: (id: string) => Promise<{ name?: string; avatar?: string } | null | undefined>
}

/**
 * QQ 头像地址
 *
 * OneBot 适配器的 `getUser()` 一般不带 `avatar`，这里按 QQ 号兜底拼 qlogo 地址
 * （非数字 id 或其他平台返回 undefined，图片里就不显示头像）。
 */
export function defaultAvatarUrl(platform: string | undefined, pid: string): string | undefined {
  if (!/^\d{4,}$/.test(String(pid ?? ''))) return undefined
  if (platform === 'onebot' || platform === 'qq') return `https://q1.qlogo.cn/g?b=qq&nk=${pid}&s=640`
  return undefined
}

/** 中奖名单（按中奖人聚合奖品；bot 用于取昵称与头像） */
export async function collectWinners(ctx: Context, roll: any, bot?: BotLike): Promise<WinnerGroup[]> {
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
    const pid = binding?.pid ?? String(member.user_id)
    let name = ''
    let avatar: string | undefined
    if (binding) {
      // 优先用传入的 bot（开奖广播里就是收发这条消息的 bot），没有就按平台匹配
      const target = bot ?? (bots ?? []).find((item) => item.platform === binding.platform)
      if (target?.getUser) {
        try {
          const user = await target.getUser(binding.pid)
          name = user?.name ?? ''
          avatar = user?.avatar ?? undefined
        } catch (error) {
          logger.warn(`取中奖者资料失败（${binding.pid}）：${(error as Error)?.message ?? error}`)
        }
      }
      avatar = avatar || defaultAvatarUrl(binding.platform, binding.pid)
    }
    winners.push({ name, pid, avatar, prizes })
  }
  return winners
}

/**
 * 开奖结果消息：`文字（含真实 @ 中奖者）+ 结果图片`
 *
 * @ 必须留在文字里 —— 图片虽然好看，但无法提醒到人。渲染失败时返回 null，
 * 调用方回退成原来的完整文字消息。
 */
export async function rollEndImage(
  ctx: Context,
  roll: any,
  locales: string[],
  bot?: BotLike,
  showAvatar = true,
  options: RenderOptions = {},
): Promise<h[] | null> {
  const winners = await collectWinners(ctx, roll, bot)
  const t = translator(ctx, locales)
  const body = winners.length
    ? winnerRows(t, winners, options?.style, showAvatar)
    : `<div class="empty">${esc(t('result.noWinner'))}</div>`
  const html = shellHtml(shellOptions({
    eyebrow: t('eyebrow'),
    title: t('result.title'),
    meta: [t('result.summary', { 0: roll.roll_code, 1: winners.length })],
    body,
    brand: t('footer'),
  }, options), options?.style)
  const image = await renderImage(ctx, html)
  if (!image) return null

  const header = ctx.i18n.render(locales, ['messageBuilder.roll.end.header'], [roll.roll_code])
  const mentions = winners.length ? [h.text('\n'), ...winners.map((winner) => h.at(winner.pid))] : []
  return [...header, ...mentions, h.text('\n'), ...h.parse(image)]
}

/** 参与者（参与名单用；与中奖者不同，这里不带奖品） */
export interface ParticipantGroup {
  userId: number
  /** 平台号（QQ 号） */
  pid: string
  name: string
  avatar?: string
}

/**
 * 取参与名单（按加入顺序），带昵称与头像。
 *
 * 头像 / 昵称来源与中奖名单一致：binding 找平台号 → 传入的 bot（或平台上第一个 bot）
 * 取用户资料 → 取不到昵称退化为 QQ 号、取不到头像按 QQ 号拼 qlogo。
 */
export async function collectParticipants(ctx: Context, roll: any, bot?: BotLike): Promise<ParticipantGroup[]> {
  const members = await ctx.database.get('roll_member', { roll_id: roll.id }, ['user_id'])
  const out: ParticipantGroup[] = []
  for (const member of members) {
    const binding = (await ctx.database.get('binding', { aid: member.user_id }))[0]
    const pid = binding?.pid ?? String(member.user_id)
    let name = ''
    let avatar: string | undefined
    if (binding) {
      const target = bot ?? (bots ?? []).find((item) => item.platform === binding.platform)
      if (target?.getUser) {
        try {
          const user = await target.getUser(binding.pid)
          name = user?.name ?? ''
          avatar = user?.avatar ?? undefined
        } catch (error) {
          logger.warn(`取参与用户资料失败（${binding.pid}）：${(error as Error)?.message ?? error}`)
        }
      }
      avatar = avatar || defaultAvatarUrl(binding.platform, binding.pid)
    }
    out.push({ userId: member.user_id, pid, name, avatar })
  }
  return out
}

/** 名单太长时只取前 N 个，并告诉调用方还剩多少人（图片再长也没法看） */
export function takeWithRemainder<T>(list: T[], limit: number): { items: T[]; rest: number } {
  if (limit <= 0 || list.length <= limit) return { items: list.slice(0, Math.max(0, limit)), rest: Math.max(0, list.length - Math.max(0, limit)) }
  return { items: list.slice(0, limit), rest: list.length - limit }
}

/** 参与名单默认最多显示几行（控制台 `render.memberLimit` 可改） */
export const DEFAULT_MEMBER_LIMIT = 12

/** 归一化「名单上限」：夹在 1~100，非法值回落到默认 */
export function memberLimitOf(value?: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MEMBER_LIMIT
  return Math.min(100, n)
}

/** 抽奖信息行（开奖时间 / 描述 / 加入口令）：创建卡片与详情卡片共用 */
function rollInfoRows(t: Translate, roll: any, offset: string): string {
  const rows: string[] = []
  const kv = (label: string, value: string) => {
    rows.push(`<div class="kv"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>`)
  }
  const deadline = roll.isAutoEnd && roll.endTime
    ? DateTime.fromJSDate(new Date(roll.endTime), { zone: 'UTC' }).setZone(offset).toFormat('yyyy-MM-dd HH:mm')
    : t('list.noDeadline')
  kv(t('create.deadline'), deadline)
  kv(t('create.description'), roll.description || '—')
  // 口令单独高亮（等宽 + 虚线圈），方便一眼看到
  rows.push(`<div class="kv"><span class="k">${esc(t('create.key'))}</span><span class="v">${roll.joinKey ? `<span class="key">${esc(roll.joinKey)}</span>` : esc(t('create.noKey'))}</span></div>`)
  return rows.join('\n')
}

/** 奖品胶囊区块 */
function prizeSection(t: Translate, prizes: Array<{ name: string; amount: string | number }>): string {
  const chips = prizes
    .map((prize) => `<span class="prize">${esc(t('result.prize', { 0: prize.name, 1: prize.amount }))}</span>`)
    .join('')
  return `<div class="section"><div class="sec-title">${esc(t('create.prizes'))}</div><div class="chips">${chips}</div></div>`
}

/** 参与条件区块 */
function conditionSection(t: Translate, conditions: string): string {
  return `<div class="section"><div class="sec-title">${esc(t('create.conditions'))}</div><div class="cond">${esc(conditions)}</div></div>`
}

/** 人员行（序号 + 头像 + 昵称 + QQ 号 [+ 右侧奖品]）：中奖名单与参与名单共用 */
function personRow(t: Translate, index: number, person: { pid: string; name?: string; avatar?: string; prizes?: Array<{ name: string; amount: number | string }> }, style: RenderStyle | undefined, showAvatar: boolean, medal: boolean): string {
  // 名次符号随风格变化：哥特 / Ave Mujica 用罗马数字，其余用奖牌
  const MEDALS = normalizeStyle(style) === 'avemujica' ? ['Ⅰ', 'Ⅱ', 'Ⅲ'] : ['🥇', '🥈', '🥉']
  const rank = medal ? (MEDALS[index] ?? index + 1) : index + 1
  const prizes = person.prizes?.length
    ? `<div class="prizes">${person.prizes.map((prize) => `<span class="prize">${esc(t('result.prize', { 0: prize.name, 1: prize.amount }))}</span>`).join('')}</div>`
    : ''
  return `<div class="winner">
      <div class="rank">${rank}</div>
      ${showAvatar && person.avatar
        ? `<div class="avatar"><span>${esc((person.name || person.pid).slice(0, 1))}</span><img src="${esc(person.avatar)}" onerror="this.remove()"/></div>`
        : ''}
      <div class="who"><span class="nick">${esc(person.name || person.pid)}</span><span class="qq">${esc(person.pid)}</span></div>
      ${prizes}
    </div>`
}

/** 参与名单区块（详情卡片 / 成员卡片共用） */
function participantSection(t: Translate, participants: ParticipantGroup[], style: RenderStyle | undefined, showAvatar: boolean, title: string, limit = DEFAULT_MEMBER_LIMIT): string {
  const { items, rest } = takeWithRemainder(participants, memberLimitOf(limit))
  const rows = items.length
    ? items.map((person, index) => personRow(t, index, person, style, showAvatar, false)).join('\n')
    : `<div class="empty">${esc(t('list.empty'))}</div>`
  const more = rest > 0 ? `<div class="more">${esc(t('detail.more', { 0: rest }))}</div>` : ''
  return `<div class="section"><div class="sec-title">${esc(title)}</div>${rows}${more}</div>`
}

/** 中奖者行（名次 + 头像 + 昵称 + 奖品）：开奖卡片与详情卡片共用 */
function winnerRows(t: Translate, winners: WinnerGroup[], style: RenderStyle | undefined, showAvatar: boolean): string {
  return winners.map((winner, index) => personRow(t, index, winner, style, showAvatar, true)).join('\n')
}

/**
 * 创建成功后的「抽奖内容」卡片
 *
 * 展示编号 / 标题 / 描述 / 开奖时间 / 加入口令 / 奖品 / 参与条件。
 * 渲染失败返回 null，调用方只发原来的文字提示（图片是锦上添花，不该影响创建结果）。
 */
export async function rollCreatedImage(
  ctx: Context,
  session: Session,
  roll: {
    roll_code: string
    title?: string
    description?: string
    joinKey?: string
    isAutoEnd?: boolean | number
    endTime?: Date | string | number | null
  },
  prizes: Array<{ name: string; amount: string | number }>,
  offset: string,
  conditions: string,
  options: RenderOptions = {},
): Promise<string | null> {
  const t = translator(ctx, localeList(session, ctx))
  const body = [
    rollInfoRows(t, roll, offset),
    prizeSection(t, prizes),
    conditionSection(t, conditions),
  ].join('\n')
  const html = shellHtml(shellOptions({
    eyebrow: t('eyebrow'),
    title: roll.title || t('create.title'),
    meta: [t('create.title'), t('create.summary', { 0: roll.roll_code })],
    body,
    brand: t('footer'),
  }, options), options?.style)
  return renderImage(ctx, html)
}

/**
 * 抽奖详情卡片（`抽奖详情 <编号>` 用图片重新调出创建时的卡片）
 *
 * 与创建成功卡片同一套排版，额外显示状态与参与人数；已开奖的抽奖附上中奖名单。
 * 渲染失败返回 null，调用方回退为原来的文字详情。
 */
export async function rollDetailImage(
  ctx: Context,
  session: Session,
  roll: {
    id: number
    roll_code: string
    title?: string
    description?: string
    joinKey?: string
    isAutoEnd?: boolean | number
    isEnd?: boolean | number
    endTime?: Date | string | number | null
  },
  prizes: Array<{ name: string; amount: string | number }>,
  offset: string,
  conditions: string,
  options: RenderOptions = {},
): Promise<string | null> {
  const t = translator(ctx, localeList(session, ctx))
  const ended = !!roll.isEnd
  const participants = await collectParticipants(ctx, roll, session.bot as any)
  const body: string[] = [
    rollInfoRows(t, roll, offset),
    prizeSection(t, prizes),
    conditionSection(t, conditions),
  ]
  if (ended) {
    const winners = await collectWinners(ctx, roll, session.bot as any)
    body.push(`<div class="section"><div class="sec-title">${esc(t('detail.winners'))}</div>${
      winners.length ? winnerRows(t, winners, options?.style, true) : `<div class="empty">${esc(t('result.noWinner'))}</div>`}</div>`)
  }
  // 参与名单（头像 + 昵称 + QQ 号）：进行中也能看到谁参加了
  body.push(participantSection(t, participants, options?.style, true, t('detail.participants'), options?.memberLimit))
  const html = shellHtml(shellOptions({
    eyebrow: t('eyebrow'),
    title: roll.title || t('detail.title'),
    meta: [
      ended ? t('list.marks.ended') : t('list.marks.open'),
      t('create.summary', { 0: roll.roll_code }),
      t('detail.members', { 0: participants.length }),
    ],
    body: body.join('\n'),
    brand: t('footer'),
  }, options), options?.style)
  return renderImage(ctx, html)
}

/**
 * 参与名单卡片（`抽奖成员 <编号>` 用图片）
 *
 * 头像 + 昵称 + QQ 号逐行列出；人数过多时只显示前 N 个（`render.memberLimit`）并提示剩余人数。
 */
export async function rollMemberImage(
  ctx: Context,
  session: Session,
  roll: { id: number; roll_code: string; title?: string; isEnd?: boolean | number },
  options: RenderOptions = {},
): Promise<string | null> {
  const t = translator(ctx, localeList(session, ctx))
  const participants = await collectParticipants(ctx, roll, session.bot as any)
  const body = participantSection(t, participants, options?.style, true, t('member.title'), options?.memberLimit)
  const html = shellHtml(shellOptions({
    eyebrow: t('eyebrow'),
    title: roll.title || t('member.title'),
    meta: [
      roll.isEnd ? t('list.marks.ended') : t('list.marks.open'),
      t('create.summary', { 0: roll.roll_code }),
      t('detail.members', { 0: participants.length }),
    ],
    body,
    brand: t('footer'),
  }, options), options?.style)
  return renderImage(ctx, html)
}
