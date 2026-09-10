import { Context } from 'koishi';
import { Config } from '../../config';
import { DateTime, Duration } from 'luxon';
import {getCurrentUTCOffset} from "../../util/time";
import {checkDateInput, dateInputToDateTime, dateInputToDuration, generateUniqueCode} from "../../util/general";

export function addReminder(ctx: Context, config: Config) {
  ctx.command("giveaway.reminder.add")
    .alias('创建提醒器')
    .userFields(['id', 'offset'])
    .channelFields(['id', 'offset'])
    .action(async ({session}) => {
      const offset = await getCurrentUTCOffset(ctx, session, config)
      let time: DateTime
      let duration: Duration
      let rule = {
        recurs: true,
        minute: '0',
        second: '0',
        tz: 'Etc/UTC'
      } as {
        recurs: boolean,
        year: string | undefined,
        month: string | undefined,
        date: string | undefined,
        hour: string | undefined,
        minute: string,
        second: string,
        tz: string
      }

      await session.send(session.text('.type'))
      const type = await session.prompt()
      if (!type) return session.text('commands.timeout')

      if (type === '0') {
        // specified
        await session.send(session.text('.specified', [offset]))
        const input = await session.prompt()

        if (!input) return session.text('commands.timeout')
        else if (!checkDateInput(input, 5)) return session.text('.timeError')

        time = dateInputToDateTime(input, offset).toUTC()
      } else if (type === '1') {
        // before end
        await session.send(session.text('.before-end', [offset]))
        const input = await session.prompt()

        if (!input) return session.text('commands.timeout')
        else if (!checkDateInput(input, 5)) return session.text('.timeError')

        duration = dateInputToDuration(input)
      } else if (type === '2') {
        // interval
        await session.send(session.text('.interval.select'))
        const select = await session.prompt()

        if (select === '0') {
          const regex = /\d{1,2}-\d{1,2}-\d{1,2}(-\d{1,2})?/
          await session.send(session.text('.interval.per-year', [offset]))
          const input = await session.prompt()

          if (!input) return session.text('commands.timeout')
          else if (!checkDateInput(input, 4)) return session.text('.timeError')

          const ruleArray = input.split('-')
          rule.month = ruleArray[0]
          rule.date = ruleArray[1]
          rule.hour = ruleArray[2]
          rule.minute = ruleArray[3] || undefined
          // apply offset
          let dt = DateTime.fromObject({
            day: parseInt(rule.date) || 0,
            hour: parseInt(rule.hour) || 0,
            minute: parseInt(rule.minute) || 0,
            second: 0
          }, {zone: offset})
          dt = dt.toUTC()
          rule.month = dt.month.toString()
          rule.date = dt.day.toString()
          rule.hour = dt.hour.toString()
          rule.minute = dt.minute.toString()
          rule.second = dt.second.toString()

        } else if (select === '1') {
          await session.send(session.text('.interval.per-month', [offset]))
          const input = await session.prompt()

          if (!input) return session.text('commands.timeout')
          else if (!checkDateInput(input, 3)) return session.text('.timeError')

          const ruleArray = input.split('-')
          rule.date = ruleArray[0]
          rule.hour = ruleArray[1]
          rule.minute = ruleArray[2] || undefined
          // apply offset
          let dt = DateTime.fromObject({
            day: parseInt(rule.date) || 0,
            hour: parseInt(rule.hour) || 0,
            minute: parseInt(rule.minute) || 0,
            second: 0
          }, {zone: offset})
          dt = dt.toUTC()
          rule.date = dt.day.toString()
          rule.hour = dt.hour.toString()
          rule.minute = dt.minute.toString()
          rule.second = dt.second.toString()

        } else if (select === '2') {
          await session.send(session.text('.interval.per-day', [offset]))
          const input = await session.prompt()

          if (!input) return session.text('commands.timeout')
          else if (!checkDateInput(input, 2)) return session.text('.timeError')

          const ruleArray = input.split('-')
          rule.hour = ruleArray[0]
          rule.minute = ruleArray[1] || undefined
          // apply offset
          let dt = DateTime.fromObject({
            hour: parseInt(rule.hour) || 0,
            minute: parseInt(rule.minute) || 0,
            second: 0
          }, {zone: offset})
          dt = dt.toUTC()
          rule.hour = dt.hour.toString()
          rule.minute = dt.minute.toString()
          rule.second = dt.second.toString()

        } else if (select === '3') {
          await session.send(session.text('.interval.per-hour', [offset]))
          const input = await session.prompt()

          if (!input) return session.text('commands.timeout')
          else if (!checkDateInput(input, 1)) return session.text('.timeError')

          const ruleArray = input.split('-')
          rule.minute = ruleArray[0]
          // apply offset
          let dt = DateTime.fromObject({
            minute: parseInt(rule.minute) || 0,
            second: 0
          }, {zone: offset})
          dt = dt.toUTC()
          rule.minute = dt.minute.toString()
          rule.second = dt.second.toString()
        } else {
          return session.text('.interval.error')
        }
      } else {
        return session.text('.typeError')
      }

      const reminderCodeRes = await ctx.database.get('reminder', {}, ['reminder_code'])
      const existingCodes = reminderCodeRes.map((item) => item.reminder_code)
      const reminderCode = await generateUniqueCode(existingCodes)
      const reminder = {
        reminder_code: reminderCode,
        type: type,
        time: time? time.toJSDate() : undefined,
        last_call: new Date(),
        recurrence_rule: rule,
        duration: duration? duration.toObject() : undefined
      }
      // if exist in database, only add user_reminder
      let s
      switch (reminder.type) {
        case '0':
          s = {
            type: reminder.type,
            time: time.toJSDate()
          }
          break
        case '1':
          s = {
            type: reminder.type,
            duration: JSON.stringify(duration),
          }
          break
        case '2':
          s = {
            type: reminder.type,
            recurrence_rule: JSON.stringify(rule),
          }
      }
      const checkDuplicate = await ctx.database.get('reminder', s)
      if (checkDuplicate.length > 0) {
        const res = await ctx.database.get('user_reminder', {user_id: session.user.id, reminder_id: checkDuplicate[0].id})
        if (res.length > 0) return session.text('.exist', [checkDuplicate[0].reminder_code])
        await ctx.database.create('user_reminder', {user_id: session.user.id, reminder_id: checkDuplicate[0].id})
        return session.text('.success', [checkDuplicate[0].reminder_code])
      }

      ctx.emit('giveaway/reminder-add', session, reminder)
      return session.text('.success', [reminderCode])
    })
}
