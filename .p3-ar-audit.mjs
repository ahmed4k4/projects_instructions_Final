export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5173/builder', { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Add two parts so the summary has real money in it.
  const add = page.getByRole('button', { name: /^Add$|^إضافة$/ }).first();
  if (await add.count()) await add.click();
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: 'ع', exact: true }).click();
  await page.waitForTimeout(1400);

  const text = await page.locator('body').innerText();
  const arabicNodes = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const english = [];
    while (walker.nextNode()) {
      const t = walker.currentNode.nodeValue?.trim() ?? '';
      // Latin words longer than 3 chars that aren't product names/specs.
      if (
        /^[A-Za-z][A-Za-z\s.,'’-]{12,}$/.test(t) &&
        !/RTX|Ryzen|Intel|NVIDIA|GeForce|Radeon|PCIe|DDR|NVMe|M\.2|ATX|LGA|AM5|Watt|GHz|GB|Gen/i.test(t)
      ) {
        english.push(t.slice(0, 60));
      }
    }
    return [...new Set(english)].slice(0, 12);
  });

  return {
    dir: await page.evaluate(() => document.documentElement.dir),
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
    untranslatedEnglish: arabicNodes,
    banner: text.split('\n').find((l) => /متوافق|compatible/i.test(l)) ?? '(none)',
    screenshotText: text.slice(0, 160),
  };
}
