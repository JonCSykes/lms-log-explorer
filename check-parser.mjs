import { readFileSync } from 'node:fs'

import { getAllLogFiles } from './lib/indexer/discovery.ts'
import { parseLogLine } from './lib/parser/lineReader.ts'

console.log('=== Checking file discovery ===')

const files = getAllLogFiles()
console.log('Found', files.length, 'files')

if (files.length > 0) {
  const firstFile = files[0]
  if (!firstFile) {
    process.exit(0)
  }

  console.log('First file:', firstFile.path)

  console.log('\n=== Testing individual file ===')
  console.log('parseLogLine imported')

  const content = readFileSync(firstFile.path, 'utf8')
  const lines = content.split('\n').slice(0, 20)

  for (const line of lines) {
    const parsed = parseLogLine(line)
    if (parsed && parsed.message.includes('request')) {
      console.log('Found request line:', parsed.message.substring(0, 60))
    }
  }
}
