// scripts/file-indexer.js
import fs from 'fs';
import path from 'path';

// --- NEW CONFIGURATION ---
// We now define how to generate the JS content for each registry
const targets = [
  {
    dir: '../web/video/grids',
    output: '../web/video/grids/available-grids.js',
    // Generates the JS code for the grids registry
    generateContent: (files) => {
      const imports = files.map(file => {
        const componentName = path.basename(file, '.js');
        // e.g., 'hex-tonnetz' -> 'mapFrameToHexTonnetz'
        const functionName = `mapFrameTo${componentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
        return `import { ${functionName} } from './${file}';`;
      }).join('\n');

      const exports = files.map(file => {
        const componentName = path.basename(file, '.js');
        const functionName = `mapFrameTo${componentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
        // Note: You might need to manually store maxNotes or read it from the file if possible
        return `  { id: '${componentName}', mapFunction: ${functionName} }`;
      }).join(',\n');

      return `${imports}\n\nexport const availableGrids = [\n${exports}\n];\n`;
    }
  },
  {
    dir: '../web/audio/synths',
    output: '../web/audio/synths/available-synths.js',
    // Generates the JS code for the engines registry
    generateContent: (files) => {
        const imports = files.map(file => {
            const componentName = path.basename(file, '.js');
            const functionName = `play${componentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
            return `import { ${functionName} } from './${file}';`;
        }).join('\n');

        const exports = files.map(file => {
            const componentName = path.basename(file, '.js');
            const functionName = `play${componentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
            return `  { id: '${componentName}', playFunction: ${functionName} }`;
        }).join(',\n');

        return `${imports}\n\nexport const availableEngines = [\n${exports}\n];\n`;
    }
  },
  {
    dir: '../web/languages',
    output: '../web/languages/available-languages.js',
    // Generates the JS code for the languages registry
    generateContent: (files) => {
        const imports = files.map(file => {
            const componentName = path.basename(file, '.json');
            return `import ${componentName.replace('-', '')}Data from './${file}';`;
        }).join('\n');

        const exports = files.map(file => {
            const componentName = path.basename(file, '.json');
            // Assuming the language ID is the same as the file name
            return `  { id: '${componentName}', data: ${componentName.replace('-', '')}Data }`;
        }).join(',\n');

        return `${imports}\n\nexport const availableLanguages = [\n${exports}\n];\n`;
    }
  }
];


// --- The rest of the script logic is now generalized ---
for (const { dir, output, generateContent } of targets) {
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) {
    console.warn(`DIR NOT FOUND: ${absDir}`);
    continue;
  }
  
  // Find all .js files, excluding the 'available*.js' registry files itself
  const files = fs.readdirSync(absDir)
    .filter(f => !f.startsWith('available.') && (f.endsWith('.js') || f.endsWith('.json')));

  if (files.length === 0) {
    console.warn(`NO SOURCE FILES FOUND in: ${absDir}`);
    continue;
  }
  
  const content = generateContent(files);
  fs.writeFileSync(path.resolve(output), content);
  console.log(`Registry file generated: ${output}`);
}