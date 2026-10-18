const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

async function openApp(page, hour = 12) {
  await page.clock.setFixedTime(new Date(2026, 9, 18, hour));
  await page.goto('/');
  await expect(page.locator('#timeline')).toContainText('Nog geen momenten');
}

test('application starts without JavaScript errors; reflection has four questions', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page);
  await page.locator('#reflect').click();
  await expect(page.locator('#kind')).toHaveValue('Weekreflectie');
  await expect(page.locator('#title')).toHaveValue('Weekreflectie');
  await expect(page.locator('#note')).toHaveValue('Wat gaf energie?\n\nWat kostte energie?\n\nWelk beeld wil ik bewaren?\n\nWat wil ik één keer herhalen?');
  await expect(page.locator('#note')).toBeFocused();
  expect(errors).toEqual([]);
});

test('text persists after reload', async ({ page }) => {
  await openApp(page);
  await page.locator('#kind').selectOption('Tekstnotitie');
  await page.locator('#title').fill('Testmoment');
  await page.locator('#note').fill('Eén kleine stap.');
  await page.locator('#energy').selectOption('6');
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('Bewaard');
  await page.reload();
  await expect(page.locator('#timeline')).toContainText('Testmoment');
  await expect(page.locator('#timeline')).toContainText('energie 6/10');
});

test('photo persists; export, delete and import restore it', async ({ page }) => {
  await openApp(page);
  const image = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 30;
    c.getContext('2d').fillRect(0, 0, 40, 30);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#photo').setInputFiles({ name: 'synthetic-test.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await page.locator('#title').fill('Testbeeld');
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('Bewaard');
  await page.reload();
  const img = page.locator('#timeline img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate(el => el.naturalWidth)).toBeGreaterThan(0);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPromise;
  const backup = await fs.readFile(await download.path());
  const parsed = JSON.parse(backup.toString());
  expect(parsed.app).toBe('KIMPACT');
  expect(parsed.entries).toHaveLength(1);
  expect(parsed.entries[0].image).toMatch(/^data:image\/jpeg;base64,/);
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Verwijder dit moment' }).click();
  await expect(page.locator('#timeline')).toContainText('Nog geen momenten');
  await page.locator('#import').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await expect(page.locator('#status')).toContainText('Import voltooid');
  await expect(page.locator('#timeline')).toContainText('Testbeeld');
  await expect(page.locator('#timeline img')).toBeVisible();
  await page.locator('#import').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await expect(page.locator('#status')).toContainText('Import voltooid');
  await expect(page.locator('#timeline article')).toHaveCount(1);
});

test('invalid backup is rejected without changing entries', async ({ page }) => {
  await openApp(page);
  await page.locator('#import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await expect(page.locator('#status')).toContainText('Import mislukt');
  await expect(page.locator('#timeline article')).toHaveCount(0);
});

test('night mode hides activating prompts', async ({ page }) => {
  await openApp(page, 23);
  await expect(page.locator('#promptBox')).toBeHidden();
  await expect(page.locator('#theory')).toBeHidden();
  await expect(page.locator('#note')).toBeVisible();
});
