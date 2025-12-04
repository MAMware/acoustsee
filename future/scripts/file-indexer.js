import fs from 'fs';
import path from 'path';

const targets = [
  { dir: '../web/synthesis-methods/grids', output: '../web/synthesis-methods/grids/availableGrids.json', ext: '.js' },
  { dir: '../web/synthesis-methods/engines', output: '../web/synthesis-methods/engines/availableEngines.json', ext: '.js' },
  { dir: '../web/languages', output: '../web/languages/availableLanguages.json', ext: '.json' }
];

for (const { dir, output, ext } of targets) {
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) {
    console.warn(`DIR NOT FOUND: ${absDir}`);
    continue;
  }
  const files = fs.readdirSync(absDir)
    .filter(f => f.endsWith(ext) && !f.startsWith('available'));

  const items = files.map(file => ({
    id: path.basename(file, ext),
    createdAt: fs.statSync(path.join(absDir, file)).ctimeMs
    // Puedes agregar más metadatos si lo deseas
  }));
  if (items.length === 0) {
    console.warn(`NO FILES FOUND: ${absDir}`);
    continue;
  }

  items.sort((a, b) => b.createdAt - a.createdAt);
  fs.writeFileSync(path.resolve(output), JSON.stringify(items, null, 2));
  console.log(`File generated: ${output}`);
}