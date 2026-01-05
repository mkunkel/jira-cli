#!/usr/bin/env node

const { program } = require('commander');
const JiraTicketCLI = require('../src/jira-cli');

program
  .name('jira log')
  .description('Log time on a Jira ticket')
  .argument('[ticket-key]', 'Ticket key (e.g., LPWEB-123). If not provided, you will be prompted to select one.')
  .action(async (ticketKey) => {
    const cli = new JiraTicketCLI();
    try {
      await cli.loadConfig();
      await cli.validateToken();
      await cli.logTime(ticketKey);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();

