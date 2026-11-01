export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('http://127.0.0.1:5173/builder', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'ع', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'C:/Users/pc/AppData/Local/Temp/p3-builder-ar.png' });

  return await page.evaluate(() => ({
    dir: document.documentElement.dir,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    title: document.querySelector('h1')?.textContent,
  }));
}
