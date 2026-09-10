import {} from 'koishi';
import { logger, Config } from '../index';

export * from '../config'

/** 群主 / 群管理员在不同适配器里可能出现的角色标识 */
const GUILD_ADMIN_ROLES = [
  'owner', 'OWNER',
  'admin', 'ADMIN',
  'SUBCHANNEL_ADMIN',
]

export function hasPermission(...perms: boolean[]): boolean {
  return perms.some(perm => perm === true)
}

/**
 * 取用户的 Koishi 权限等级。
 *
 * 与内核保持一致：用户表里没有记录时视为应用配置的 `autoAuthorize`（默认 1）。
 * @see https://koishi.chat/ - 用户表的 `authority` 字段由 @koishijs/core 提供
 */
export function getAuthority(session: any): number {
  const authority = session?.user?.authority
  if (typeof authority === 'number') return authority
  const autoAuthorize = session?.app?.koishi?.config?.autoAuthorize
  return typeof autoAuthorize === 'number' ? autoAuthorize : 1
}

/** 用户权限等级是否达到 `min`（Koishi 的权限规则：等级越高权限越大） */
export function hasAuthority(session: any, min: number): boolean {
  return getAuthority(session) >= (min ?? 0)
}

/**
 * 是否为群主 / 群管理员。
 *
 * 注意：适配器给出的 `member.roles` 是**对象数组**（如 `[{ id: 'admin' }]`），
 * 少数适配器给的是字符串数组，这里两种都兼容；拿不到角色信息时一律视为「不是」，
 * 避免在无法判定身份的场景下放开管理权限。
 */
export function isGuildAdmin(session: any): boolean {
  const roles = session?.event?.member?.roles
  if (!Array.isArray(roles) || roles.length === 0) return false
  return roles.some((role: any) => {
    const id = typeof role === 'string' ? role : role?.id
    return typeof id === 'string' && GUILD_ADMIN_ROLES.includes(id)
  })
}

export async function isRollCreator(session: any, rollCreatorId: number): Promise<boolean> {
  return session.user.id === rollCreatorId
}
