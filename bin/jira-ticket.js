#!/usr/bin/env node

const { Command } = require('commander');
const JiraTicketCLI = require('../src/jira-cli');

const program = new Command();

program
  .name('jira-ticket')
  .description('CLI for creating Jira tickets')
  .version('1.0.0')
  .option('--dry-run', 'Show what would be executed without creating the ticket')
  .option('--dryrun', 'Show what would be executed without creating the ticket (alias for --dry-run)')
  .option('--test-connection', 'Test the connection to Jira with current configuration')
  .action(async (options) => {
    const cli = new JiraTicketCLI();
    
    if (options.testConnection) {
      await cli.testConnection();
    } else {
      const isDryRun = options.dryRun || options.dryrun;
      await cli.run(isDryRun);
    }
  });

program.parse();
