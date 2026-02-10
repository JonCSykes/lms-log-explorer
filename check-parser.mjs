import('@lms-log-explorer/lib/indexer/index.ts').then(({ buildIndex, getAllLogFiles }) => {
  console.log('=== Checking file discovery ===')
  
  const files = getAllLogFiles()
  console.log('Found', files.length, 'files')
  
  if (files.length > 0) {
    console.log('First file:', files[0].path)
    
    // Try to parse just the first 10 lines of one file
    console.log('\\n=== Testing individual file ===')
    
    const lineReader = require('./lib/parser/lineReader.ts').parseLogLine
    console.log('parseLogLine imported')
    
    // Read and process first 20 lines
    const fs = require('fs')
    const content = fs.readFileSync(files[0].path, 'utf8')
    const lines = content.split('\\n').slice(0, 20)
    
    for (const line of lines) {
      const parsed = lineReader(line)
      if (parsed && parsed.message.includes('request')) {
        console.log('Found request line:', parsed.message.substring(0, 60))
      }
    }
  }
}).catch(console.error)
