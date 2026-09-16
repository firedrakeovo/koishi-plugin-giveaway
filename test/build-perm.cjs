const esbuild = require('esbuild'), yaml = require('js-yaml'), fs = require('fs')
esbuild.build({
  entryPoints: [require('path').join(__dirname, 'perm-entry.ts')], bundle: true, platform: 'node', format: 'cjs', target: 'node18',
  outfile: require('path').join(__dirname, '.perm.cjs'), external: ['koishi', 'luxon', 'node-schedule', 'koishi-plugin-assets-local'],
  logLevel: 'warning',
  plugins: [{ name: 'yaml', setup(b) { b.onLoad({ filter: /\.ya?ml$/ }, (a) => ({ contents: JSON.stringify(yaml.load(fs.readFileSync(a.path, 'utf8'))), loader: 'json' })) } }],
}).then(() => {})
