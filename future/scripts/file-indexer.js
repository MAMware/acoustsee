// scripts/file-indexer.js
import fs from 'fs';
import path from 'path';

// --- NEW CONFIGURATION ---
// We now define how to generate the JS content for each registry
const targets = [
  {
    dir: './web/video/grids',
    output: './web/video/grids/available-grids.js',
    sourceExt: '.js',
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
    dir: './web/audio/synths',
    output: './web/audio/synths/available-synths.js',
    sourceExt: '.js',
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
    dir: './web/languages',
    output: './web/languages/available-languages.js',
    sourceExt: '.json',
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


// --- REVISED Script Logic ---
for (const { dir, output, sourceExt, generateContent } of targets) {
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) {
    console.error(`ERROR: Source directory not found: ${absDir}`);
    continue;
  }
  
  // Get the base name of the output file (e.g., 'index.js' or 'available-grids.js')
  const outputFileName = path.basename(output);

  const files = fs.readdirSync(absDir)
    // The NEW, more robust filter logic:
    .filter(f => 
      f.endsWith(sourceExt) && // 1. Must have the correct extension
      f !== outputFileName     // 2. Must NOT be the output file itself
    );

  if (files.length === 0) {
    console.warn(`WARN: No source files with extension ${sourceExt} found in: ${absDir}`);
    // Still generate an empty registry to prevent old data from persisting
    const emptyContent = generateContent([]);
    fs.writeFileSync(path.resolve(output), emptyContent);
    console.log(`Empty registry file generated (no sources found): ${output}`);
    continue;
  }
  
  const content = generateContent(files);
  fs.writeFileSync(path.resolve(output), content);
  console.log(`Registry file generated: ${output}`);
}