const { EDITOR_STRINGS } = await import('./src/rendering/editor/strings.ts');
const { EDITOR_LANGUAGE_STRINGS } = await import('./src/rendering/editor/translations/index.ts');
const total = Object.keys(EDITOR_STRINGS).length;
console.log(`EDITOR_STRINGS: ${total} keys`);
let missingTotal = 0;
for (const [lang, tbl] of Object.entries(EDITOR_LANGUAGE_STRINGS).sort()) {
  const have = Object.keys(tbl).length, miss = total - have;
  missingTotal += miss;
  console.log(`  ${lang.padEnd(6)} ${String(have).padStart(3)}/${total}  missing ${String(miss).padStart(3)}  ${(100*have/total).toFixed(1)}%`);
}
console.log(`\ntotal missing strings across all 10: ${missingTotal}`);
// how many keys are helpers (long prose) vs labels (short)?
const helpers = Object.keys(EDITOR_STRINGS).filter(k=>k.endsWith('.helper')).length;
console.log(`of ${total} keys: ${helpers} are .helper prose, ${total-helpers} are labels/titles`);
const lens = Object.values(EDITOR_STRINGS).map(v=>String(v).length);
console.log(`English string length: median ${lens.sort((a,b)=>a-b)[Math.floor(lens.length/2)]}, max ${Math.max(...lens)}`);
