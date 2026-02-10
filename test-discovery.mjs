import { getAllLogFiles } from './lib/indexer/discovery.js';

const files = getAllLogFiles('/Users/jonsykes/.lmstudio/server-logs');
console.log('Total files:', files.length);
console.log('Sample files (first 3):', files.slice(0, 3).map(f => f.filename));
