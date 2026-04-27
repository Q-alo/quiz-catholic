const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');

// Replace top progress bar wrapper
c = c.replace(/fixed top-6 left-1\/2 -translate-x-1\/2 z-\[60\] bg-surface-container-lowest\/90 backdrop-blur-md shadow-xl border border-outline-variant\/20/g, 'fixed top-6 left-1/2 -translate-x-1/2 z-[60] glass-panel shadow-xl');

// Add neon-glow to specific main buttons
c = c.replace(/className="w-full lg:max-w-2xl bg-primary text-on-primary/g, 'className="w-full lg:max-w-2xl bg-gradient-to-r from-primary to-secondary text-white neon-glow');
c = c.replace(/className="px-8 py-4 bg-primary text-on-primary/g, 'className="px-8 py-4 bg-gradient-to-r from-primary to-secondary text-white neon-glow');
c = c.replace(/className="flex-1 bg-primary text-on-primary/g, 'className="flex-1 bg-gradient-to-r from-primary to-secondary text-white neon-glow');

// We also have some labels and options. Let's make "bg-surface-container-low" look a bit nicer too where appropriate. 
// For active state radio options in "Chế độ ôn tập":
c = c.replace(/bg-primary text-on-primary shadow-lg/g, 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg neon-glow');

fs.writeFileSync('src/App.tsx', c);
console.log('Buttons updated');
