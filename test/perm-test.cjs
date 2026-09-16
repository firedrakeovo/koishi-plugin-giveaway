const path = require('path')
const fs = require('fs')
const ROOT = path.join(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')
const LOCALES_DIR = path.join(SRC_DIR, 'locales')

const { hasAuthority, getAuthority, isGuildAdmin, hasPermission, Config, Authority } = require(path.join(__dirname, '.perm.cjs'))
const yaml = require('js-yaml')

let pass = 0, fail = 0
function ok(name, actual, expected) {
  const good = actual === expected
  good ? pass++ : fail++
  console.log(`${good ? '  ✓' : '  ✗'} ${name} → ${actual}${good ? '' : ` (期望 ${expected})`}`)
}

console.log('=== 1. authority 判定 ===')
ok('普通用户(1) 达到创建等级 1', hasAuthority({ user: { authority: 1 } }, 1), true)
ok('普通用户(1) 达到管理等级 3', hasAuthority({ user: { authority: 1 } }, 3), false)
ok('管理员(3) 达到管理等级 3', hasAuthority({ user: { authority: 3 } }, 3), true)
ok('超管(4) 达到管理等级 3', hasAuthority({ user: { authority: 4 } }, 3), true)
ok('封禁(0) 不能创建', hasAuthority({ user: { authority: 0 } }, 1), false)
ok('无用户记录时回退 1', getAuthority({}), 1)
ok('无记录但 autoAuthorize=3', getAuthority({ app: { koishi: { config: { autoAuthorize: 3 } } } }), 3)

console.log('=== 2. 群管理员判定（修复点）===')
ok('对象数组 [{id:admin}]', isGuildAdmin({ event: { member: { roles: [{ id: 'admin' }] } } }), true)
ok('对象数组 [{id:owner}]', isGuildAdmin({ event: { member: { roles: [{ id: 'owner' }] } } }), true)
ok('对象数组 [{id:member}]', isGuildAdmin({ event: { member: { roles: [{ id: 'member' }] } } }), false)
ok('字符串数组 ["owner"]', isGuildAdmin({ event: { member: { roles: ['owner'] } } }), true)
ok('无 member 字段', isGuildAdmin({ event: {} }), false)
ok('私聊（无 roles）', isGuildAdmin({ event: { platform: 'onebot', user: { id: 1 } } }), false)

console.log('=== 3. 组合策略（按默认配置 authorityCreate=1 / authorityManage=3 / 群管理开关=true）===')
const cfg = Config({})
const U = { user: { authority: 1 } }
const A = { user: { authority: 3 } }
const GA = { user: { authority: 1 }, event: { member: { roles: [{ id: 'admin' }] } } }
const add = (s) => hasPermission(hasAuthority(s, cfg.permission.authorityCreate), isGuildAdmin(s))
const manage = (s) => hasPermission(hasAuthority(s, cfg.permission.authorityManage), isGuildAdmin(s) && cfg.permission.allowGuildAdminDelete)
ok('普通用户可创建', add(U), true)
ok('普通用户不能管理他人抽奖', manage(U), false)
ok('管理员可管理他人抽奖', manage(A), true)
ok('群管理员可创建', add(GA), true)
ok('群管理员可管理本群抽奖', manage(GA), true)
const cfg2 = Config({ permission: { authorityCreate: 3, allowGuildAdminDelete: false } })
ok('authorityCreate=3 时普通用户不可创建', hasPermission(hasAuthority(U, cfg2.permission.authorityCreate), isGuildAdmin(U)), false)
ok('allowGuildAdminDelete=false 时群管理员不可管理', hasPermission(hasAuthority(GA, cfg2.permission.authorityManage), isGuildAdmin(GA) && cfg2.permission.allowGuildAdminDelete), false)

// schema 结构与文案覆盖的用例见 schema-test.cjs
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
