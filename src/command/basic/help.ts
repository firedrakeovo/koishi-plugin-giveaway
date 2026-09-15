import {Context} from 'koishi';
import {Config} from '../../config';
import {hasAuthority, isGuildAdmin} from '../../util/role';
import {pickLang} from '../../util/rollPolicy';

/**
 * 指令表的分组：值是「`giveaway.` 之后的名字」，数组顺序即展示顺序。
 * 新增指令时在这里补一行即可（create-test 里有用例检查漏掉的指令）。
 */
const GROUPS: Array<[string, string[]]> = [
  ['join', ['list', 'detail', 'join', 'quit', 'member']],
  ['manage', ['add', 'end', 'delete', 'help']],
  ['settings', ['time', 'locale', 'channel']],
  ['admin', ['debug.honor', 'debug.member']],
]

const CJK = /[\u4e00-\u9fff]/

/**
 * 「抽奖」与「抽奖帮助」都输出这份指令表。
 *
 * 为什么要自己拼而不用框架的帮助：help 插件在 `before('command/execute')` 里判断
 * **指令没有 action 时自动接管**，而它列的是指令的注册名（`giveaway delete` 这种英文）。
 * 给根指令加上 action 后由我们输出，名字按当前语言取（中文环境用中文别名，en/de 用注册名），
 * 描述仍取自各指令自己的 i18n 文案 —— 这样新增指令不用改这份表，加语言也不用重写。
 */
export function help(ctx: Context, config: Config) {
  const render = (session: any) => {
    const isZh = pickLang(session) === 'zh'
    const canManage = hasAuthority(session, config.permission.authorityManage) || isGuildAdmin(session)
    const lines: string[] = [session.text('commands.giveaway.help.messages.help')]
    for (const [group, names] of GROUPS) {
      // 管理员分组只给有管理权限的人看
      if (group === 'admin' && !canManage) continue
      const items: string[] = []
      for (const name of names) {
        const command = ctx.$commander.get(`giveaway.${name}`) as any
        if (!command) continue
        const zh = Object.keys(command._aliases ?? {}).find((alias) => CJK.test(alias))
        const label = isZh ? (zh ?? command.name.replace(/\./g, ' ')) : command.name.replace(/\./g, ' ')
        items.push(session.text('commands.giveaway.help.item', [label, session.text([`commands.${command.name}.description`, ''])]))
      }
      if (!items.length) continue
      lines.push(session.text(`commands.giveaway.help.groups.${group}`), ...items)
    }
    lines.push(session.text('commands.giveaway.help.messages.footer'))
    return lines.filter(Boolean).join('\n')
  }

  // 根指令一旦有了 action，框架 help 插件的「快捷调用」就不会接管「抽奖」了
  ctx.command('giveaway').alias('抽奖').action(({session}) => render(session))
  ctx.command("giveaway.help")
    .alias('抽奖帮助')
    .alias('giveaway.h')
    .action(({session}) => render(session))
}
