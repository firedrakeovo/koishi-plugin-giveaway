import {Context} from 'koishi';
import {Config} from '../../config';
import {DateTime} from 'luxon';
import {
  stringToPrize,
  generateUniqueCode,
  dateInputToDateTime,
  checkDateInput,
  parsePrizeInput,
  parseTimeAndKey,
} from "../../util/general";
import {hasPermission, isGuildAdmin, hasAuthority} from "../../util/role";
import {getCurrentUTCOffset} from "../../util/time";

/**
 * 创建抽奖。
 *
 * 交互被压缩成**最多两步**（原来的 6 步）：
 *   ① 奖品（一行一个，`名称*数量`）
 *   ② 开奖时间与加入口令（合并成一条回答，`n` 表示该项不要）
 *
 * 标题 / 描述 / 开奖类型 不再提问，直接取默认值，需要自定义时用参数：
 *   `抽奖 add -t <标题> -d <描述> -r <可重复中奖>`
 *
 * 也支持完全非交互的写法（位置参数对应 奖品 / 开奖时间 / 加入口令）：
 *   `抽奖 add 显卡*1 09-15-20-00 参加`
 *   `抽奖 add 显卡*1|鼠标*2 n n`（多个奖品用 `|` 分隔，不自动开奖、不用口令）
 *
 * 省略的字段会逐项提问；`q` 取消，`undo` 回上一步。
 */
export function addRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.add [prize] [endTime] [key]")
    .alias('创建抽奖')
    .option('title', '-t <title>', {descPath: 'commands.giveaway.add.options.title'})
    .option('description', '-d <text>', {descPath: 'commands.giveaway.add.options.description'})
    .option('repeat', '-r', {descPath: 'commands.giveaway.add.options.repeat'})
    .option('fast', '-n', {descPath: 'commands.giveaway.add.options.fast'})
    .userFields(['offset'])
    .channelFields(['offset'])
    .action(async ({session, options}, prizeArg, endTimeArg, keyArg) => {
      // auth：达到创建等级，或群主/群管理员
      if (!hasPermission(
        hasAuthority(session, config.permission.authorityCreate),
        isGuildAdmin(session)
      )) return session.text('.noAuth')

      const offset = await getCurrentUTCOffset(ctx, session, config)

      // init
      const roll_code_res = await ctx.database.get('roll', {}, ['roll_code'])
      const existingCodes = roll_code_res.map((item) => item.roll_code)
      const roll = {
        roll_code: await generateUniqueCode(existingCodes),
        platform: session.event.platform,
        joinKey: null,
        isAutoEnd: null,
        rollType: options.repeat ? '0' : '1',
        endTime: null,
        isEnd: false,
        title: null,
        description: null,
      } as any

      let prizeList: ReturnType<typeof stringToPrize>[] = []

      // 标题 / 描述：默认值，可用 -t / -d 覆盖
      roll.title = options.title
        ? await ctx.assets.transform(options.title)
        : session.text('.defaultTitle', [session.author.name])
      roll.description = options.description
        ? await ctx.assets.transform(options.description)
        : session.text('.defaultDescription', [session.author.name])

      // 奖品：位置参数里多个奖品用 | 分隔
      if (prizeArg !== undefined) {
        prizeList = parsePrizeInput(prizeArg.replace(/[|｜]/g, '\n'))
        if (prizeList.length === 0) return session.text('.prizeEmpty')
      }

      // 时间 / 口令的预置值：位置参数优先；`-n` 表示"都不要"（于是只剩奖品一问）
      const presetTime = endTimeArg !== undefined ? endTimeArg : (options.fast ? 'n' : undefined)
      const presetKey = keyArg !== undefined ? keyArg : (options.fast ? 'n' : undefined)

      const applyTime = async (input: string): Promise<string | null> => {
        if (input === '' || input === 'n') {
          roll.endTime = ''
          roll.isAutoEnd = false
          return null
        }
        if (!checkDateInput(input, 5)) return '.timeError'
        try {
          roll.endTime = dateInputToDateTime(input, offset).toUTC().toJSDate()
        } catch (e) {
          return '.timeError'
        }
        roll.isAutoEnd = true
        return null
      }

      const applyKey = async (input: string): Promise<string | null> => {
        roll.joinKey = (input === '' || input === 'n') ? '' : input
        return null
      }

      // 待问的问题清单（声明式：顺序即提问顺序，undo 自动回退）
      type Question = { prompt: string; run: (input: string) => Promise<string | null> }
      const questions: Question[] = []

      if (prizeArg === undefined) {
        questions.push({
          prompt: '.prize',
          run: async (input) => {
            const list = parsePrizeInput(input)
            if (list.length === 0) return '.prizeEmpty'
            prizeList = list
            return null
          },
        })
      }

      const askTime = presetTime === undefined
      const askKey = presetKey === undefined
      if (askTime && askKey) {
        // 两者都未知 → 合并成一步，省一次往返
        questions.push({
          prompt: '.timeAndKey',
          run: async (input) => {
            const {timeInput, keyInput} = parseTimeAndKey(input)
            const error = await applyTime(timeInput)
            if (error) return error
            return applyKey(keyInput)
          },
        })
      } else {
        if (askTime) {
          questions.push({prompt: '.autoEnd', run: applyTime})
        } else {
          const error = await applyTime(presetTime)
          if (error) return session.text(error)
        }
        if (askKey) {
          questions.push({prompt: '.joinKey', run: applyKey})
        } else {
          const error = await applyKey(presetKey)
          if (error) return session.text(error)
        }
      }

      // 交互（q 取消 / undo 回上一步 / 非法输入重问本步）
      let index = 0
      while (index < questions.length) {
        const question = questions[index]
        await session.send(session.text(question.prompt, [offset]))
        const input = await session.prompt()
        if (!input) return session.text('commands.timeout')
        if (input === 'q') return session.text('.quit')
        if (input === 'undo') {
          if (index > 0) index--
          continue
        }
        const error = await question.run(input)
        if (error) {
          await session.send(session.text(error))
          continue
        }
        index++
      }

      ctx.emit('giveaway/roll-add',
        session,
        roll,
        prizeList,
        {}
      )

      return session.text(`.success`, [roll.roll_code])
    })
}
