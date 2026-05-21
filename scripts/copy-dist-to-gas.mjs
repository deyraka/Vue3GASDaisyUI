import fs from 'fs';
import path from 'path';

const distPath = path.resolve('dist', 'index.html');
const gasPath = path.resolve('gas', 'index.html');

if (fs.existsSync(distPath)) {
  fs.copyFileSync(distPath, gasPath);
  console.log('Successfully copied dist/index.html to gas/index.html');
} else {
  console.error('dist/index.html not found. Run npm run build first.');
  process.exitCode = 1;
}
