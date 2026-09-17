# 发版检查清单（1.0 及以后）

> 插件用户量不大，**1.0 之后以稳定为主**：只有缺陷修复与社区需求才发版本。
> 每次发版按下面顺序走一遍即可，正常情况 10 分钟内能完成。

## 0. 前置

- 本地 `koishi/roll-bot` 干净（`git status` 无未提交改动），已 `git pull` 到最新
- Node 18+、npm 可用；本机出网需要代理（`http://127.0.0.1:7890`）

## 1. 代码与用例（必须全绿）

```bash
npm ci            # 干净安装（注意：npm ci 会先删除 node_modules）
npm run build     # tsc 类型检查 + esbuild 打包 lib/index.js
npm test          # 6 套离线用例（创建 / 参与条件 / 控制台表单 / 权限 / 三语 / 交互边界）
```

- 期望：6 套全部 `✅`（当前共 391 条断言）
- CI 也会在 push 后跑同一套（Node 20 / 22），可以先推再等 CI 绿，也可以本地先跑
- 可选（像素级验收，需要 `puppeteer-core` 与 Chromium）：
  ```bash
  npm i -D puppeteer-core
  CHROME=/usr/bin/chromium npm run test:shots   # 6 种卡片 × 3 套主题，断言无两侧黑边、宽度=卡片宽度
  ```

## 2. 版本与文档

1. `package.json` / `package-lock.json` 的 `version` 改成新版本号
2. `CHANGELOG.md`：把 `[Unreleased]` 写成 `## [x.y.z] - YYYY-MM-DD`，条目按 Added / Changed / Fixed 归类
3. 若功能面有变化，同步 `README.md` 与 `docs/features-and-interactions.md`
4. 提交：`git commit -m "chore(release): x.y.z"`（**推送到 GitHub 前先确认**）

## 3. 打标签与 Release

```bash
git tag -a v1.0.0 -m "v1.0.0"
git push origin master v1.0.0
gh release create v1.0.0 --repo firedrakeovo/koishi-plugin-giveaway \
  --title "v1.0.0" --notes-file <(sed -n '/## \[1.0.0\]/,/## \[/p' CHANGELOG.md)
```

## 4. 发布 npm 并同步插件市场

需要 npm 网页生成的 **Granular Access Token**（勾 Bypass 2FA；Permissions 选
**Read and write (publish and stage)**；Packages 选 **All packages**），或用 Classic → Automation。

```bash
# 4.1 临时写入 token（项目目录的 .npmrc 已在 .gitignore 里，发布后立刻删除）
echo "//registry.npmjs.org/:_authToken=<TOKEN>" > .npmrc

# 4.2 先看 tarball 内容（应只有 lib/dist + README/CHANGELOG/LICENSE/package.json）
npm pack --dry-run

# 4.3 发布（带代理；cache 放到工作区内避免沙箱/权限问题）
npm_config_cache=/home/wzt/workstation/qqbot2026/koishi/.npm-cache \
npm_config_proxy=http://127.0.0.1:7890 \
npm_config_https_proxy=http://127.0.0.1:7890 \
npm publish --registry https://registry.npmjs.org

# 4.4 收尾
rm -f .npmrc
```

核验：

```bash
npm view koishi-plugin-giveaway version            # 应为新版本号
# 插件市场索引（约 15 分钟内收录）：
curl -s https://registry.koishi.chat/index.json | grep -o '"name":"koishi-plugin-giveaway".\{0,200\}'
```

市场页面：https://koishi.chat/market/koishi-plugin-giveaway （收录后版本、README、仓库链接会一起更新）

## 5. 部署与冒烟

重启 Koishi（`koishi.yml` 与插件代码都不热加载），然后在群里按下面清单跑一遍：

| # | 操作 | 期望 |
| --- | --- | --- |
| 1 | `抽奖` | 输出按语言分组的指令一览（管理员多两个诊断指令） |
| 2 | `创建抽奖` → 复制模板填写 → 发回 | 创建成功：图片卡片（装了 puppeteer）或文字提示；口令可用 |
| 3 | 用另一个账号发出口令 / `加入抽奖 <编号>` | 满足条件时提示加入成功；不满足时说明具体原因 |
| 4 | `加入抽奖 9999`（不存在的编号） | 回「没有找到该抽奖！」，**不报内部错误** |
| 5 | 开奖后再 `加入抽奖 <编号>` / `退出抽奖 <编号>` | 提示已开奖，无法加入 / 退出 |
| 6 | `创建抽奖` 时把开奖时间填成过去 | 提示「开奖时间不能早于现在，请重新填写」 |
| 7 | 参与人数少于奖品数时开奖 | 只抽出与人数相同的名额，没有人重复中奖 |
| 8 | `抽奖详情 <编号>` / `抽奖成员 <编号>` | 图文两种形态都对；参与名单含头像 + 昵称 + QQ 号 |
| 9 | 启动日志 | 无报错；应能看到 `roll_member` 建唯一索引（首次升级后） |
| 10 | `抽奖接口诊断`（管理员，OneBot 群） | 逐项打印 Cookie / NapCat 荣誉接口 / QQ 网页接口的可用性 |

冒烟发现问题的处理：修复 → 本地 `npm test` → commit →（确认后）push → 视情况打补丁版本（`1.0.1`）。

## 6. 常见问题

- **唯一索引创建失败**（升级前库里已有重复参与记录）：插件仍可运行，只是少了这层保护。清理：
  ```sql
  DELETE FROM roll_member
  WHERE id NOT IN (SELECT MIN(id) FROM roll_member GROUP BY roll_id, user_id);
  ```
- **荣誉取数失败**：先用 `抽奖接口诊断` 看 Cookie / `bkn` / 接口返回；这是 QQ 网页接口变动导致的，
  与插件版本无关，可在控制台把 `join.onFetchError` 设为「放行」先保证正常用户能参与。
- **图片两侧有背景 / 字体偏小**：调 `render.width`（默认 420，越小群里字体显示越大）。
