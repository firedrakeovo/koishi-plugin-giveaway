import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import esbuild from 'esbuild'
import yaml from 'js-yaml'

/**
 * 独立构建脚本：不依赖任何 Koishi 工作区工具链（上游用的是 yakumo + dumble）。
 *
 * 产物：
 *   lib/index.js   —— esbuild 打包的 CJS 入口（.d.ts 由 `npm run build:types` 生成）
 *   lib/index.js.map
 *
 * 两个关键点：
 *   1. 语言包是 `import zhCN from './locales/zh-CN.yml'` 这种 YAML 导入，
 *      esbuild 原生不认识 .yml，这里用 js-yaml 解析成 JSON 再交给 json loader
 *      （与上游 dumble 的 yamlPlugin 完全相同的做法）。
 *   2. dependencies / peerDependencies 一律保持 external，交给使用方的包管理器解析；
 *      只有源码本身会被打进 bundle。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
]

const yamlPlugin = {
  name: 'yaml',
  setup(build) {
    build.onLoad({ filter: /\.ya?ml$/ }, (args) => ({
      contents: JSON.stringify(yaml.load(readFileSync(args.path, 'utf8'))),
      loader: 'json',
    }))
  },
}

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [path.join(root, 'src/index.ts')],
  outfile: path.join(root, 'lib/index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  external,
  legalComments: 'eof',
  logLevel: 'info',
  plugins: [yamlPlugin],
}

if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options)
  await context.watch()
  console.log('[build] watching for changes ...')
} else {
  await esbuild.build(options)
}
