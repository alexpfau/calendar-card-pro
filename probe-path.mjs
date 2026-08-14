const { getEffectiveLanguage } = await import('./src/translations/localize.ts');
const { toHaLanguage } = await import('./src/utils/weather-i18n.ts');
const haLocale = { language: 'de' };   // the maintainer's instance
for (const cfg of ['pt-br','en-gb','zh-cn','fr','xx']) {
  const eff = getEffectiveLanguage(cfg, haLocale);
  console.log(`config ${cfg.padEnd(6)} -> effective ${String(eff).padEnd(6)} -> HA fetch code ${toHaLanguage(eff)}`);
}
