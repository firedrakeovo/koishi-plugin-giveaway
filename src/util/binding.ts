import { Context } from 'koishi'

/**
 * 取当前会话用户在插件内部的 user id（`binding.aid`）。
 *
 * Koishi 在用户首次被 observe 时才写入 binding，紧接着发消息时可能还没落库，
 * 所以允许重试几次；仍然取不到就返回 `undefined`，由调用方给出提示（不要直接下标访问，否则会抛异常）。
 */
export async function resolveAid(
  ctx: Context,
  session: any,
  attempts = 3,
  intervalMs = 300,
): Promise<number | undefined> {
  const tries = Math.max(1, attempts)
  for (let i = 0; i < tries; i++) {
    const rows = await ctx.database.get('binding', { platform: session.platform, pid: session.userId })
    if (rows.length > 0 && rows[0].aid !== undefined && rows[0].aid !== null) return rows[0].aid
    if (i < tries - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return undefined
}
