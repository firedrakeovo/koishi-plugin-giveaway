import {Context} from 'koishi';
import {Config} from '../../config';
import {DateTime} from 'luxon';
import {
  stringToPrize,
  generateUniqueCode,
  dateInputToDateTime,
  checkDateInput,
  parsePrizeInput,
  parseCreateInput,
} from "../../util/general";
import {hasPermission, isGuildAdmin, hasAuthority} from "../../util/role";
import {getCurrentUTCOffset} from "../../util/time";

/**
 * 创建抽奖。
 *
 * 交互只有「一问一答」：
 *   1. `创建抽奖` → bot 输出创建格式与参考用例
 *   2. 用户**下一条消息**即为创建内容：`奖品 开奖时间 [加入口令]`
 *      - 奖品：`名称*数量`，多个用 `|` 分隔
 *      - 开奖时间：`年-月-日-时-分`，或 `n`（不自动开奖）
 *      - 加入口令：可省略；`n` 表示不用口令
 *   3. 不符合规则、或回复的是别的内容 → **直接取消本次创建**（不再追问）
 *
 * 熟手也可以完全跳过交互，直接带参数（此时不再输出格式提示）：
 *   `抽奖 add 显卡*1 09-15-20-00 参加`
 *   `抽奖 add 显卡*1|鼠标*2 n n`
 *   `抽奖 add -t <标题> -d <描述> -r 显卡*1 n 参加`
 */
export function addRoll(ctx: Context, config: Config) {
  ctx.command("giveaway.add [prize] [endTime] [key]")
    .alias('创建抽奖')
    .option('title', '-t <title>', {descPath: 'commands.giveaway.add.options.title'})
    .option('description', '-d <text>', {descPath: 'commands.giveaway.add.options.description'})
    .option('repeat', '-r', {descPath: 'commands.giveaway.add.options.repeat'})
    .userFields(['offset'])
    .channelFields(['offset'])
    .action(async ({session, options}, prizeArg, endTimeArg, keyArg) => {
      // auth：达到创建等级，或群主/群管理员
      if (!hasPermission(
        hasAuthority(session, config.permission.authorityCreate),
        isGuildAdmin(session)
      )) return session.text('.noAuth')

      const offset = await getCurrentUTCOffset(ctx, session, config)

      // 交互式：先给出格式与参考用例，用户的下一条消息即创建内容
      let prizeInput = prizeArg
      let timeInput = endTimeArg
      let keyInput = keyArg
      if (prizeInput === undefined) {
        await session.send(session.text('.createHint'))
        const answer = await session.prompt()
        // 超时/没回 / 明确取消 / 回复别的内容 → 一律取消本次创建
        if (!answer) return session.text('.cancelled')
        const trimmed = answer.trim()
        if (trimmed === 'q' || trimmed === '取消') return session.text('.quit')
        const parsed = parseCreateInput(trimmed)
        if (!parsed.ok) {
          await session.send(session.text(parsed.error === 'time' ? '.timeError' : '.invalidFormat'))
          return session.text('.cancelled')
        }
        prizeInput = parsed.prizeInput
        timeInput = parsed.timeInput
        keyInput = parsed.keyInput
      }

      // 开奖时间：合法时间 或 n（不自动开奖）
      let endTime: string | Date = ''
      if (timeInput !== undefined && timeInput !== '' && timeInput !== 'n') {
        if (!checkDateInput(timeInput, 5)) {
          await session.send(session.text('.timeError'))
          return session.text('.cancelled')
        }
        try {
          endTime = dateInputToDateTime(timeInput, offset).toUTC().toJSDate()
        } catch (e) {
          await session.send(session.text('.timeError'))
          return session.text('.cancelled')
        }
      }

      // 奖品
      const prizeList = parsePrizeInput(String(prizeInput ?? '').replace(/[|｜]/g, '\n'))
      if (prizeList.length === 0) {
        await session.send(session.text('.prizeEmpty'))
        return session.text('.cancelled')
      }

      // init
      const roll_code_res = await ctx.database.get('roll', {}, ['roll_code'])
      const existingCodes = roll_code_res.map((item) => item.roll_code)
      const roll = {
        roll_code: await generateUniqueCode(existingCodes),
        platform: session.event.platform,
        joinKey: (keyInput === undefined || keyInput === '') ? '' : keyInput,
        isAutoEnd: endTime !== '',
        rollType: options.repeat ? '0' : '1',
        endTime: endTime,
        isEnd: false,
        title: options.title
          ? await ctx.assets.transform(options.title)
          : session.text('.defaultTitle', [session.author.name]),
        description: options.description
          ? await ctx.assets.transform(options.description)
          : session.text('.defaultDescription', [session.author.name]),
      } as any

      ctx.emit('giveaway/roll-add',
        session,
        roll,
        prizeList,
        {}
      )

      return session.text(`.success`, [roll.roll_code])
    })
}
