import {Context} from 'koishi';
import {Config} from '../../config';
import {DateTime} from 'luxon';
import {stringToPrize, generateUniqueCode, dateInputToDateTime, checkDateInput} from "../../util/general";
import {hasPermission, isGuildAdmin, isPluginAdmin} from "../../util/role";
import {getCurrentUTCOffset} from "../../util/time";

export function addRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.add")
    .alias('创建抽奖')
    .option('n', '-n')
    .userFields(['offset'])
    .channelFields(['offset'])
    .action(async ({session, options}) => {
      // auth
      if (!hasPermission(
        config.permission.allowNormalUserAdd,
        isPluginAdmin(session, config),
        isGuildAdmin(session)
      )) return session.text('.noAuth')

      // time offset
      const offset = await getCurrentUTCOffset(ctx, session, config)

      // init
      const roll_code_res = await ctx.database.get('roll', {}, ['roll_code'])
      const existingCodes = roll_code_res.map((item) => item.roll_code)
      const roll = {
        roll_code: await generateUniqueCode(existingCodes),
        platform: session.event.platform,
        joinKey: null,
        isAutoEnd: null,
        rollType: null,
        endTime: null,
        isEnd: false,
        title: null,
        description: null,
      } as any

      const a = {
        session: session,
        roll: roll,
        prizeList: null,
      }

      // Fast add
      if (options.n) {
        roll.joinKey = ''
        roll.isAutoEnd = false
        roll.rollType = 1
        roll.endTime = ''
        roll.isEnd = false
        roll.title = session.text('.defaultTitle', [session.author.name])
        roll.description = session.text('.defaultDescription', [session.author.name])

        await session.send(session.text('.prizeFast'))
        const prize = await session.prompt()
        if (!prize) return session.text('commands.timeout')
        if (prize === 'q') return session.text('.quit')
        a.prizeList = prize.split(/\r\n|\r|\n/).map(s => {
          return stringToPrize(s)
        })
      }

      while (Object.values(roll).some(value => value === null) || a.prizeList === null) {
        if (!roll.title) {
          await session.send(session.text('.title', [session.author.name]))
          const title = await session.prompt()
          if (!title) return session.text('commands.timeout')
          if (title === 'q') return session.text('.quit')
          roll.title = title != 'n' ? await ctx.assets.transform(title) : session.text('.defaultTitle', [session.author.name])
        }

        if (!roll.description) {
          await session.send(session.text('.description', [session.author.name]))
          const description = await session.prompt()
          if (!description) return session.text('commands.timeout')
          if (description === 'q') return session.text('.quit')
          if (description === 'undo') {
            roll.title = null
            continue
          }
          roll.description = description != 'n' ? await ctx.assets.transform(description) : session.text('.defaultDescription', [session.author.name])
        }

        if (!a.prizeList) {
          if (options.n) await session.send(session.text('.prizeFast'))
          else await session.send(session.text('.prize'))

          const prize = await session.prompt()
          if (!prize) return session.text('commands.timeout')
          if (prize === 'q') return session.text('.quit')
          if (!options.n && prize === 'undo') {
            roll.description = null
            continue
          }
          a.prizeList = prize.split(/\r\n|\r|\n/).map(s => {
            return stringToPrize(s)
          })
        }

        if (!roll.endTime) {
          let endTime = null
          await session.send(session.text('.autoEnd', [offset]))
          let endTimeInput = await session.prompt()
          if (!endTimeInput) return session.text('commands.timeout')
          if (endTimeInput === 'q') return session.text('.quit')
          if (endTimeInput === 'undo') {
            a.prizeList = null
            continue
          }
          if (endTimeInput === 'n') endTime = ''
          else if (!checkDateInput(endTimeInput, 5)) return session.text('.timeError')
          else {
            try {
              endTime = dateInputToDateTime(endTimeInput, offset).toUTC().toJSDate()
            } catch (e) {
              return session.text('.timeError')
            }
          }
          roll.endTime = endTime
          roll.isAutoEnd = endTime !== ''
          if (endTime === '') roll.rollType = '1'
        }

        if (!roll.rollType) {
          let rollType = '1'
          if (roll.endTime !== '') {
            await session.send(session.text('.type'))
            let rollTypeInput = await session.prompt()
            if (!rollTypeInput) return session.text('commands.timeout')
            if (rollTypeInput === 'q') return session.text('.quit')
            if (rollTypeInput === 'undo') {
              roll.endTime = null
              continue
            }
            if (rollTypeInput === 'n') rollTypeInput = '1'
            if (rollTypeInput != '0' && rollTypeInput != '1') return session.text('.typeError')
            rollType = rollTypeInput
          }

          roll.rollType = rollType
        }

        if (!roll.joinKey) {
          await session.send(session.text('.joinKey'))
          let joinKey = await session.prompt()
          if (!joinKey) return session.text('commands.timeout')
          if (joinKey === 'q') return session.text('.quit')
          if (joinKey === 'undo') {
            if (roll.isAutoEnd) {
              roll.rollType = null
            } else {
              roll.endTime = null
              roll.rollType = null
            }
            continue
          }
          if (joinKey === 'n') joinKey = ''
          roll.joinKey = joinKey
        }
      }

      ctx.emit('giveaway/roll-add',
        a.session,
        a.roll,
        a.prizeList,
        {}
      )

      return session.text(`.success`, [roll.roll_code])
    })
}


