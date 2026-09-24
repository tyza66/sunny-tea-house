import { test, expect } from '@playwright/test';
import { settleAnimations } from './settle.js';

// 静态托管（GitHub Pages 等）场景：/api/config 返回 404，前端回退到本地演示配置，
// 并提供「评审者自带密钥」入口，由浏览器直连 DeepSeek 真实生成。
const KEY = 'sk-e2e0123456789abcdefghij';
const AI_DRAFT = 'Stopped by after class for an iced tea. The staff were patient while I picked a drink, and the order came out quickly. The space was clean and easy to settle into. I would come back.';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': '*',
};

async function useStaticHost(page) {
  await page.route('**/api/config', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
}

test.use({ locale: 'zh-CN' });

test('静态托管：自带密钥经浏览器直连生成真实初稿', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.route('https://www.google.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>google store</p>' }));
  await useStaticHost(page);
  const requests = [];
  await page.route('https://api.deepseek.com/chat/completions', route => {
    // 预检请求放行但不记录：真实载荷只在 POST 时发出。
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    requests.push({ headers: route.request().headers(), body: JSON.parse(route.request().postData() || '{}') });
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ choices: [{ message: { content: AI_DRAFT } }] }) });
  });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '使用我自己的 AI 密钥' });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByText('自带密钥的真实生成')).toBeVisible();
  await page.getByRole('textbox', { name: /DeepSeek 密钥/ }).fill('sk-too-short');
  await page.getByRole('button', { name: '启用真实生成' }).click();
  await expect(page.getByRole('alert')).toContainText('密钥格式不正确');
  await page.getByRole('textbox', { name: /DeepSeek 密钥/ }).fill(KEY);
  await page.getByRole('button', { name: '启用真实生成' }).click();
  const active = page.locator('.byok-active');
  await expect(active.getByText('已启用自带密钥的真实生成')).toBeVisible();
  await expect(page.getByText('本次会话已生成 0')).toBeVisible();
  // 密钥只进页面内存：浏览器存储里任何痕迹都不允许出现。
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).not.toContain(KEY);
  expect(await page.evaluate(() => JSON.stringify(window.sessionStorage))).not.toContain(KEY);
  await page.getByRole('button', { name: '服务好' }).click();
  await page.getByRole('button', { name: '出餐快' }).click();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(AI_DRAFT);
  await expect(page.getByText('AI 初稿 · 请核对内容')).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].headers.authorization).toBe('Bearer ' + KEY);
  expect(requests[0].body.model).toBe('deepseek-v4-flash');
  expect(requests[0].body.messages[1].content).toContain('服务好');
  expect(requests[0].body.messages[1].content).toContain('出餐快');
  await expect(page.getByText('本次会话已生成 1')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /复制文案并打开平台/ }).click();
  await expect(page.getByRole('status')).toContainText('文案已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(AI_DRAFT);
  await page.getByRole('button', { name: '管理我的密钥' }).click();
  await page.getByRole('button', { name: '移除密钥' }).click();
  await expect(page.getByRole('button', { name: '使用我自己的 AI 密钥' })).toBeVisible();
  const before = requests.length;
  await page.getByRole('button', { name: '重新生成评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(/friendly/);
  await expect(page.getByText('演示初稿 · 请核对内容')).toBeVisible();
  expect(requests).toHaveLength(before);
});

test('静态托管：密钥被拒绝时提示并重新弹出填写面板', async ({ page }) => {
  await useStaticHost(page);
  await page.route('https://api.deepseek.com/chat/completions', route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    route.fulfill({ status: 401, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: 'authentication_error' }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '使用我自己的 AI 密钥' }).click();
  await page.getByRole('textbox', { name: /DeepSeek 密钥/ }).fill(KEY);
  await page.getByRole('button', { name: '启用真实生成' }).click();
  await expect(page.getByText('已启用自带密钥的真实生成').first()).toBeVisible();
  await page.getByRole('button', { name: '服务好' }).click();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('alert')).toContainText('密钥无效或已失效');
  await expect(page.getByRole('textbox', { name: /DeepSeek 密钥/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '使用我自己的 AI 密钥' })).toBeVisible();
  // 换一把密钥现场续上：同一会话内从失败恢复到真实生成。
  await page.route('https://api.deepseek.com/chat/completions', route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ choices: [{ message: { content: AI_DRAFT } }] }) });
  });
  await page.getByRole('textbox', { name: /DeepSeek 密钥/ }).fill(KEY);
  await page.getByRole('button', { name: '启用真实生成' }).click();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(AI_DRAFT);
});

test('手机：自带密钥面板不产生横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useStaticHost(page);
  await page.goto('/');
  await page.getByRole('button', { name: '使用我自己的 AI 密钥' }).click();
  await expect(page.getByText('密钥只保存在当前页面内存中')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await settleAnimations(page);
  await page.screenshot({ path: 'docs/自带密钥面板.png', fullPage: true });
});
