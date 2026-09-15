import {Context, h} from 'koishi';
import {Config} from '../../config';
import {DateTime} from 'luxon';
import {
  stringToPrize,
  generateUniqueCode,
  dateInputToDateTime,
  checkDateInput,
  parsePrizeInput,
  parseCreateForm,
} from "../../util/general";
import {hasPermission, isGuildAdmin, hasAuthority} from "../../util/role";
import {getCurrentUTCOffset} from "../../util/time";
import {parsePolicy, pickLang, policyEquals, policyFromConfig, renderPolicy} from "../../util/rollPolicy";
import {hasPuppeteer, rollCreatedImage} from "../../util/render";

/**
 * 创建抽奖。
 *
 * 交互只有「一问一答」：bot 给出**文字表格模板**，用户复制后逐项填写发回。
 *
 * ```
 * 奖品：显卡*1|鼠标*2        ← 必填，名称*数量，多个用 | 分隔
 * 开奖时间：09-15-20-00      ← 留空表示不自动开奖
 * 加入口令：参加             ← 留空表示不用口令
 * 标题：                     ← 留空用默认「{昵称} 的抽奖」
 * 描述：                     ← 留空用默认（同标题）
 * ```
 *
 * 解析按**标签**取值，所以群里随口一句（没有「奖品：」这类标签）不会被误当成奖品；
 * 缺奖品、时间格式不对、或明确回复取消 → 直接取消本次创建，不逐步追问。
 *
 * 熟手也可以完全跳过模板，直接带参数创建：
 *   `抽奖 add 显卡*1 09-15-20-00 参加`
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

      // 交互式：给出文字表格模板，用户复制填写后发回，下一条消息即创建内容
      let prizeInput = prizeArg
      let timeInput = endTimeArg
      let keyInput = keyArg
      let titleInput = ''
      let descriptionInput = ''
      // 模板里的「参与条件」一行直接带上控制台当前配置；用户可沿默认、删空或改写
      const globalPolicy = policyFromConfig(config)
      let policyOverride = null
      if (prizeInput === undefined) {
        await session.send(session.text('.createForm', [renderPolicy(globalPolicy, pickLang(session))]))
        const answer = await session.prompt()
        // 超时/没回 / 明确取消 / 回复别的内容 → 一律取消本次创建
        if (!answer) return session.text('.cancelled')
        const trimmed = answer.trim()
        if (trimmed === 'q' || trimmed === '取消') return session.text('.quit')
        const form = parseCreateForm(trimmed)
        if (!form.ok) {
          await session.send(session.text(form.error === 'time' ? '.timeError' : '.noPrize'))
          return session.text('.cancelled')
        }
        const policy = parsePolicy(form.policyInput)
        if (!policy.ok) {
          await session.send(session.text('.policyError', [policy.unknown ?? '']))
          return session.text('.cancelled')
        }
        // 文本表达不了的口径（标识判定、龙王口径等）永远跟控制台走；这里只比文本能表达的项
        if (!policyEquals(policy.policy, globalPolicy)) policyOverride = policy.policy
        prizeInput = form.prizeInput
        timeInput = form.timeInput
        keyInput = form.keyInput
        titleInput = form.titleInput
        descriptionInput = form.descriptionInput
      }

      // 开奖时间：合法时间 或 n（不自动开奖）
      let endTime: string | Date = ''
      if (timeInput !== undefined && timeInput !== '' && timeInput !== 'n') {
        if (!checkDateInput(timeInput, 5)) {
          await session.send(session.text('.timeError'))
          return session.text('.cancelled')
        }
        try {
          const dt = dateInputToDateTime(timeInput, offset)
          // luxon 对非法日期不抛错，只返回 isValid=false —— 必须显式拦掉，
          // 否则会带着 Invalid Date 创建抽奖（自动开奖直接失效）
          if (!dt.isValid) throw new Error('invalid date')
          endTime = dt.toUTC().toJSDate()
        } catch (e) {
          await session.send(session.text('.timeError'))
          return session.text('.cancelled')
        }
      }

      // 奖品
      const prizeList = parsePrizeInput(String(prizeInput ?? ''))
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
        // 优先级：模板里填的 > 命令行选项 > 默认值
        title: titleInput
          ? await ctx.assets.transform(titleInput)
          : options.title
            ? await ctx.assets.transform(options.title)
            : session.text('.defaultTitle', [session.author.name]),
        description: descriptionInput
          ? await ctx.assets.transform(descriptionInput)
          : options.description
            ? await ctx.assets.transform(options.description)
            : session.text('.defaultDescription', [session.author.name]),
      } as any

      ctx.emit('giveaway/roll-add',
        session,
        roll,
        prizeList,
        policyOverride ? { policy: policyOverride } : {}
      )

      const successText = roll.joinKey
        ? session.text('.successWithKey', [roll.roll_code, roll.joinKey])
        : session.text('.success', [roll.roll_code])

      // 创建结果：装了 puppeteer 且开了图片渲染 → 只发图片卡片（编号 / 口令 / 奖品 / 参与条件都在卡片里）；
      // 没装或渲染失败 → 回退为文字成功提示
      if (config.render?.create && hasPuppeteer(ctx)) {
        const effective = policyOverride ?? globalPolicy
        const conditions = renderPolicy(effective, pickLang(session))
          || session.text('messageBuilder.roll.detail.noCondition')
        const image = await rollCreatedImage(ctx, session, roll, prizeList, offset, conditions, { style: config.render?.style, banner: config.render?.banner })
        if (image) return [...h.parse(image)]
      }
      return successText
    })
}
