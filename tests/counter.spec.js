const { test, expect } = require('@playwright/test');

test('Кнопка «Добавить» увеличивает счётчик на один', async ({ page }) => {
  await page.setContent(`
    <button onclick="document.querySelector('output').value++">Добавить</button>
    <output aria-label="Количество">0</output>
  `);

  const quantity = page.getByLabel('Количество');
  await expect(quantity).toHaveText('0');
  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(quantity).toHaveText('1');
});
