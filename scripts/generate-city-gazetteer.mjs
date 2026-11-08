import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { Converter } from 'opencc-js/t2cn'

// Input: the unzipped GeoNames cities1000.txt. No network access during build/runtime.
const [input, output = 'src/assets/city-gazetteer.json.gz'] = process.argv.slice(2)
if (!input) throw new Error('Usage: bun scripts/generate-city-gazetteer.mjs <cities1000.txt> [output]')
const contents = readFileSync(input, 'utf8')
const simplify = Converter({ from: 't', to: 'cn' })
const normalize = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
const records = []
for (const line of contents.split('\n')) {
  const columns = line.split('\t')
  if (columns.length < 19 || Number(columns[14]) < 15000) continue
  // Do not choose between competing/obsolete Chinese aliases. Skip ambiguous rows.
  const chinese = [...new Set(columns[3].split(',').filter(name => /^[\p{Script=Han}·（）() -]+$/u.test(name)).map(simplify))]
  if (chinese.length !== 1) continue
  const name = chinese[0]
  const aliases = [...new Set([columns[1], columns[2]].map(normalize))]
  for (const alias of aliases) {
    if (!alias || /\p{Script=Han}/u.test(alias)) continue
    records.push([columns[8], alias, name, Number(columns[4]), Number(columns[5])])
  }
}
records.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'))
const hash = createHash('sha256').update(contents).digest('hex')
writeFileSync(output, gzipSync(JSON.stringify(records), { level: 9 }))
console.log(`Generated ${records.length} country-scoped aliases; source SHA-256 ${hash}`)
