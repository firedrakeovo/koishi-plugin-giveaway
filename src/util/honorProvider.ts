import { Context } from 'koishi'
import { logger } from '../index'
import { OneBotHonorInfo, OneBotHonorMember } from './joinPolicy'

/**
 * 用 QQ 新版网页接口获取群荣誉。
 *
 * 为什么需要它：NapCat 的 `get_group_honor_info` 依赖 `qun.qq.com/interactive/honorlist`
 * 页面里的 `window.__INITIAL_STATE__`，而该页已改版为 Vite SPA（变量不再存在），
 * 于是 NapCat 会静默返回空列表（v4.18.19 仍未修复）。新版 SPA 实际调用的是：
 *
 * | 接口 | 参数 | 数据 | 语义 |
 * |---|---|---|---|
 * | `/cgi-bin/qunapp/honor_talkative` | `gc num` | `data.talkative_list` / `data.current_talkative` | 龙王（昨日活跃榜） |
 * | `/cgi-bin/qunapp/honor_continuous` | `gc num continuous_type` | `data.continuous_list` | 连续发言榜，`continuous_type`: 2=群聊之火 3=群聊炽焰 |
 * | `/cgi-bin/qunapp/honor_emotion` | `gc num` | 连续发表情包榜 | 快乐源泉 |
 *
 * 响应信封为 `{ retcode, cgicode, msg, data }`（`retcode === 0` 为成功；未带 Cookie 时
 * 返回 `login error`）。**新接口比老路径多带 `day_count`**（连续天数），因此可以实现
 * "连续 ≥ N 天"这种精确门槛，而不是只能看榜单归属。
 *
 * Cookie 通过 OneBot 的 `get_cookies` 动作向 NapCat 索取（`session.onebot.getCookies('qun.qq.com')`）。
 */

const QUN_HOST = 'https://qun.qq.com'
const HONOR_PAGE = `${QUN_HOST}/interactive/honorlist`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** 解析 Cookie 字符串 */
export function parseCookies(cookie: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of String(cookie ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    out[part.slice(0, index).trim()] = part.slice(index + 1).trim()
  }
  return out
}

/**
 * QQ 的 CSRF 令牌（`bkn` / `g_tk`）：对 skey 做 djb2 变体哈希再取低 31 位。
 * 与 NapCat 的 `getBknFromSKey` 实现完全一致（`napcat.mjs`）。
 */
export function calcBkn(skey: string): string {
  if (!skey) return ''
  let hash = 5381
  for (let i = 0; i < skey.length; i++) {
    hash = hash + (hash << 5) + skey.charCodeAt(i)
  }
  return String(hash & 2147483647)
}

/**
 * 鉴权变体：新版 `/cgi-bin/qunapp/*` 接口只带 Cookie 会返回
 * `retcode 100021 csrf error`，需要补上从 skey 算出来的 `bkn`。
 * 这里按顺序试，命中即记住，避免每次请求都试一遍。
 */
interface AuthVariant {
  name: string
  params?: (cookie: Record<string, string>) => Record<string, string>
  headers?: Record<string, string>
}

export const AUTH_VARIANTS: AuthVariant[] = [
  { name: 'cookie-only', params: () => ({}) },
  { name: 'bkn(skey)', params: (c) => ({ bkn: calcBkn(c.skey) }) },
  { name: 'bkn(p_skey)', params: (c) => ({ bkn: calcBkn(c.p_skey) }) },
  { name: 'bkn+g_tk(skey)', params: (c) => ({ bkn: calcBkn(c.skey), g_tk: calcBkn(c.skey) }) },
  {
    name: 'bkn(skey)+origin',
    params: (c) => ({ bkn: calcBkn(c.skey) }),
    headers: { Origin: QUN_HOST, 'X-Requested-With': 'XMLHttpRequest' },
  },
]

let cachedVariant: string | null = null
/** 测试用：清掉已选中的鉴权变体 */
export function resetAuthVariant() {
  cachedVariant = null
}

async function requestOnce(ctx: Context, url: string, cookie: string, variant: AuthVariant): Promise<any> {
  const parsed = parseCookies(cookie)
  const extra = variant.params?.(parsed) ?? {}
  const target = new URL(url)
  for (const [key, value] of Object.entries(extra)) {
    if (value) target.searchParams.set(key, value)
  }
  const headers: Record<string, string> = { 'User-Agent': UA, Referer: HONOR_PAGE, ...(variant.headers ?? {}) }
  if (cookie) headers.Cookie = cookie
  const http = (ctx as any).http
  if (http && typeof http.get === 'function') {
    return await http.get(target.toString(), { headers })
  }
  const res = await fetch(target.toString(), { headers })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { retcode: -1, msg: `非 JSON 响应（HTTP ${res.status}）：${text.slice(0, 120)}` }
  }
}

