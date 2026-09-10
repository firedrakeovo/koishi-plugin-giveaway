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

async function httpGetJson(ctx: Context, url: string, cookie: string): Promise<any> {
  const headers: Record<string, string> = { 'User-Agent': UA, Referer: HONOR_PAGE }
  if (cookie) headers.Cookie = cookie
  const http = (ctx as any).http
  if (http && typeof http.get === 'function') {
    return await http.get(url, { headers })
  }
  const res = await fetch(url, { headers })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { retcode: -1, msg: `非 JSON 响应（HTTP ${res.status}）：${text.slice(0, 120)}` }
  }
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
      const body = await httpGetJson(ctx, url, cookie)
      const retcode = body?.retcode
      const list = pickList(body?.data)
      raw[type] = { url: endpoint.path, retcode, msg: body?.msg, count: list.length, sample: list.slice(0, 3) }
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
