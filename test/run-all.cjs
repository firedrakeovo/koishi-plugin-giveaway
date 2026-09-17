/**
 * 离线用例总入口：先生成 `.perm.cjs`（把 src 下的纯函数与配置打包成可 require 的 CJS），
 * 再依次跑各套件。任一失败即返回非 0，可直接用于 CI。
 *
 *   npm test          # 跑 5 套离线用例（create / join / schema / perm / i18n）
 *   npm run test:shots # 额外跑真实 Chromium 截图验收（需要 puppeteer-core + 浏览器，CI 里默认不跑）
 */
const { spawnSync } = require('child_process')
const path = require('path')

const SUITES = ['create-test.cjs', 'join-test.cjs', 'schema-test.cjs', 'perm-test.cjs', 'i18n-test.cjs', 'interaction-test.cjs']

function run(file) {
  const started = Date.now()
  const res = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' })
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  return { file, code: res.status ?? 1, secs }
}

const build = spawnSync(process.execPath, [path.join(__dirname, 'build-perm.cjs')], { stdio: 'inherit' })
if (build.status !== 0) {
  console.error('❌ 生成 .perm.cjs 失败')
  process.exit(1)
}

const results = SUITES.map(run)
console.log('\n================ 汇总 ================')
for (const r of results) {
  console.log(`${r.code === 0 ? '✅' : '❌'} ${r.file.padEnd(18)} ${r.secs}s`)
}
const failed = results.filter((r) => r.code !== 0)
if (failed.length) {
  console.error(`\n❌ ${failed.length} 套用例失败：${failed.map((r) => r.file).join(', ')}`)
  process.exit(1)
}
console.log('\n✅ 全部用例通过')
