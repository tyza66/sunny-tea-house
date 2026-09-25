import { test, expect } from '@playwright/test';

// 静态托管（GitHub Pages 等）里的「环境变量」：设置面板写进本机 localStorage 的配置，
// 要同时照顾好三件事——界面立即反映、刷新后续上、留空即视为清除。
const KEY = 'sk-e2e0123456789abcdefghij';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': '*',
};

async function useStaticHost(page) {
  await page.route('**/api/config', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
}

const keyInput = page => page.getByRole('textbox', { name: /AI 密钥/ });
const baseUrlInput = page => page.getByRole('textbox', { name: '接口地址（OpenAI 兼容）' });
const aiActive = page => page.locator('.ai-active');
const savedSettings = page => page.evaluate(() => JSON.parse(localStorage.getItem('sunny.settings')) || {});

test.use({ locale: 'zh-CN' });

test('店铺信息保存后即时反映到页头页脚，刷新仍在，恢复默认还原', async ({ page }) => {
  await useStaticHost(page);
  await page.goto('/');
  await page.getByRole('button', { name: '打开本地设置' }).click();
  await page.getByRole('textbox', { name: '店铺名' }).fill('Hill Tea');
  await page.getByRole('textbox', { name: '城市' }).fill('Fremont');
  await page.getByRole('button', { name: '保存并启用' }).click();
  await expect(page.locator('.site-header')).toContainText('Hill Tea');
  await expect(page.locator('footer')).toContainText('Hill Tea');
  await expect(page.locator('footer')).toContainText('Fremont');
  await expect(page).toHaveTitle(/Hill Tea/);
  expect(await savedSettings(page)).toMatchObject({ storeName: 'Hill Tea', storeCity: 'Fremont' });
  await page.reload();
  await expect(page.locator('.site-header')).toContainText('Hill Tea');
  await expect(page.locator('footer')).toContainText('Fremont');
  await page.getByRole('button', { name: '打开本地设置' }).click();
  await page.getByRole('button', { name: '恢复默认' }).click();
  await expect(page.locator('.site-header')).toContainText('Sunny Tea House');
  await expect(page.locator('footer')).toContainText('San Jose');
});

test('保存的密钥刷新后续上，接口地址与模型名也按本机配置走', async ({ page }) => {
  await useStaticHost(page);
  await page.route('https://api.deepseek.com/v1/chat/completions', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({ choices: [{ message: { content: 'Hill Tea draft.' } }] }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '配置 AI 密钥' }).click();
  await baseUrlInput(page).fill('https://api.deepseek.com/v1');
  await page.getByRole('textbox', { name: '模型名' }).fill('deepseek-v4-flash');
  await keyInput(page).fill(KEY);
  await page.getByRole('button', { name: '保存并启用' }).click();
  await expect(aiActive(page)).toBeVisible();
  await page.reload();
  // 刷新后不用再打开面板，AI 直连直接续上；密钥框带出已存密钥（明文便于核对）。
  await expect(aiActive(page)).toBeVisible();
  await expect(aiActive(page)).toContainText('本次会话已生成 0');
  await page.getByRole('button', { name: '打开本地设置' }).click();
  await expect(keyInput(page)).toHaveValue(KEY);
  await expect(baseUrlInput(page)).toHaveValue('https://api.deepseek.com/v1');
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '服务好' }).click();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('textbox', { name: '评价内容' })).toHaveValue('Hill Tea draft.');
});

test('清空密钥后保存，本机存储里那份一并移除', async ({ page }) => {
  await useStaticHost(page);
  await page.goto('/');
  await page.getByRole('button', { name: '配置 AI 密钥' }).click();
  await keyInput(page).fill(KEY);
  await page.getByRole('button', { name: '保存并启用' }).click();
  await expect(aiActive(page)).toBeVisible();
  await page.getByRole('button', { name: '打开本地设置' }).click();
  await keyInput(page).fill('');
  await page.getByRole('button', { name: '保存并启用' }).click();
  await expect(page.getByRole('button', { name: '配置 AI 密钥' })).toBeVisible();
  expect(await savedSettings(page)).not.toHaveProperty('key');
  await page.reload();
  await expect(page.getByRole('button', { name: '配置 AI 密钥' })).toBeVisible();
});

test('自定义服务商：按面板填的接口与模型请求，不降级到 DeepSeek 备用模型', async ({ page }) => {
  await useStaticHost(page);
  const requests = [];
  await page.route('https://models.example.org/v1/chat/completions', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    requests.push(JSON.parse(route.request().postData() || '{}'));
    route.fulfill({ status: 400, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({ error: 'model not supported' }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '配置 AI 密钥' }).click();
  await baseUrlInput(page).fill('https://models.example.org/v1');
  await page.getByRole('textbox', { name: '模型名' }).fill('my-model');
  await keyInput(page).fill(KEY);
  await page.getByRole('button', { name: '保存并启用' }).click();
  await page.getByRole('button', { name: '服务好' }).click();
  await page.getByRole('button', { name: '生成我的评价' }).click();
  await expect(page.getByRole('alert')).toContainText('暂不支持所需模型');
  // 自定义模型不通就是服务商自己报错，不该偷偷改打 DeepSeek。
  expect(requests).toHaveLength(1);
  expect(requests[0].model).toBe('my-model');
  expect(requests[0].thinking).toBeUndefined();
  expect(await savedSettings(page)).toMatchObject({ aiBaseUrl: 'https://models.example.org/v1', aiModel: 'my-model' });
});

test('接口地址不合法时原位提示，不写坏已有配置', async ({ page }) => {
  await useStaticHost(page);
  await page.goto('/');
  await page.getByRole('button', { name: '打开本地设置' }).click();
  await baseUrlInput(page).fill('http://api.example.com');
  await page.getByRole('button', { name: '保存并启用' }).click();
  await expect(page.getByRole('alert')).toContainText('公网地址必须使用 HTTPS');
  // 面板保持打开，地址也没被写进去。
  await expect(page.getByText('本地配置')).toBeVisible();
  expect(await savedSettings(page)).not.toHaveProperty('aiBaseUrl');
  await baseUrlInput(page).fill('https://api.example.com/v1/');
  await page.getByRole('button', { name: '保存并启用' }).click();
  await expect(page.getByText('本地配置')).toBeHidden();
  expect((await savedSettings(page)).aiBaseUrl).toBe('https://api.example.com/v1');
});
