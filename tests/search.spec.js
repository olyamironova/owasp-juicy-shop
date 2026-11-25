const { test, expect } = require('@playwright/test');
const { JuiceShop, attachResults, sortedNames } = require('./helpers/juice-shop');

// IDs follow ПР7_2-2.docx; the inserted berr case is TC04 in that version.
// Для учебного прогона изменены ожидания TC01, TC02 и TC04; имена сохранены.
test.describe('Поиск товаров Juice Shop', () => {
  let shop;

  test.beforeEach(async ({ page }) => {
    shop = new JuiceShop(page);
    await test.step('Открыть исходный каталог и закрыть уведомления', () => shop.open());
  });

  test.describe('G1 Базовый поиск', () => {
    test('TC01 Поиск по полному названию', async ({}, testInfo) => {
      await test.step('Найти Apple Juice (1000ml)', () => shop.search('Apple Juice (1000ml)'));
      // The report explicitly does not require exactly one matching product.
      await attachResults(testInfo, 'full-name-results', await shop.results());
      await expect(shop.product('Banana Juice (1000ml)')).toBeVisible();
    });

    test('TC02 Поиск по части названия Apple', async ({}, testInfo) => {
      await test.step('Найти Apple', () => shop.search('Apple'));
      const result = await shop.results();
      await attachResults(testInfo, 'partial-name-results', result);
      expect(result.total).toBe(0);
    });

    test('TC03 Несколько совпадений Juice', async ({}, testInfo) => {
      await test.step('Найти Juice', () => shop.search('Juice'));
      const result = await test.step('Собрать все страницы выдачи', () => shop.results());
      await attachResults(testInfo, 'juice-results', result);
      expect(result.total).toBeGreaterThan(1);
      expect(result.names).toEqual(expect.arrayContaining(['Apple Juice (1000ml)', 'Banana Juice (1000ml)']));
    });

    test('TC04 Поиск по фрагменту слова berr', async ({}, testInfo) => {
      await test.step('Найти berr', () => shop.search('berr'));
      const result = await shop.results();
      await attachResults(testInfo, 'berr-results', result);
      expect(result.names).not.toContain('Berry Juice (1000ml)');
    });
  });

  test.describe('G2 Нормализация запроса', () => {
    test('TC05 Регистр apple и APPLE @proposed', async ({}, testInfo) => {
      testInfo.annotations.push({ type: 'proposed', description: 'Предложенное в отчёте требование: поиск нечувствителен к регистру.' });
      await shop.search('apple');
      const lower = await shop.results();
      await shop.search('APPLE');
      const upper = await shop.results();
      await attachResults(testInfo, 'case-comparison', { lower, upper });
      expect(lower.names).toContain('Apple Juice (1000ml)');
      expect(sortedNames(upper)).toEqual(sortedNames(lower));
    });

    test('TC06 Пробелы по краям запроса @proposed', async ({}, testInfo) => {
      testInfo.annotations.push({ type: 'proposed', description: 'Предложенное в отчёте требование: внешние пробелы не меняют выдачу.' });
      await shop.search('apple');
      const plain = await shop.results();
      await shop.search('  apple  ');
      const padded = await shop.results();
      await attachResults(testInfo, 'whitespace-comparison', { plain, padded });
      expect(plain.names).toContain('Apple Juice (1000ml)');
      expect(sortedNames(padded)).toEqual(sortedNames(plain));
    });
  });

  test.describe('G3 Обновление выдачи и пагинация', () => {
    test('TC07 Повторный поиск Apple затем Banana', async ({}, testInfo) => {
      await shop.search('Apple');
      const before = await shop.results();
      expect(before.names).toContain('Apple Juice (1000ml)');
      await shop.search('Banana');
      const after = await shop.results();
      await attachResults(testInfo, 'repeated-search', { before, after });
      expect(after.names).toContain('Banana Juice (1000ml)');
      expect(after.names).not.toContain('Apple Juice (1000ml)');
      await expect(shop.product('Apple Juice (1000ml)')).toHaveCount(0);
    });

    test('TC08 Переход между страницами выдачи Juice', async ({ page }, testInfo) => {
      await shop.search('Juice');
      const size = page.getByRole('combobox', { name: 'Items per page:' });
      await expect(size, 'Размер страницы из предусловия отчёта').toHaveText('15');
      const state = await shop.pagination();
      expect(state.total, 'Предусловие из отчёта: больше 15 совпадений').toBeGreaterThan(15);
      const first = await shop.currentNames();
      expect(first).toHaveLength(15);
      const second = await test.step('Перейти на вторую страницу', () => shop.turnPage(shop.next));
      expect(second.length).toBeGreaterThan(0);
      expect(second.filter(name => first.includes(name))).toEqual([]);
      const returned = await test.step('Вернуться на первую страницу', () => shop.turnPage(shop.previous));
      expect(returned).toEqual(first);
      await shop.expectQueryHeading('Juice');
      await attachResults(testInfo, 'pagination', { first, second, returned, total: state.total });
    });
  });

  test.describe('G4 Пустая выдача и граничный ввод', () => {
    test('TC09 Очистка запроса восстанавливает каталог', async ({}, testInfo) => {
      const initial = await shop.results();
      expect(initial.total).toBeGreaterThan(0);
      await shop.search('Apple');
      const filtered = await shop.results();
      expect(filtered.total).toBeLessThan(initial.total);
      await test.step('Очистить поле и отправить пустой запрос', () => shop.search(''));
      const restored = await shop.results();
      await attachResults(testInfo, 'clear-query', { initial, filtered, restored });
      expect(sortedNames(restored)).toEqual(sortedNames(initial));
    });
  });

  test.describe('G5 Поиск по знакам препинания', () => {
    test('TC10 Поиск по дефису @exploratory', async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'exploratory', description: 'В отчёте ожидаемый состав выдачи не определён. Успех означает сбор результатов, а не подтверждение бизнес-требования.' });
      await shop.search('-');
      const result = await shop.results();
      await attachResults(testInfo, 'hyphen-results', result);
      await testInfo.attach('hyphen-first-page', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });

    test('TC11 Поиск по точке после дефиса @exploratory', async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'exploratory', description: 'Различие выдач фиксируется как наблюдение. Равенство или различие не является критерием pass/fail.' });
      await shop.search('-');
      const hyphen = await shop.results();
      await shop.search('.');
      const dot = await shop.results();
      const same = JSON.stringify(sortedNames(hyphen)) === JSON.stringify(sortedNames(dot));
      await attachResults(testInfo, 'punctuation-comparison', {
        hyphen, dot, same,
        onlyHyphen: hyphen.names.filter(name => !dot.names.includes(name)),
        onlyDot: dot.names.filter(name => !hyphen.names.includes(name)),
      });
      await testInfo.attach('dot-first-page', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });
  });

  test.describe('G6 Навигация из результатов поиска', () => {
    test('TC12 Обновление страницы с результатами @proposed', async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'proposed', description: 'Предложенное в отчёте требование: запрос и выдача восстанавливаются после перезагрузки.' });
      await shop.search('Apple');
      const before = await shop.results();
      expect(before.names).toContain('Apple Juice (1000ml)');
      await test.step('Обновить страницу браузера', () => page.reload());
      await shop.expectQueryHeading('Apple');
      await expect(page).toHaveURL(url => new URL(url.hash.slice(1), url.origin).searchParams.get('q') === 'Apple');
      const after = await shop.results();
      await attachResults(testInfo, 'reload-results', { before, after });
      expect(sortedNames(after)).toEqual(sortedNames(before));
    });

    test('TC13 Открытие найденного товара', async ({ page }, testInfo) => {
      const name = 'Apple Juice (1000ml)';
      await shop.search(name);
      const before = await shop.results();
      expect(before.names).toContain(name);
      await test.step('Открыть именно Apple Juice, а не Pineapple Juice', async () => {
        await shop.product(name).getByRole('button', { name: 'Click for more information about the product', exact: true }).click();
      });
      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(name, { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Close Dialog', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await shop.expectQueryHeading(name);
      const after = await shop.results();
      await attachResults(testInfo, 'product-dialog-results', { before, after });
      expect(sortedNames(after)).toEqual(sortedNames(before));
    });
  });
});
