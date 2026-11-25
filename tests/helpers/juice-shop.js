const { expect } = require('@playwright/test');

/** UI actions and pagination for Juice Shop v20.4.0 in English. */
class JuiceShop {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.input = page.locator('#searchQuery input');
    this.heading = page.locator('app-search-result .heading');
    this.names = page.locator('mat-card .name');
    this.range = page.locator('mat-paginator .mat-mdc-paginator-range-label');
    this.next = page.getByRole('button', { name: 'Next page', exact: true });
    this.previous = page.getByRole('button', { name: 'Previous page', exact: true });
  }

  async open() {
    await this.page.goto('/');
    await this.page.getByRole('button', { name: 'Close Welcome Banner', exact: true }).click();
    await this.page.getByRole('button', { name: 'dismiss cookie message', exact: true }).click();
    // The heading is present before the catalogue has finished loading.
    await expect(this.names.first(), 'Исходный каталог должен загрузиться').toBeVisible({ timeout: 15000 });
    await expect(this.heading).toHaveText('All Products');
  }

  /** Submit via the actual search field rather than constructing a search URL. */
  async search(query) {
    const openSearch = this.page.getByRole('button', { name: 'Open search', exact: true });
    if (await openSearch.isVisible()) {
      await openSearch.click();
    }
    await this.input.fill(query);
    await this.input.press('Enter');
    await expect(this.page).toHaveURL(url => {
      const route = new URL(url.hash.slice(1), url.origin);
      return route.pathname === '/search' && (route.searchParams.get('q') || '') === query;
    });
    await this.expectQueryHeading(query);
    await this.firstPage();
  }

  async expectQueryHeading(query) {
    const title = query.trim() ? `Search Results - ${query.trim()}` : 'All Products';
    await expect(this.heading).toHaveText(title);
  }

  async pagination() {
    const text = (await this.range.innerText()).trim();
    if (/^0 of 0$/.test(text)) {
      return { start: 0, end: 0, total: 0 };
    }
    const match = text.match(/^(\d+)\s*[–-]\s*(\d+)\s+of\s+(\d+)$/);
    expect(match, `Неизвестный формат пагинации: ${text}`).not.toBeNull();
    return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
  }

  async currentNames() {
    const { start, end, total } = await this.pagination();
    await expect(this.names).toHaveCount(total === 0 ? 0 : end - start + 1);
    return (await this.names.allTextContents()).map(name => name.trim());
  }

  async turnPage(button) {
    const previousRange = await this.range.innerText();
    const previousNames = await this.currentNames();
    await button.click();
    await expect(this.range).not.toHaveText(previousRange);
    await expect(this.names).not.toHaveText(previousNames);
    return this.currentNames();
  }

  async firstPage() {
    while (await this.previous.isEnabled()) {
      await this.turnPage(this.previous);
    }
  }

  /** Collect every UI page; an empty or incomplete catalogue cannot pass silently. */
  async results() {
    await this.firstPage();
    const { total } = await this.pagination();
    const pages = [];
    const names = [];
    do {
      const current = await this.currentNames();
      pages.push({ range: (await this.range.innerText()).trim(), names: current });
      names.push(...current);
      if (!(await this.next.isEnabled())) break;
      await this.turnPage(this.next);
    } while (true);
    expect(names, 'Собраны все страницы выдачи').toHaveLength(total);
    expect(new Set(names).size, 'В выдаче нет повторяющихся названий').toBe(names.length);
    await this.firstPage();
    return { url: this.page.url(), total, names, pages };
  }

  /** @param {string} name Exact name avoids confusing Apple with Pineapple. */
  product(name) {
    return this.page.locator('mat-card').filter({
      has: this.page.locator('.name').getByText(name, { exact: true }),
    });
  }
}

/** Save actual UI output separately from assertions and aggregated reports. */
async function attachResults(testInfo, name, value) {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: 'application/json',
  });
}

function sortedNames(result) {
  return [...result.names].sort();
}

module.exports = { JuiceShop, attachResults, sortedNames };
