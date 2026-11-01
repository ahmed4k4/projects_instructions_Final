export default async function run(page) {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // Ask the dev server for the transformed provider module and look for the
  // inlined env expression. Vite replaces `import.meta.env.X` at serve time.
  const src = await page.evaluate(async () => {
    const res = await fetch('/src/services/ai/providers/openrouterProvider.ts');
    return res.text();
  });

  const line = src.split('\n').find((l) => l.includes('apiKey')) ?? '';
  return { envLine: line.slice(0, 200) };
}
