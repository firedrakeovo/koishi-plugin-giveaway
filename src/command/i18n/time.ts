import {Context} from 'koishi';
import {Config} from '../../config';
import {hasPermission, isGuildAdmin, isPluginAdmin} from '../../util/role'
import {getTimeOffset, offsetToUTCOffset, validateTimeOffsetFormat} from '../../util/time'

export function time(ctx: Context, config: Config) {
  ctx.command("giveaway.time [offset]")
    .alias('时区')
    .option('channel', '-c')
    .option('default', '-d')
    .userFields(['offset'])
    .channelFields(['offset'])
    .action(async ({session, options}, offset) => {
      if (options.default) {
        if (options.channel) {
          if (!hasPermission(isPluginAdmin(session, config), isGuildAdmin(session))) return session.text('.noAuth')
          session.channel.offset = ''
          return session.text('.success.defaultChannel')
        } else {
          session.user.offset = ''
          return session.text('.success.defaultUser')
        }
      }
      // solve the problem that the time offset starting with - is regarded as a command option
      if (!offset) {
        const input = session.content
        const match = getTimeOffset(input)
        if (match != '') offset = match
      }
      // if offset is empty, return current offset
      if (!offset) {
        const preferUser = ctx.root.options.i18n.output === 'prefer-user'
        let currentChannelOffset = session.channel.offset.length === 0 ? session.text('.empty') : offsetToUTCOffset(session.channel.offset)
        let currentUserOffset = session.user.offset.length === 0 ? session.text('.empty') : offsetToUTCOffset(session.user.offset)
        let currentDefaultOffset = offsetToUTCOffset(config.basic.defaultTimeOffset)
        if (preferUser) {
          if (currentUserOffset != session.text('.empty')) {
            currentUserOffset += ' < ' + session.text('.selected')
          } else if (currentUserOffset === session.text('.empty') && currentChannelOffset != session.text('.empty')) {
            currentChannelOffset += ' < ' + session.text('.selected')
          } else {
            currentDefaultOffset += ' < ' + session.text('.selected')
          }
        } else {
          if (currentChannelOffset != session.text('.empty')) {
            currentChannelOffset += ' < ' + session.text('.selected')
          } else if (currentChannelOffset === session.text('.empty') && currentUserOffset != session.text('.empty')) {
            currentUserOffset += ' < ' + session.text('.selected')
          } else {
            currentDefaultOffset += ' < ' + session.text('.selected')
          }
        }
        return session.text('.result', [currentChannelOffset, currentUserOffset, currentDefaultOffset])
      }

      // if the time zone offset value does not start with + or -, it defaults to +
      if (!(offset.startsWith('+') || offset.startsWith('-'))) {
        offset = '+' + offset
      }

      if (!validateTimeOffsetFormat(offset)) return session.text('.inValidFormat')

      if (options.channel) {
        if (!hasPermission(isPluginAdmin(session, config), isGuildAdmin(session))) return session.text('.noAuth')
        session.channel.offset = offset
        return session.text('.success.channel', [offset])
      } else {
        session.user.offset = offset
        return session.text('.success.user', [offset])
      }
    })
}
