import { test, expect } from '@playwright/test';
import { settleAnimations } from './settle.js';
// 主流程固定中文环境；其他语言由 language.spec.js 单独覆盖。
test.use({ locale: 'zh-CN' });

test('桌面：标签限制、生成、编辑、复制与平台切换', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.route('https://www.google.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>google store</p>' }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const generate = page.getByRole('button', { name: '生成我的评价' });
  await expect(generate).toBeDisabled();
  await expect(page.getByText('你的这一杯，值得被记录')).toBeVisible();
  await settleAnimations(page);
  await page.screenshot({ path: 'docs/桌面预览.png', fullPage: true });
  await page.getByRole('button', { name: '服务好' }).click();
  await page.getByRole('button', { name: '出餐快' }).click();
  await expect(page.getByRole('button', { name: '环境干净' })).toBeDisabled();
  await generate.click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(/friendly/);
  await page.getByRole('textbox', { name: '评价内容' }).fill('The service was friendly. My order was ready quickly.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /复制文案并打开平台/ }).click();
  await expect(page.getByRole('status')).toContainText('文案已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('friendly');
  await page.getByRole('radio', { name: /小红书/ }).check();
  await expect(page.getByText('请重新生成后再复制')).toBeVisible();
  await expect(page.getByRole('button', { name: /复制文案并打开平台/ })).toBeDisabled();
  await page.getByRole('button', { name: '重新生成评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(/服务好贴心/);
  await expect(page.getByRole('textbox', { name: '评价内容' })).not.toHaveValue(/friendly/);
  await settleAnimations(page);
  await page.screenshot({ path: 'docs/生成结果预览.png', fullPage: true });
});

test('配置加载失败时展示重连按钮，恢复后正常进入', async ({ page }) => {
  await page.route('**/api/config', route => route.abort());
  await page.goto('/');
  await expect(page.getByText('暂时无法加载店铺信息，请确认服务已启动后重试。')).toBeVisible();
  // 加载失败不能悄悄变成静态演示：此时不应出现本地设置入口。
  await expect(page.getByRole('button', { name: '打开本地设置' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '配置 AI 密钥' })).toHaveCount(0);
  await page.unroute('**/api/config');
  await page.getByRole('button', { name: '重新连接' }).click();
  await expect(page.getByText('你的这一杯，值得被记录')).toBeVisible();
  await expect(page.getByRole('button', { name: '生成我的评价' })).toBeDisabled();
});

test('复制后打开平台，弹窗拦截时提供手动链接', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // 拦截目标页面：验证跳转机制，不访问外部平台，也不提交任何评价。
  await context.route('https://www.xiaohongshu.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>平台测试入口</p>' }));
  await page.goto('/');
  await page.getByRole('button', { name: '服务好' }).click();
  await page.getByRole('radio', { name: /小红书/ }).check();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(/服务好/);
  await page.getByRole('checkbox').check();
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: /复制文案并打开平台/ }).click();
  const popup = await opened;
  await popup.waitForURL('https://www.xiaohongshu.com/');
  await expect(popup.getByText('平台测试入口')).toBeVisible();
  await popup.close();
  await page.evaluate(() => { window.open = () => null; });
  await page.getByRole('button', { name: /复制文案并打开平台/ }).click();
  await expect(page.getByRole('status')).toContainText('浏览器未打开新窗口');
  await expect(page.getByRole('link', { name: /手动打开/ })).toHaveAttribute('href', 'https://www.xiaohongshu.com/');
});

test('失败保留编辑内容，复制失败提供手动方法', async ({ page, context }) => {
  await page.goto('/');
  await context.route('https://www.google.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>google store</p>' }));
  await page.getByRole('button', { name: '服务好' }).click();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(/friendly/);
  await page.getByRole('textbox', { name: '评价内容' }).fill('已修改的内容');
  await page.route('**/api/reviews', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: '生成服务暂不可用，请稍后重试。' }) }));
  await page.getByRole('button', { name: '重新生成评价' }).click();
  await expect(page.getByRole('alert')).toContainText('暂不可用');
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue('已修改的内容');
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('denied')) }));
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /复制文案并打开平台/ }).click();
  await expect(page.getByRole('status')).toContainText('自动复制不可用');
});

test('手机：无横向溢出，小红书编辑字数限制', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('你的这一杯，值得被记录')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await settleAnimations(page);
  await page.screenshot({ path: 'docs/手机预览.png', fullPage: true });
  await page.getByRole('button', { name: '茶香浓郁' }).click();
  await page.getByRole('radio', { name: /小红书/ }).check();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(/茶香浓郁/);
  await page.getByRole('textbox', { name: '评价内容' }).fill('茶'.repeat(151));
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: /复制文案并打开平台/ })).toBeDisabled();
  await expect(page.getByText('请将文案缩减至')).toBeVisible();
});

// 左侧「01 感受」的可选简单点评：可留空，字数按 Unicode 字符计数，改动即让初稿失效。
test('可选简单点评显示计数，改动后初稿失效需重新生成', async ({ page }) => {
  await page.goto('/');
  const note = page.getByRole('textbox', { name: /简单点评/ });
  await expect(note).toBeVisible();
  await expect(note).toHaveValue('');
  await note.fill('茶香很足，想加料');
  await expect(page.locator('.comment-count')).toHaveText('8/25');
  await page.getByRole('button', { name: '服务好' }).click();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(/friendly/);
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: /复制文案并打开平台/ })).toBeEnabled();
  // 演示模式不调用 AI，初稿不含补充原话；但补充必须纳入失效签名，防止文案与输入不一致。
  await expect(page.getByRole('textbox', { name: '评价内容' })).not.toHaveValue(/茶香很足/);
  await note.fill('还想加椰果');
  await expect(page.getByText('点评已更改')).toBeVisible();
  await expect(page.getByRole('button', { name: /复制文案并打开平台/ })).toBeDisabled();
});

// 输入框的 maxlength 只约束正常录入；一旦绕过它直接改 DOM，服务端仍按字符数拒绝，
// 前端展示的是归一化后的中文提示，而不是技术性错误，顾客写下的内容也不会被清掉。
test('简单点评超过 25 字时服务端拒绝并提示，已写内容保留', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '服务好' }).click();
  const note = page.getByRole('textbox', { name: /简单点评/ });
  await page.evaluate(() => {
    const input = document.querySelector('#comment');
    input.value = '茶'.repeat(26);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(note).toHaveValue('茶'.repeat(26));
  await expect(page.locator('.comment-count')).toHaveText('26/25');
  // 确认 26 个字符确实发给了服务端：拒绝来自接口校验，不是浏览器先把内容截断了。
  const request = page.waitForRequest(req => req.url().endsWith('/api/reviews'));
  await page.getByRole('button', { name: '生成我的评价' }).click();
  expect([...(await request).postDataJSON().comment].length).toBe(26);
  await expect(page.getByRole('alert')).toContainText('简单点评请控制在 25 字以内');
  await expect(note).toHaveValue('茶'.repeat(26));
  await expect(page.getByRole('button', { name: '生成我的评价' })).toBeEnabled();
});
