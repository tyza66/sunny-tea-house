import { test, expect } from '@playwright/test';
import { settleAnimations } from './settle.js';

// 静态托管（GitHub Pages 等）场景：/api/config 返回 404，前端回退到本地演示配置，
// 右下角设置面板代替环境变量：服务商地址、模型名与密钥都在面板里配，
// 由浏览器直连 AI 服务完成真实生成，请求不经过本站任何服务器。
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

// 按状态码响应 AI 接口；预检请求放行但不记录，真实载荷只在 POST 时发出。
function stubAi(page, requests, status, body) {
  return page.route('https://api.deepseek.com/chat/completions', route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    requests.push({ headers: route.request().headers(), body: JSON.parse(route.request().postData() || '{}') });
    route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  });
}

const keyInput = page => page.getByRole('textbox', { name: /AI 密钥/ });
const aiActive = page => page.locator('.ai-active');

test.use({ locale: 'zh-CN' });

test('静态托管：设置面板保存密钥后经浏览器直连生成真实初稿', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.route('https://www.google.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>google store</p>' }));
  await useStaticHost(page);
  const requests = [];
  await stubAi(page, requests, 200, { choices: [{ message: { content: AI_DRAFT } }] });
  await page.goto('/');
  await page.getByRole('button', { name: '配置 AI 密钥' }).click();
  await expect(page.getByText('本地配置')).toBeVisible();
  await keyInput(page).fill('sk-too-short');
  await page.getByRole('button', { name: '保存并启用' }).click();
  await expect(page.getByRole('alert')).toContainText('密钥格式不正确');
  await keyInput(page).fill(KEY);
  await page.getByRole('button', { name: '保存并启用' }).click();
  await expect(aiActive(page)).toBeVisible();
  await expect(aiActive(page)).toContainText('AI 直连已启用');
  await expect(aiActive(page)).toContainText('本次会话已生成 0');
  await expect(page.getByRole('status')).toContainText('已保存');
  await expect(page.getByText('本地配置')).toBeHidden();
  // 密钥只以混淆形式写进本机浏览器：存储里有记录，但任何位置都找不到原文。
  const stored = await page.evaluate(() => JSON.stringify(window.localStorage));
  expect(stored).toContain('yichayiyan.settings');
  expect(stored).not.toContain(KEY);
  // 存进去的确实是混淆后的形态：密钥原文不在存储里，混淆值与原值不同。
  const obscured = await page.evaluate(() => JSON.parse(localStorage.getItem('yichayiyan.settings')).key);
  expect(obscured).toBeTruthy();
  expect(obscured).not.toBe(KEY);
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
  await expect(aiActive(page)).toContainText('本次会话已生成 1');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /复制文案并打开平台/ }).click();
  await expect(page.getByRole('status')).toContainText('文案已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(AI_DRAFT);
  // 清除密钥：本机存储里那份一并移除，回到示例文案。
  await page.getByRole('button', { name: '打开本地设置' }).click();
  await page.getByRole('button', { name: '清除密钥' }).click();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('button', { name: '配置 AI 密钥' })).toBeVisible();
  const before = requests.length;
  await page.getByRole('button', { name: '重新生成评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(/friendly/);
  await expect(page.getByText('演示初稿 · 请核对内容')).toBeVisible();
  expect(requests).toHaveLength(before);
});

test('静态托管：密钥被拒绝时提示并重新弹出填写面板', async ({ page }) => {
  await useStaticHost(page);
  const requests = [];
  await stubAi(page, requests, 401, { error: 'authentication_error' });
  await page.goto('/');
  await page.getByRole('button', { name: '配置 AI 密钥' }).click();
  await keyInput(page).fill(KEY);
  await page.getByRole('button', { name: '保存并启用' }).click();
  await expect(aiActive(page)).toBeVisible();
  await page.getByRole('button', { name: '服务好' }).click();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('alert')).toContainText('密钥无效或已失效');
  // 面板自动重新打开，焦点直接落在密钥框，让评审者当场换一把。
  await expect(keyInput(page)).toBeVisible();
  await expect(keyInput(page)).toBeFocused();
  await expect(page.getByRole('button', { name: '配置 AI 密钥' })).toBeVisible();
  await stubAi(page, requests, 200, { choices: [{ message: { content: AI_DRAFT } }] });
  await keyInput(page).fill(KEY);
  await page.getByRole('button', { name: '保存并启用' }).click();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue(AI_DRAFT);
});

test('静态托管：设置面板支持键盘打开、Esc 与关闭按钮并归还焦点', async ({ page }) => {
  await useStaticHost(page);
  await page.goto('/');
  const fab = page.getByRole('button', { name: '打开本地设置' });
  await expect(fab).toHaveAttribute('aria-expanded', 'false');
  await fab.click();
  // 打开后焦点落在第一个字段，键盘用户不必再按 Tab；Esc 关闭并归还焦点。
  await expect(page.getByRole('textbox', { name: '店铺名' })).toBeFocused();
  await expect(fab).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByText('本地配置')).toBeHidden();
  await expect(fab).toBeFocused();
  await expect(fab).toHaveAttribute('aria-expanded', 'false');
  // 关闭按钮同样归还焦点。
  await fab.click();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByText('本地配置')).toBeHidden();
  await expect(fab).toBeFocused();
  // 点击面板以外的区域同样收起，且不抢走焦点。
  await fab.click();
  await expect(page.getByText('本地配置')).toBeVisible();
  await page.locator('.site-header').click();
  await expect(page.getByText('本地配置')).toBeHidden();
  await expect(fab).toHaveAttribute('aria-expanded', 'false');
});

test('手机：设置面板不产生横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useStaticHost(page);
  await page.goto('/');
  await page.getByRole('button', { name: '配置 AI 密钥' }).click();
  await expect(page.getByText('填域名或路径前缀即可')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await settleAnimations(page);
  await page.screenshot({ path: 'docs/设置面板.png', fullPage: true });
});
