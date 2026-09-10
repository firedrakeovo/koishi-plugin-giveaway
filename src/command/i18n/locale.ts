import {Context} from 'koishi';
import {Config} from '../../config';
import {hasPermission, isGuildAdmin, isPluginAdmin} from "../../util/role";

export function locale(ctx: Context, config: Config) {
  ctx.command("giveaway.locale [lang]")
    .alias('语言')
    .option('channel', '-c')
    .option('default', '-d')
    .userFields(['locales'])
    .channelFields(['locales'])
    .action(({session, options}, lang) => {
      if (options.default) {
        if (options.channel) {
          if (!hasPermission(isPluginAdmin(session, config), isGuildAdmin(session))) return session.text('.noAuth')
          session.channel.locales = []
          return session.text('.success.defaultChannel')
        } else {
          session.user.locales = []
          return session.text('.success.defaultUser')
        }
      }
      // if lang is empty, return current language prefer
      if (!lang) {
        const preferUser = ctx.root.options.i18n.output === 'prefer-user'
        let currentChannelLang = session.channel.locales.length === 0 ? session.text('.empty') : session.channel.locales[0]
        let currentUserLang = session.user.locales.length === 0 ? session.text('.empty') : session.user.locales[0]
        let currentDefaultLang = ctx.root.options.i18n.locales[0]
        if (preferUser) {
          if (currentUserLang != session.text('.empty')) {
            currentUserLang += ' < ' + session.text('.selected')
          } else if (currentUserLang === session.text('.empty') && currentChannelLang != session.text('.empty')) {
            currentChannelLang += ' < ' + session.text('.selected')
          } else {
            currentDefaultLang += ' < ' + session.text('.selected')
          }
        } else {
          if (currentChannelLang != session.text('.empty')) {
            currentChannelLang += ' < ' + session.text('.selected')
          } else if (currentChannelLang === session.text('.empty') && currentUserLang != session.text('.empty')) {
            currentUserLang += ' < ' + session.text('.selected')
          } else {
            currentDefaultLang += ' < ' + session.text('.selected')
          }
        }
        return session.text('.result', [currentChannelLang, currentUserLang, currentDefaultLang])
      }

      if (options.channel) {
        if (!hasPermission(isPluginAdmin(session, config), isGuildAdmin(session))) return session.text('.noAuth')
        session.channel.locales.unshift(lang)
        return session.text('.success.channel', [lang])
      } else {
        session.user.locales.unshift(lang)
        return session.text('.success.user', [lang])
      }
    })
}
