import * as fs from 'node:fs'
import * as path from 'node:path'

const sourceRoot = path.join(process.cwd(), 'fixtures', '2024-01')
const targetRoot = path.join(
  process.cwd(),
  '.tmp',
  'playwright',
  'logs',
  '2024-01'
)

fs.rmSync(path.dirname(targetRoot), { force: true, recursive: true })
fs.mkdirSync(targetRoot, { recursive: true })

const files = fs
  .readdirSync(sourceRoot)
  .filter((file) => file.endsWith('.log'))
  .sort()

files.forEach((file, index) => {
  const sourcePath = path.join(sourceRoot, file)
  const targetPath = path.join(targetRoot, `2024-01-15.${index + 1}.log`)
  fs.copyFileSync(sourcePath, targetPath)
})

console.log(
  `Prepared ${files.length} e2e fixture logs in ${path.dirname(targetRoot)}`
)
