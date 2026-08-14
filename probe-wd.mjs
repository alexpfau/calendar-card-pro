import fs from 'fs';
// The glossary says: nb and sv lowercase weekdays; the editor writes Mandag/Måndag.
// It flags sv as unresolvable because card and editor agree. Test that against HA.
const O = JSON.parse(fs.readFileSync('/tmp/ha-oracles.json','utf8'));
for (const lang of ['sv','nb','de','it']) {
  const t = O.langs[lang]; if (!t) { console.log(lang, 'no oracle'); continue; }
  const days = Object.entries(t).filter(([k]) => /weekday|day.*monday|monday/i.test(k)).slice(0,3);
  const en = Object.entries(O.en).filter(([k]) => /monday/i.test(k)).slice(0,3);
  console.log(`${lang}:`, days.map(([k,v])=>v).join(', ') || '(none found)');
}
console.log('\nEnglish keys mentioning Monday:', Object.entries(O.en).filter(([k,v])=>/^monday$/i.test(String(v))).map(([k])=>k).slice(0,4));
