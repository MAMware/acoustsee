#!/usr/bin/env node
/**
 * inject-build-info.js - Inject Git Hash and Build Timestamp into constants.js
 * 
 * Purpose: Automatically update BUILD_COMMIT and BUILD_TIMESTAMP in constants.js
 * with current git commit hash and build time. This ensures logs and dev panel
 * always display the exact version being tested.
 * 
 * Usage:
 *   node scripts/inject-build-info.js
 * 
 * Run this before testing or serve the app. Can be integrated into package.json
 * scripts or pre-commit hooks.
 * 
 * Created: November 15, 2025
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONSTANTS_PATH = join(__dirname, '..', 'core', 'constants.js');

function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    console.warn('Warning: Could not retrieve git hash:', error.message);
    return 'unknown';
  }
}

function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    console.warn('Warning: Could not retrieve git branch:', error.message);
    return 'unknown';
  }
}

function getBuildTimestamp() {
  return new Date().toISOString();
}

function injectBuildInfo() {
  const gitHash = getGitHash();
  const gitBranch = getGitBranch();
  const buildTimestamp = getBuildTimestamp();
  
  console.log('Injecting build info:');
  console.log(`  Commit: ${gitHash}`);
  console.log(`  Branch: ${gitBranch}`);
  console.log(`  Time:   ${buildTimestamp}`);
  
  let content = readFileSync(CONSTANTS_PATH, 'utf8');
  
  // Define the build info constants to inject
  const buildInfoBlock = `
// Build information (auto-injected by scripts/inject-build-info.js)
export const BUILD_COMMIT = '${gitHash}';
export const BUILD_BRANCH = '${gitBranch}';
export const BUILD_TIMESTAMP = '${buildTimestamp}';
`;

  // Check if build info already exists
  const buildInfoRegex = /\/\/ Build information[\s\S]*?export const BUILD_TIMESTAMP = '[^']*';/;
  
  if (buildInfoRegex.test(content)) {
    // Replace existing build info
    content = content.replace(buildInfoRegex, buildInfoBlock.trim());
    console.log('✓ Updated existing build info in constants.js');
  } else {
    // Inject after version constants
    const insertAfter = /export const UTILS_VERSION = '[^']*';/;
    if (insertAfter.test(content)) {
      content = content.replace(insertAfter, (match) => match + '\n' + buildInfoBlock);
      console.log('✓ Injected new build info into constants.js');
    } else {
      // Fallback: append to end of file
      content += buildInfoBlock;
      console.log('✓ Appended build info to constants.js');
    }
  }
  
  writeFileSync(CONSTANTS_PATH, content, 'utf8');
  console.log('✓ Build info injection complete');
}

// Run the injection
injectBuildInfo();
