const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');
let newContent = content.replace(/bg-surface-container-lowest/g, 'glass-panel');
newContent = newContent.replace(/shadow-\[0_8px_32px_rgba\(0,0,0,0\.03\)\]/g, '');
fs.writeFileSync('src/App.tsx', newContent);
console.log('Done!');
