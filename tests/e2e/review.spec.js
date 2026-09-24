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
  await expect(page.getByText('标签或平台已更改')).toBeVisible();
  await expect(page.getByRole('button', { name: /复制文案并打开平台/ })).toBeDisabled();
  await page.getByRole('button', { name: '重新生成评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(/服务好贴心/);
  await expect(page.getByRole('textbox', { name: '评价内容' })).not.toHaveValue(/friendly/);
  await settleAnimations(page);
  await page.screenshot({ path: 'docs/生成结果预览.png', fullPage: true });
});

test('复制后打开平台，弹窗拦截时提供手动链接', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // 拦截目标页面：验证跳转机制，不访问外部平台，也不提交任何评价。
  await context.route('https://www.xiaohongshu.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>平台测试入口</p>' }));
  await page.goto('/');
  await page.getByRole('button', { name: '服务好' }).click();
  await page.getByRole('radio', { name: /小红书/ }).check();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('textbox')).toHaveValue(/服务好/);
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
  await expect(page.getByRole('textbox')).toHaveValue(/friendly/);
  await page.getByRole('textbox').fill('已修改的内容');
  await page.route('**/api/reviews', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: '生成服务暂不可用，请稍后重试。' }) }));
  await page.getByRole('button', { name: '重新生成评价' }).click();
  await expect(page.getByRole('alert')).toContainText('暂不可用');
  await expect(page.getByRole('textbox')).toHaveValue('已修改的内容');
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
  await expect(page.getByRole('textbox')).toHaveValue(/茶香浓郁/);
  await page.getByRole('textbox').fill('茶'.repeat(151));
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: /复制文案并打开平台/ })).toBeDisabled();
  await expect(page.getByText('请将文案缩减至')).toBeVisible();
});
