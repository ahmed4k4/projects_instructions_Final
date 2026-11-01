const res = await fetch('https://openrouter.ai/api/v1/models');
const json = await res.json();
const free = json.data.filter((m) => m.id.endsWith(':free'));
console.log('free models:', free.length);
for (const m of free.slice(0, 25)) {
  console.log(
    m.id.padEnd(52),
    'ctx=' + m.context_length,
    '| tools=' + (m.supported_parameters?.includes('tools') ? 'yes' : 'no'),
  );
}