/** 按鉴权变体依次尝试，返回第一个 retcode=0 的结果（都失败则返回最后一次结果） */
async function requestWithAuth(ctx: Context, url: string, cookie: string): Promise<{ body: any; variant: string }> {
  const order = cachedVariant
    ? [...AUTH_VARIANTS].sort((a, b) => (a.name === cachedVariant ? -1 : b.name === cachedVariant ? 1 : 0))
    : AUTH_VARIANTS
  let last: { body: any; variant: string } = { body: undefined, variant: order[0].name }
  for (const variant of order) {
    const body = await requestOnce(ctx, url, cookie, variant)
    last = { body, variant: variant.name }
    if (body?.retcode === 0) {
      if (cachedVariant !== variant.name) {
        cachedVariant = variant.name
        logger.info(`荣誉接口鉴权方式已确定为：${variant.name}`)
      }
      return last
    }
    if (variant !== order[order.length - 1]) {
      logger.info(`荣誉接口鉴权变体 ${variant.name} 失败（retcode=${body?.retcode} ${body?.msg ?? ''}），继续尝试下一种`)
    }
  }
  return last
}

/** OneBot 荣誉类型 → 新版接口参数 */
const ENDPOINTS: Record<string, { path: string; params: Record<string, string | number>; list: string }> = {
  talkative: { path: '/cgi-bin/qunapp/honor_talkative', params: { num: 3000 }, list: 'talkative_list' },
  // 群聊之火：连续发言（continuous_type = 2）
  performer: { path: '/cgi-bin/qunapp/honor_continuous', params: { num: 3000, continuous_type: 2 }, list: 'performer_list' },
  // 群聊炽焰：连续发言 30 天（continuous_type = 3）
  legend: { path: '/cgi-bin/qunapp/honor_continuous', params: { num: 3000, continuous_type: 3 }, list: 'legend_list' },
  emotion: { path: '/cgi-bin/qunapp/honor_emotion', params: { num: 3000 }, list: 'emotion_list' },
}

export interface HonorProbe {
  ok: boolean
  error?: string
  /** 归一化成 OneBot `get_group_honor_info` 的结构，可直接喂给参与条件判定 */
  info?: OneBotHonorInfo
  /** 每个接口的原始响应（诊断用，已裁剪） */
  raw?: Record<string, any>
}

function toMember(item: any): OneBotHonorMember {
  return {
    user_id: Number(item?.uin ?? item?.user_id ?? 0),
    nickname: item?.nick ?? item?.name ?? item?.nickname,
    avatar: item?.avatar,
    description: item?.desc ?? item?.description,
    day_count: typeof item?.day_count === 'number' ? item.day_count : undefined,
  }
}

/** 从各类响应里尽力挖出成员数组（新版不同接口字段名不一致） */
function pickList(data: any): any[] {
  if (!data) return []
  for (const key of ['continuous_list', 'talkative_list', 'list', 'members', 'uin_list']) {
    if (Array.isArray(data[key])) return data[key]
  }
  if (Array.isArray(data)) return data
  return []
}

/**
 * 通过 QQ 网页接口获取群荣誉。
 * @param types 需要的类型（talkative / performer / legend / emotion），只请求用到的
 */
export async function fetchHonorViaWeb(ctx: Context, session: any, groupId: number, types: string[]): Promise<HonorProbe> {
  const onebot = session?.onebot
  if (!onebot || typeof onebot.getCookies !== 'function') {
    return { ok: false, error: '当前适配器不支持 get_cookies' }
  }
  let cookie = ''
  try {
    const raw: any = await onebot.getCookies('qun.qq.com')
    // 适配器返回的可能是 cookie 字符串，也可能是 { cookies, csrf_token }
    cookie = typeof raw === 'string' ? raw : (raw?.cookies ?? '')
  } catch (error: any) {
    return { ok: false, error: `获取 qun.qq.com Cookie 失败：${error?.message ?? error}` }
  }
  if (!cookie) {
    return { ok: false, error: 'qun.qq.com Cookie 为空（QQ 可能未登录或登录态失效）' }
  }

  const info: OneBotHonorInfo = {}
  const raw: Record<string, any> = {}
  const errors: string[] = []

  for (const type of types) {
    const endpoint = ENDPOINTS[type]
    if (!endpoint) continue
    const query = new URLSearchParams({ gc: String(groupId), ...Object.fromEntries(Object.entries(endpoint.params).map(([k, v]) => [k, String(v)])) })
    const url = `${QUN_HOST}${endpoint.path}?${query.toString()}`
    try {
      const { body, variant } = await requestWithAuth(ctx, url, cookie)
      const retcode = body?.retcode
      const list = pickList(body?.data)
      raw[type] = { url: endpoint.path, variant, retcode, msg: body?.msg, count: list.length, sample: list.slice(0, 3) }
      if (retcode !== 0) {
        errors.push(`${type}: retcode=${retcode} ${body?.msg ?? ''}`)
        continue
      }
      ;(info as any)[endpoint.list] = list.map(toMember)
      if (type === 'talkative' && body?.data?.current_talkative) {
        ;(info as any).current_talkative = toMember(body.data.current_talkative)
      }
    } catch (error: any) {
      raw[type] = { url: endpoint.path, error: String(error?.message ?? error) }
      errors.push(`${type}: ${error?.message ?? error}`)
    }
  }

  const total = Object.values(info).reduce((sum: number, value: any) => sum + (Array.isArray(value) ? value.length : 0), 0)
  logger.info(`群 ${groupId} 网页荣誉接口：请求 ${types.join('/')}，拿到 ${total} 条${errors.length ? `，失败：${errors.join('; ')}` : ''}`)
  if (total === 0 && errors.length) return { ok: false, error: errors.join('; '), raw }
  return { ok: total > 0, error: errors.length ? errors.join('; ') : undefined, info, raw }
}
