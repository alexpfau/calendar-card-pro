import fs from 'fs';
const O = JSON.parse(fs.readFileSync('/tmp/ha-oracles.json','utf8'));
const keys = ['ui.weekdays.monday','ui.weekdays.sunday'];
console.log('HA full weekday names:');
for (const lang of ['sv','nb','de','it','pl','lt','lv','et','sk']) {
  const t = O.langs[lang] ?? {};
  console.log(`  ${lang.padEnd(3)} ${keys.map(k=>t[k] ?? '—').join(' / ')}`);
}
// and what the card's own native-contributed files say
console.log('\ncard files (native-contributed):');
for (const lang of ['sv','nb']) {
  const p = `src/translations/languages/${lang}.json`;
  const d = JSON.parse(fs.readFileSync(p,'utf8'));
  console.log(`  ${lang}  fullDaysOfWeek: ${(d.fullDaysOfWeek||[]).slice(0,2).join(', ')}`);
}
