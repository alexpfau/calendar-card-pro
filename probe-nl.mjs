const { getEffectiveLanguage } = await import('./src/translations/localize.ts');
const { toHaLanguage } = await import('./src/utils/weather-i18n.ts');
const ha = { language: 'de' };
for (const c of ['nl','pt-br']) {
  const eff = getEffectiveLanguage(c, ha);
  const reachable = eff.toLowerCase() === c.toLowerCase();
  console.log(`${c.padEnd(6)} effective=${String(eff).padEnd(6)} fetch=${toHaLanguage(eff).padEnd(6)} reachable=${reachable}  -> a naive test of toHaLanguage('${c}') would ${toHaLanguage(c) === toHaLanguage(eff) || reachable ? 'PASS' : 'FAIL'}`);
}
