#!/usr/bin/env node

/**
 * IMA OS - Post Install Setup Helper
 * Runs after npm install to guide initial setup
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n🎭 IMA OS - Agency Management System\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Check for .env file
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('⚠️  No .env file found!\n');
  console.log('📝 Creating .env from .env.example...\n');
  
  try {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ .env file created!\n');
  } catch (error) {
    console.log('❌ Could not create .env file automatically.\n');
  }
  
  console.log('⚡ Next steps:\n');
  console.log('   1. Edit .env file with your Supabase credentials');
  console.log('   2. Run the SQL schema in your Supabase project');
  console.log('   3. Create admin user in Supabase Auth');
  console.log('   4. Run: npm run dev\n');
  console.log('📖 See QUICKSTART.md for detailed instructions\n');
} else {
  console.log('✅ .env file exists\n');
  console.log('⚡ Ready to start!\n');
  console.log('   Run: npm run dev\n');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📚 Documentation:');
console.log('   • QUICKSTART.md - 5 minute setup guide');
console.log('   • SETUP.md      - Detailed setup instructions');
console.log('   • IMPLEMENTATION.md - Feature list & architecture\n');
console.log('🚀 Let\'s build something amazing!\n');
