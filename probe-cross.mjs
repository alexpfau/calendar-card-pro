const { getEffectiveLanguage } = await import('./src/translations/localize.ts');
const { toHaLanguage } = await import('./src/utils/weather-i18n.ts');
const ha = { language: 'de' };
// CLAIM A: "a second look would not have caught the mapping error, because the
// representative input passes cleanly every time" -- i.e. every SHIPPED language is
// reachable, so no amount of re-looking at a shipped-language card reveals it.
const shipped = ['en','de','fr','sv','nl','it','pl','sk','et','lv','lt','nb','en-gb','zh-cn','zh-tw'];
const unreachable = shipped.filter(c => getEffectiveLanguage(c, ha).toLowerCase() !== c.toLowerCase());
console.log(`shipped languages tested: ${shipped.length}`);
console.log(`  unreachable (would expose the bug by looking): ${unreachable.length} ${JSON.stringify(unreachable)}`);
console.log(unreachable.length === 0
  ? '  => CLAIM A holds: no shipped language exhibits it, so re-looking cannot find it'
  : '  => CLAIM A FALSE: looking at these would have exposed it');
