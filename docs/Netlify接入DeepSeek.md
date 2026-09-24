# Netlify 接入 DeepSeek：按顺序完成

当前网站：使用 Netlify CLI 或代码仓库部署后，在 Netlify 控制台查看你的站点地址。

新版包含 Netlify Functions，不能只上传 out 文件夹；需要通过 Netlify CLI 或代码仓库完整部署。

## 第一步：在 Netlify 后台填写密钥

1. 登录 Netlify，进入你的 Netlify 项目。
2. 打开 **Project configuration → Environment variables**（部分界面显示 Project settings）。
3. 添加以下变量。如果界面提供 Scopes，确保包含 **Functions**；上下文选择 **Production** 或所有上下文。

| Key | Value |
| --- | --- |
| DEMO_MODE | false |
| DEEPSEEK_API_KEY | 你的完整 DeepSeek API Key |
| DEEPSEEK_MODEL | deepseek-v4-flash |

4. 若能标记 Secret，把 `DEEPSEEK_API_KEY` 标为敏感值。不要勾选在网页中公开，不要改成 `VITE_DEEPSEEK_API_KEY`。
5. 保存，随后按第二步重新部署。修改环境变量后需要重新部署才保证新函数使用新配置。

### 出现“密钥无效”时按这个顺序检查

1. 在 DeepSeek 控制台确认这枚 Key 仍处于启用状态、属于有余额的账号；如果密钥曾经出现在聊天、截图或代码文件中，请先撤销旧 Key，再新建一枚。
2. Netlify 变量名必须严格是 `DEEPSEEK_API_KEY`，值只粘贴完整 Key，不要写成 `DEEPSEEK_API_KEY=...`，也不要包含 Markdown 反引号。
3. 变量的 Scope/Context 必须包含 **Functions + Production**。只勾选 Builds 时，网页能打开但函数拿不到正确密钥。
4. 保存变量后到 **Deploys → Trigger deploy → Deploy site** 重新部署；仅刷新网页不会让运行中的函数读取新值。
5. 重新部署后打开 `https://你的站点.netlify.app/api/config`。能返回 JSON 且生成请求仍报 401，通常表示 Key 已撤销、复制不完整或账号余额/权限异常；请在 Netlify Functions 日志确认请求状态。

**线上 Key 不需要修改任何 Vue 文件，也不需要发给助手。** 根目录 `.env` 用于本机运行；修改它不能更新已经部署的网站。

## 第二步：更新已有 Netlify 项目

最方便：双击项目根目录的 **部署到Netlify.cmd**。脚本会检查登录状态，未登录时引导你在浏览器授权，然后构建并更新已有项目。授权需要你本人确认，不需要把 Token 发到聊天里。

也可以在项目目录用 PowerShell 手动执行：

```powershell
npm.cmd ci
npx.cmd netlify login
npm.cmd run build:netlify
npx.cmd netlify deploy --prod --no-build --dir=out --functions=netlify/functions
```

部署时 Netlify CLI 会使用当前登录账号关联的项目；如果 CLI 提示找不到项目，请确认当前登录账号拥有此项目，或在项目后台复制 Project ID 后通过 `--site` 指定。

## 第三步：确认生效

1. 部署完成后打开部署后的网址并刷新。
2. 页面应从“演示体验”变为“AI 评价助手”。
3. 选择一个标签，生成一次评价。成功返回即表明函数可调用 DeepSeek。
4. 若页面仍是演示模式，检查 DEMO_MODE 是否为 false，以及是否完整部署了函数。
5. `/api/config` 应返回公开配置；如果返回 404 或网页 HTML，说明函数没有随页面一起部署。
6. 生成失败时在 Netlify 的 Functions 日志查看状态；不要复制包含密钥的截图或配置。

## 代码与运行边界

- `netlify.toml`：Netlify 构建和函数打包配置。
- `netlify/functions/shop-config.mjs`：`/api/config`，只返回公开信息。
- `netlify/functions/reviews.mjs`：`/api/reviews`，平台边缘限流每个 IP/域名每分钟 10 次。
- `server/netlify-handler.js`：参数检查、读取环境变量、请求 DeepSeek、标准化错误。所有模型请求共用 45 秒预算，以适配 Netlify 同步函数 60 秒运行上限。
- `src/api.js`：请求本站 API（Netlify Functions）。
- 企业微信仍默认关闭。若启用，通过 `context.waitUntil` 异步通知，但受同一函数时间上限约束，不保证重试送达。

Netlify 免费额度和 DeepSeek API 余额是两回事：真实生成会消耗 DeepSeek 账户余额，使用量也受 Netlify 当前免费套餐额度约束。项目未设置自动付费升级。

参考：
- https://docs.netlify.com/build/functions/api/
- https://docs.netlify.com/build/functions/optional-configuration/
