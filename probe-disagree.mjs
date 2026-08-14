import fs from 'fs';
const { EDITOR_STRINGS } = await import('./src/rendering/editor/strings.ts');
const { EDITOR_LANGUAGE_STRINGS } = await import('./src/rendering/editor/translations/index.ts');
const O = JSON.parse(fs.readFileSync('/tmp/ha-oracles.json','utf8'));
const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
console.log('=== DISAGREEMENTS: our term vs HA\'s term for the same English ===');
for (const [lang, tbl] of Object.entries(O.langs)) {
  const have = EDITOR_LANGUAGE_STRINGS[lang.toLowerCase()] ?? {};
  const map = new Map();
  for (const [k,v] of Object.entries(O.en)) { if (typeof v!=='string'||typeof tbl[k]!=='string') continue;
    const n=norm(v); if(!map.has(n)) map.set(n,new Set()); map.get(n).add(tbl[k]); }
  for (const k of Object.keys(have)) {
    const h = map.get(norm(EDITOR_STRINGS[k] ?? ''));
    if (h && h.size===1 && [...h][0] !== have[k])
      console.log(`  ${lang.padEnd(6)} ${k.padEnd(22)} EN="${EDITOR_STRINGS[k]}"  ours="${have[k]}"  HA="${[...h][0]}"`);
  }
}
console.log('\n=== en-GB: which strings does HA itself consider British-different? ===');
const gb = O.langs['en-GB'];
let diffs = 0, samples = [];
for (const [k,v] of Object.entries(O.en)) {
  if (typeof v==='string' && typeof gb[k]==='string' && v !== gb[k]) { diffs++; if (samples.length<10) samples.push([v, gb[k]]); }
}
console.log(`  of ${Object.keys(O.en).length} English strings, HA's en-GB overrides ${diffs} (${(100*diffs/Object.keys(O.en).length).toFixed(1)}%)`);
samples.forEach(([a,b])=>console.log(`    "${a}" -> "${b}"`));
