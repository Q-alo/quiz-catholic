const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');

c = c.replace(/bg-white\/5 dark:bg-black\/20 backdrop-blur-md border hover:bg-white\/10 dark:hover:bg-black\/40 border-outline-variant\/20 hover:border-outline-variant\/40est/g, 'glass-panel');
c = c.replace(/bg-white\/5 dark:bg-black\/20 backdrop-blur-md border hover:bg-white\/10 dark:hover:bg-black\/40 border-outline-variant\/20 hover:border-outline-variant\/40\/50/g, 'bg-surface-container-low/50');
c = c.replace(/bg-white\/5 dark:bg-black\/20 backdrop-blur-md border hover:bg-white\/10 dark:hover:bg-black\/40 border-outline-variant\/20 hover:border-outline-variant\/40/g, 'bg-surface-container-low backdrop-blur-md');

fs.writeFileSync('src/App.tsx', c);
console.log('Fixed classes');
