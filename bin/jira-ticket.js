#!/usr/bin/env node

const { Command } = require('commander');
const JiraTicketCLI = require('../src/jira-cli');

const program = new Command();

program
  .name('jira-ticket')
  .description('CLI for creating and managing Jira tickets')
  .version('1.0.0');

// Create ticket command (default)
program
  .command('create', { isDefault: true })
  .description('Create a new Jira ticket')
  .option('--dry-run', 'Preview ticket details and optionally create the ticket')
  .option('--dryrun', 'Preview ticket details and optionally create the ticket (alias for --dry-run)')
  .option('--test-connection', 'Test the connection to Jira with current configuration')
  .option('--list-fields', 'List all custom fields in your Jira instance to help find field IDs')
  .option('--field-options <fieldId>', 'List available options for a specific custom field ID')
  .option('--create-meta', 'Show create metadata for the project (includes field options)')
  .action(async (options) => {
    const cli = new JiraTicketCLI();

    if (options.testConnection) {
      await cli.testConnection();
    } else if (options.listFields) {
      await cli.listCustomFields();
    } else if (options.fieldOptions) {
      await cli.listFieldOptions(options.fieldOptions);
    } else {
      const isDryRun = options.dryRun || options.dryrun;
      await cli.run(isDryRun);
    }
  });

// Move ticket command
program
  .command('move [ticketKey]')
  .description('Transition a ticket to a different status or manage tracked tickets')
  .action(async (ticketKey) => {
    const cli = new JiraTicketCLI();
    await cli.moveTicket(ticketKey);
  });

program.parse();
