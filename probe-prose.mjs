const { EDITOR_STRINGS } = await import('./src/rendering/editor/strings.ts');
const { EDITOR_LANGUAGE_STRINGS } = await import('./src/rendering/editor/translations/index.ts');
const helpers = Object.keys(EDITOR_STRINGS).filter(k => k.endsWith('.helper'));
const labels  = Object.keys(EDITOR_STRINGS).filter(k => !k.endsWith('.helper'));
const chars = ks => ks.reduce((n,k)=>n+String(EDITOR_STRINGS[k]).length,0);
console.log(`helpers ${helpers.length} keys / ${chars(helpers)} chars   labels ${labels.length} keys / ${chars(labels)} chars`);
console.log(`prose carries ${(100*chars(helpers)/(chars(helpers)+chars(labels))).toFixed(0)}% of the characters\n`);
console.log('lang    helpers-done  labels-done');
for (const [l, t] of Object.entries(EDITOR_LANGUAGE_STRINGS).sort()) {
  const h = helpers.filter(k => k in t).length, lb = labels.filter(k => k in t).length;
  console.log(`  ${l.padEnd(6)} ${String(h).padStart(6)}/${helpers.length}   ${String(lb).padStart(6)}/${labels.length}`);
}
