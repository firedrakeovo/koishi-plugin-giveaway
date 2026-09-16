import {Context} from 'koishi';
import {Config} from "../config";

export function getCurrentLocales(ctx: Context, session: any, config: Config): string {
  const preferUser = ctx.root.options.i18n.output === 'prefer-user'
  // 平台 / 会话不一定带 locales（没装 locales 插件时 session.user.locales 是 undefined），兜一层避免报错
  const channelLocales = session.channel?.locales ?? []
  const userLocales = session.user?.locales ?? []
  let currentChannelLocales = channelLocales.length === 0 ? '' : channelLocales
  let currentUserLocales = userLocales.length === 0 ? '' : userLocales
  let currentDefaultLocales = ctx.root.options.i18n.locales

  if (preferUser) {
    if (currentUserLocales != '') {
      return currentUserLocales
    } else if (currentUserLocales === '' && currentChannelLocales != '') {
      return currentChannelLocales
    } else {
      return currentDefaultLocales
    }
  } else {
    if (currentChannelLocales != '') {
      return currentChannelLocales
    } else if (currentChannelLocales === '' && currentUserLocales != '') {
      return currentUserLocales
    } else {
      return currentDefaultLocales
    }
  }
}
