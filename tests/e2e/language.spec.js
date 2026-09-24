import { test, expect } from '@playwright/test';

const UI_LABELS = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  'fr-CA': 'Français (Canada)',
  es: 'Español',
};

const cases = [
  { code: 'zh-CN', heading: '哪些感受让你印象深刻？', generate: '生成我的评价', fragment: '服务好', unavailable: '暂不可用' },
  { code: 'zh-TW', heading: '哪些感受讓你印象深刻？', generate: '產生我的評價', fragment: '服務好', unavailable: '暫時無法使用' },
  { code: 'en', heading: 'What stood out?', generate: 'Create my review', fragment: 'friendly', unavailable: 'unavailable' },
  { code: 'fr-CA', heading: 'Qu’est-ce qui vous a marqué?', generate: 'Créer mon avis', fragment: 'attentionné', unavailable: 'indisponible' },
  { code: 'es', heading: '¿Qué te llamó la atención?', generate: 'Crear mi reseña', fragment: 'amable', unavailable: 'no está disponible' },
];

async function switchUiLanguage(page, code) {
  await page.locator('.globe-button').click();
  await page.getByRole('menuitemradio', { name: UI_LABELS[code] }).click();
}

// 方案3：评价语言是编辑区内的一段式控件（radio 组），替代原下拉框。
async function selectReviewLanguage(page, code) {
  await page.getByRole('radio', { name: UI_LABELS[code] }).click();
}

for (const item of cases) {
  test(`${item.code}：界面、输出语言、保留草稿、错误翻译与偏好保存`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    // 用桩拦截生成，避免真实服务 10 次/分钟限流干扰断言；仍能从请求中读到所选语言。
    // failNext=true 时返回 502，模拟上游服务失败。
    let failNext = false;
    await page.route('**/api/reviews', route => {
      if (failNext) { failNext = false; return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: '生成服务暂不可用，请稍后重试。' }) }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: item.fragment, platform: 'Google', language: item.code, demo: true }) });
    });
    await switchUiLanguage(page, item.code);
    await expect(page.locator('html')).toHaveAttribute('lang', item.code);
    await expect(page.getByText(item.heading)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.tag').first().click();
    // 生成前先选评价语言。
    await selectReviewLanguage(page, item.code);
    const request = page.waitForRequest(req => req.url().endsWith('/api/reviews'));
    await page.locator('.generate').click();
    expect((await request).postDataJSON().language).toBe(item.code);
    await expect(page.getByRole('textbox')).toHaveValue(new RegExp(item.fragment));
    await expect(page.getByRole('textbox')).toHaveAttribute('lang', item.code);
    const text = await page.getByRole('textbox').inputValue();
    await page.getByRole('checkbox').check();
    // 仅切换界面不会清空、翻译或作废原草稿。
    await switchUiLanguage(page, item.code === 'en' ? 'zh-CN' : 'en');
    await expect(page.getByRole('textbox')).toHaveValue(text);
    await expect(page.locator('.copy')).toBeEnabled();
    await switchUiLanguage(page, item.code);
    // 切换评价语言 → 初稿标记过期、暂停复制，需重新生成。
    await selectReviewLanguage(page, item.code === 'en' ? 'fr-CA' : 'en');
    await expect(page.locator('.warning')).toBeVisible();
    await expect(page.locator('.copy')).toBeDisabled();
    await selectReviewLanguage(page, item.code);
    // 模拟服务失败，验证错误按当前界面语言呈现，且不丢失文案。
    failNext = true;
    await page.locator('.generate').click();
    await expect(page.getByRole('alert')).toContainText(item.unavailable);
    await expect(page.getByRole('textbox')).toHaveValue(text);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', item.code);
    await page.locator('.globe-button').click();
    await expect(page.getByRole('menuitemradio', { name: UI_LABELS[item.code] })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    // 评价语言偏好已保存：重载后生成仍使用所选语言。
    await page.locator('.tag').first().click();
    const request2 = page.waitForRequest(req => req.url().endsWith('/api/reviews'));
    await page.locator('.generate').click();
    expect((await request2).postDataJSON().language).toBe(item.code);
    if (item.code === 'fr-CA') {
      await page.screenshot({ path: 'docs/法语手机预览.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: 'docs/法语桌面预览.png', fullPage: true });
    }
  });
}

test('加拿大法语浏览器首次访问自动匹配语言', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-CA' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4320/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CA');
  await expect(page.locator('.globe-button')).toHaveAttribute('aria-label', /Français \(Canada\)/);
  await context.close();
});

test('手机：语言图标位于头部右上角且与品牌同行，菜单不越界', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const brand = await page.locator('.brand').boundingBox();
  const meta = await page.locator('.header-meta').boundingBox();
  const button = await page.locator('.globe-button').boundingBox();
  // 右上角：头部操作簇贴近视口右侧、位于顶部一行，与品牌垂直居中于同一行。
  expect(meta.x + meta.width).toBeGreaterThanOrEqual(330);
  expect(meta.y).toBeLessThan(80);
  expect(Math.abs(brand.y + brand.height / 2 - (meta.y + meta.height / 2))).toBeLessThan(30);
  // 语言图标本身也完整落在视口内，与主题开关同排。
  expect(button.x).toBeGreaterThanOrEqual(0);
  expect(button.x + button.width).toBeLessThanOrEqual(390);
  await page.locator('.globe-button').click();
  const menu = page.locator('.language-menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('深浅模式：切换开关切换主题并记忆偏好', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const toggle = page.locator('.theme-toggle');
  await expect(toggle).toHaveAttribute('role', 'switch');
  const initial = await html.getAttribute('data-theme');
  expect(['light', 'dark']).toContain(initial);
  const toggled = initial === 'dark' ? 'light' : 'dark';
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', toggled);
  await expect(toggle).toHaveAttribute('aria-checked', toggled === 'dark' ? 'true' : 'false');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', toggled);
});

test('语言菜单：当前语言打勾，方向键/Esc/点击外部与页面其余操作协同', async ({ page }) => {
  await page.goto('/');
  await page.locator('.globe-button').click();
  const menu = page.locator('.language-menu');
  await expect(menu).toBeVisible();
  const activeText = await page.evaluate(() => document.querySelector('.language-menu [aria-checked="true"]')?.textContent?.trim());
  expect(activeText).toBeTruthy();
  const index = () => page.evaluate(() => [...document.querySelectorAll('.language-menu button')].indexOf(document.activeElement));
  const before = await index();
  await page.keyboard.press('ArrowDown');
  expect(await index()).toBe((before + 1) % 5);
  await page.keyboard.press('ArrowUp');
  expect(await index()).toBe(before);
  // Esc 收起菜单并把焦点还给语言图标。
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('.globe-button')).toBeFocused();
  // 再次点击图标展开；点击页面其它位置自动收起，不遮挡、不干扰其余操作。
  await page.locator('.globe-button').click();
  await expect(menu).toBeVisible();
  await page.locator('main').click({ position: { x: 30, y: 30 } });
  await expect(menu).toBeHidden();
  // 菜单已让位：页面其它操作可直接点击，不受遮挡。
  await page.locator('.tag').first().click();
  await expect(page.locator('.tag').first()).toHaveAttribute('aria-pressed', 'true');
});
