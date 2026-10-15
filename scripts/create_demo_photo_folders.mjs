import { mkdirSync, existsSync } from 'fs';
const dirs = ['technomarket','gamepower','smartspace'];
dirs.forEach(d => {
  const p = `client/public/demo-products/${d}`;
  if (!existsSync(p)) { mkdirSync(p, { recursive: true }); console.log(`Created: ${p}`); }
  else { console.log(`Exists: ${p}`); }
});
console.log('All photo folders ready.');
