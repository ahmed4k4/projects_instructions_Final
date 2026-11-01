export default async function run(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160));
  });

  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('http://127.0.0.1:5173/ai-advisor', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const en = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    h1: document.querySelector('h1')?.textContent,
    navFirst: document.querySelector('nav a span span')?.textContent,
  }));

  // Switch to Arabic via the switcher.
  await page.getByRole('button', { name: 'ع', exact: true }).click();
  await page.waitForTimeout(800);

  const ar = await page.evaluate(() => {
    const html = document.documentElement;
    return {
      lang: html.lang,
      dir: html.dir,
      h1: document.querySelector('h1')?.textContent,
      bodyHasArabic: /[\u0600-\u06FF]/.test(document.body.innerText),
      noHorizontalOverflow: html.scrollWidth <= window.innerWidth + 1,
      fontFamily: getComputedStyle(document.body).fontFamily.slice(0, 40),
    };
  });

  // Back to English.
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => ({
    dir: document.documentElement.dir,
    h1: document.querySelector('h1')?.textContent,
  }));

  return { en, ar, back, errors };
}
