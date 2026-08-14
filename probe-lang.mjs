const { toHaLanguage } = await import('./src/utils/weather-i18n.ts');
const cases = ['en','de','en-gb','en-GB','zh-cn','zh-tw','pt-br','fr','sv'];
for (const c of cases) console.log(`  ${c.padEnd(7)} -> ${toHaLanguage(c)}`);
