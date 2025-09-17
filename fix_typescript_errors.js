#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// Common TypeScript error patterns and their fixes
const fixes = [
  // Fix date arithmetic
  {
    pattern: /new Date\(\) - new Date\(([^)]+)\)/g,
    replacement: 'new Date().getTime() - new Date($1).getTime()'
  },
  // Fix error.message on unknown error
  {
    pattern: /error\.message/g,
    replacement: '(error as Error).message'
  },
  // Fix error.stack on unknown error  
  {
    pattern: /error\.stack/g,
    replacement: '(error as Error).stack'
  },
  // Fix error.code on unknown error
  {
    pattern: /error\.code/g,
    replacement: '(error as any).code'
  }
];

async function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    for (const fix of fixes) {
      const newContent = content.replace(fix.pattern, fix.replacement);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`Fixed: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error fixing ${filePath}:`, error.message);
  }
}

async function main() {
  const files = await glob('src/**/*.ts');
  console.log(`Processing ${files.length} TypeScript files...`);
  
  for (const file of files) {
    await fixFile(file);
  }
  
  console.log('TypeScript error fixing complete!');
}

main().catch(console.error);
