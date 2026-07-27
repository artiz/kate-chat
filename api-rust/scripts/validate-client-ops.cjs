// Validate every client GraphQL operation against api-rust's exported
// SDL. Usage: cargo test export_sdl && cd ../client && node ../api-rust/scripts/validate-client-ops.cjs
const fs = require('fs');
const { buildSchema, parse, validate } = require('graphql');

const schema = buildSchema(fs.readFileSync('../api-rust/target/schema.graphql', 'utf8'));
const src = fs.readFileSync('src/store/services/graphql.queries.ts', 'utf8');

const consts = {};
for (const m of src.matchAll(/export const (\w+)(?::[^=]+)? = (?:gql)?`([\s\S]*?)`;/g)) {
  consts[m[1]] = m[2];
}
const resolve = (text, seen) => text.replace(/\$\{(\w+)\}/g, (_, name) => {
  if (!consts[name] || seen.has(name)) return '';
  seen.add(name);
  return resolve(consts[name], seen);
});

const allFragments = Object.entries(consts)
  .filter(([k, v]) => k.includes('FRAGMENT') && v.trim().startsWith('fragment'))
  .map(([, v]) => resolve(v, new Set()))
  .join('\n');

const fragmentDefs = Object.entries(consts)
  .filter(([k, v]) => k.includes('FRAGMENT') && v.trim().startsWith('fragment'))
  .map(([, v]) => resolve(v, new Set()));

let fail = 0, total = 0;
for (const [name, raw] of Object.entries(consts)) {
  let body = resolve(raw, new Set());
  for (const frag of fragmentDefs) {
    const fname = frag.match(/fragment (\w+)/)[1];
    if (!new RegExp('fragment ' + fname + '\\b').test(body)) body += '\n' + frag;
  }
  const m = body.match(/(query|mutation|subscription)\s+(\w+)/);
  if (!m) continue;
  total++;
  try {
    const errors = validate(schema, parse(body)).filter(e => !/is never used/.test(e.message));
    if (errors.length) { fail++; console.log('FAIL', m[2], '::', errors[0].message); }
  } catch (e) { fail++; console.log('PARSE-FAIL', m[2], e.message.slice(0, 90)); }
}
console.log(`${total - fail}/${total} operations valid`);
