const { EDITOR_STRINGS } = await import('./src/rendering/editor/strings.ts');
const keys = new Set(Object.keys(EDITOR_STRINGS));
for (const probe of ['day_rule_width','day_rule_color','weather_line_limit','daily_forecast_fallback','show_conditions']) {
  console.log(`  ${probe.padEnd(26)} in EDITOR_STRINGS: ${keys.has(probe)}`);
}
// which English values look like humanize() output would match the observed labels?
const want = ['Day Rule Width','Options With An Exception','Show The Forecast','Fall Back To The Daily Forecast','Weather Line Limit'];
console.log('\nare the observed labels present as VALUES anywhere in EDITOR_STRINGS?');
for (const w of want) {
  const hit = Object.entries(EDITOR_STRINGS).find(([,v]) => String(v) === w);
  console.log(`  ${JSON.stringify(w).padEnd(36)} ${hit ? 'yes -> '+hit[0] : 'NO — so it is humanize() output'}`);
}
