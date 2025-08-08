#!/usr/bin/env node

// Test script to demonstrate the CLI functionality
const { spawn } = require('child_process');
const path = require('path');

console.log('Testing Jira Ticket CLI...\n');

// Test --help
console.log('1. Testing --help option:');
const helpProcess = spawn('node', [path.join(__dirname, 'bin/jira-ticket.js'), '--help'], {
  stdio: 'inherit'
});

helpProcess.on('close', (code) => {
  console.log(`\nHelp command completed with code: ${code}\n`);
  
  console.log('2. To test the interactive CLI in dry-run mode, run:');
  console.log('   ./bin/jira-ticket.js --dry-run\n');
  
  console.log('3. Example responses for testing:');
  console.log('   - Work type: Bug');
  console.log('   - Summary: Fix login issue');
  console.log('   - Description: Users cannot log in due to authentication error');
  console.log('   - Components: Frontend, Backend');
  console.log('   - Priority: High');
  console.log('   - Classification: Bug');
  console.log('   - Project: Lonely Planet Website\n');
  
  console.log('The CLI will show what API call would be made without actually creating a ticket.');
});
