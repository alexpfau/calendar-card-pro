const { EDITOR_STRINGS } = await import('./src/rendering/editor/strings.ts');
const hits = Object.entries(EDITOR_STRINGS).filter(([k,v]) => ['Column','Event','Weather'].includes(String(v)));
console.log('keys whose English is exactly Column/Event/Weather:');
hits.forEach(([k,v]) => console.log(`  ${k.padEnd(30)} ${v}`));
console.log('\nsub-form / group keys in the table:');
Object.keys(EDITOR_STRINGS).filter(k=>/^(column|event|weather)$/.test(k)).forEach(k=>console.log(`  ${k} -> ${EDITOR_STRINGS[k]}`));
