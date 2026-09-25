# 接入 AI 服务商：按顺序完成

本项目通过一组通用的 `AI_*` 环境变量对接任何 **OpenAI 兼容**服务商（官方 `/chat/completions` 接口 + `Bearer` 认证）。默认值即 DeepSeek，换服务商只改变量、不改代码。

当前网站：使用 Netlify CLI 或代码仓库部署后，在 Netlify 控制台查看你的站点地址。

新版包含 Netlify Functions，不能只上传 out 文件夹；需要通过 Netlify CLI 或代码仓库完整部署。

## 第一步：在 Netlify 后台填写密钥

1. 登录 Netlify，进入你的 Netlify 项目。
2. 打开 **Project configuration → Environment variables**（部分界面显示 Project settings）。
3. 添加以下变量。如果界面提供 Scopes，确保包含 **Functions**；上下文选择 **Production** 或所有上下文。

| Key | Value | 说明 |
| --- | --- | --- |
| DEMO_MODE | false | Netlify 路径固定真实模式 |
| AI_API_KEY | 你的完整 API Key | 只由服务端函数读取，绝不发给浏览器 |
| AI_MODEL | deepseek-v4-flash | 可选，服务商支持的模型名 |
| AI_BASE_URL | https://api.deepseek.com | 可选，换服务商时只改这一行 |

4. 若能标记 Secret，把 `AI_API_KEY` 标为敏感值。不要勾选在网页中公开，不要改成 `VITE_AI_API_KEY`。
5. 旧部署里的 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` 仍作别名有效，可以继续用；新配置建议直接写 `AI_*`。
6. 保存，随后按第二步重新部署。修改环境变量后需要重新部署才保证新函数使用新配置。

常用 OpenAI 兼容服务商的 `AI_BASE_URL` 示例（以各平台文档为准）：

| 服务商 | AI_BASE_URL | AI_MODEL 示例 |
| --- | --- | --- |
| DeepSeek（默认） | https://api.deepseek.com | deepseek-v4-flash |
| OpenAI | https://api.openai.com/v1 | gpt-4o-mini |
| 阿里百炼 / 通义 | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus |
| 智谱 | https://open.bigmodel.cn/api/paas/v4 | glm-4-air |
| 本机自建（vLLM/Ollama） | http://127.0.0.1:8000/v1 | 自定 |

公网 `AI_BASE_URL` 必须是 HTTPS；仅本机/内网自建服务允许 HTTP。

### 出现“密钥无效”时按这个顺序检查

1. 在服务商控制台确认这枚 Key 仍处于启用状态、属于有余额的账号；如果密钥曾经出现在聊天、截图或代码文件中，请先撤销旧 Key，再新建一枚。
2. Netlify 变量名必须严格是 `AI_API_KEY`，值只粘贴完整 Key，不要写成 `AI_API_KEY=...`，也不要包含 Markdown 反引号。
3. 变量的 Scope/Context 必须包含 **Functions + Production**。只勾选 Builds 时，网页能打开但函数拿不到正确密钥。
4. 保存变量后到 **Deploys → Trigger deploy → Deploy site** 重新部署；仅刷新网页不会让运行中的函数读取新值。
5. 重新部署后打开 `https://你的站点.netlify.app/api/config`。能返回 JSON 且生成请求仍报 401，通常表示 Key 已撤销、复制不完整或账号余额/权限异常；请在 Netlify Functions 日志确认请求状态。
6. 换过服务商仍失败时，先核对 `AI_BASE_URL` 是否需要带 `/v1` 路径、`AI_MODEL` 是否为该账号可用的模型。

**线上 Key 不需要修改任何 Vue 文件，也不需要发给助手。** 仓库里没有 `.env` 文件，配置只存在于 Netlify 环境变量；改动环境变量后必须重新部署才会生效。

## 第二步：更新已有 Netlify 项目

推荐用仓库连接，让 Netlify 自己构建，本地不需要任何操作：

1. Netlify 后台 **Project configuration → Build & deploy → Continuous Deployment**，把仓库 `tyza66/sunny-tea-house` 关联到站点。
2. 之后每次推送 `main`，Netlify 自动执行 `netlify.toml` 里的 `npm run build:netlify`，同时发布 `out/` 页面与 `netlify/functions` 函数。
3. 改过环境变量后，到 **Deploys → Trigger deploy → Deploy site** 触发一次，运行中的函数才会读到新值。

如果站点原本是 CLI 手动部署的，也可以继续用 Netlify CLI（需要本机 Node.js 22+）：

```bash
npm ci
npx netlify login
npm run build:netlify
npx netlify deploy --prod --no-build --dir=out --functions=netlify/functions
```

部署时 Netlify CLI 会使用当前登录账号关联的项目；如果 CLI 提示找不到项目，请确认当前登录账号拥有此项目，或在项目后台复制 Project ID 后通过 `--site` 指定。

## 第三步：确认生效

1. 部署完成后打开部署后的网址并刷新。
2. 页面应从“演示体验”变为“AI 评价助手”。
3. 选择一个标签，生成一次评价。成功返回即表明函数可调用所配置的 AI 服务商。
4. 若页面仍是演示模式，检查 DEMO_MODE 是否为 false，以及是否完整部署了函数。
5. `/api/config` 应返回公开配置；如果返回 404 或网页 HTML，说明函数没有随页面一起部署。
6. 生成失败时在 Netlify 的 Functions 日志查看状态；不要复制包含密钥的截图或配置。

## 代码与运行边界

- `netlify.toml`：Netlify 构建和函数打包配置。
- `netlify/functions/shop-config.mjs`：`/api/config`，只返回公开信息。
- `netlify/functions/reviews.mjs`：`/api/reviews`，平台边缘限流每个 IP/域名每分钟 10 次。
- `server/netlify-handler.js`：参数检查、读取 `AI_*` 环境变量、请求所配置的 AI 服务商、标准化错误。所有模型请求共用 45 秒预算，以适配 Netlify 同步函数 60 秒运行上限。
- `src/api.js`：请求本站 API（Netlify Functions）。
- 企业微信仍默认关闭。若启用，通过 `context.waitUntil` 异步通知，但受同一函数时间上限约束，不保证重试送达。

Netlify 免费额度和 AI 服务商余额是两回事：真实生成会消耗服务商账户余额，使用量也受 Netlify 当前免费套餐额度约束。项目未设置自动付费升级。

参考：
- https://docs.netlify.com/build/functions/api/
- https://docs.netlify.com/build/functions/optional-configuration/
