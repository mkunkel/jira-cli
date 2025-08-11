const inquirer = require('inquirer');
const autocomplete = require('inquirer-autocomplete-prompt');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const chalk = require('chalk');
const ora = require('ora');
const JiraService = require('./jira-service');

inquirer.registerPrompt('autocomplete', autocomplete);

class JiraTicketCLI {
  constructor() {
    this.config = null;
    this.jiraService = new JiraService();
  }

  async run(isDryRun = false) {
    try {
      console.log(chalk.blue('🎫 Jira Ticket Creator\n'));

      // Load configuration
      await this.loadConfig();

      // Collect ticket information
      const ticketData = await this.collectTicketData();

      // Create the ticket or show dry run
      if (isDryRun) {
        await this.showDryRun(ticketData);
      } else {
        await this.createTicket(ticketData);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  async loadConfig() {
    const configPaths = [
      path.join(process.cwd(), '.jirarc'),
      path.join(os.homedir(), '.jirarc'),
      path.join(__dirname, '..', '.jirarc')
    ];

    for (const configPath of configPaths) {
      if (await fs.pathExists(configPath)) {
        try {
          const configContent = await fs.readFile(configPath, 'utf8');
          this.config = JSON.parse(configContent);
          console.log(chalk.green(`✓ Configuration loaded from: ${configPath}\n`));
          return this.config;
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Invalid JSON in ${configPath}`));
        }
      }
    }

    // If no config found, create a default one
    console.log(chalk.yellow('No configuration file found. Creating default configuration...\n'));
    await this.createDefaultConfig();
    return this.config;
  }

  async createDefaultConfig() {
    const configQuestions = [
      {
        type: 'input',
        name: 'projectKey',
        message: 'Enter your Jira project key:',
        validate: input => input.length > 0 || 'Project key is required'
      },
      {
        type: 'input',
        name: 'jiraUrl',
        message: 'Enter your Jira instance URL (e.g., https://yourcompany.atlassian.net):',
        validate: input => input.length > 0 || 'Jira URL is required'
      },
      {
        type: 'input',
        name: 'email',
        message: 'Enter your Jira email:',
        validate: input => input.includes('@') || 'Valid email is required'
      },
      {
        type: 'password',
        name: 'apiToken',
        message: 'Enter your Jira API token:',
        validate: input => input.length > 0 || 'API token is required'
      }
    ];

    const configData = await inquirer.prompt(configQuestions);

    this.config = {
      projectKey: configData.projectKey,
      jiraUrl: configData.jiraUrl,
      auth: {
        email: configData.email,
        apiToken: configData.apiToken
      },
      defaults: {
        workType: 'Task',
        priority: 'Medium',
        ticketClassification: 'Feature/Enhancement',
        softwareCapitalizationProject: 'Lonely Planet Website'
      },
      ui: {
        pageSize: 10
      }
    };

    const configPath = path.join(os.homedir(), '.jirarc');
    await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
    console.log(chalk.green(`✓ Configuration saved to: ${configPath}\n`));
  }

  async collectTicketData() {
    const pageSize = this.config?.ui?.pageSize || 10;

    // Get project components
    let components;
    try {
      components = await this.jiraService.getProjectComponents(this.config);

      if (!Array.isArray(components)) {
        throw new Error('Expected array from getProjectComponents');
      }

    } catch (error) {
      console.error(chalk.yellow('Warning: Could not fetch components. Using defaults.'));
      components = ['backend', 'frontend', 'mobile', 'api'];
    }

    // Collect basic ticket information first
    const basicQuestions = [
      {
        type: 'list',
        name: 'workType',
        message: '1) Select work type:',
        choices: [
          'Task',
          'Bug',
          'Epic',
          'Incident',
          'Story',
          'Initiative',
          'Deployment Task',
          'Feature'
        ],
        default: this.config?.defaults?.workType || 'Task',
        loop: false,
        pageSize: pageSize
      },
      {
        type: 'input',
        name: 'summary',
        message: '2) Enter ticket summary:',
        validate: input => input.length > 0 || 'Summary is required'
      },
      {
        type: 'editor',
        name: 'description',
        message: '3) Enter ticket description (this will open your default editor):',
        validate: input => input.length > 0 || 'Description is required'
      }
    ];

    const basicAnswers = await inquirer.prompt(basicQuestions);

    // Handle components selection with autocomplete
    const selectedComponents = await this.selectComponents(components);

    // Continue with remaining questions
    const remainingQuestions = [
      {
        type: 'list',
        name: 'priority',
        message: '5) Select priority:',
        choices: [
          'Lowest',
          'Low',
          'Medium',
          'High',
          'Highest',
          'Blocker'
        ],
        default: this.config?.defaults?.priority || 'Medium',
        loop: false,
        pageSize: pageSize
      },
      {
        type: 'list',
        name: 'ticketClassification',
        message: '6) Select ticket classification:',
        choices: [
          'Bug',
          'Feature/Enhancement',
          'Operations',
          'R&D',
          'Risk',
          'Tech Debt'
        ],
        default: this.config?.defaults?.ticketClassification || 'Feature/Enhancement',
        loop: false,
        pageSize: pageSize
      }
    ];

    const remainingAnswers = await inquirer.prompt(remainingQuestions);

    return {
      ...basicAnswers,
      components: selectedComponents,
      ...remainingAnswers
    };
  }

  async selectComponents(availableComponents) {
    const selectedComponents = [];

    while (true) {
      const remainingComponents = availableComponents.filter(
        comp => !selectedComponents.includes(comp)
      );

      if (remainingComponents.length === 0) {
        console.log(chalk.yellow('All components have been selected.'));
        break;
      }

      // Add "Finish" option to the choices
      const choicesWithFinish = ['--- Finish selecting components ---', ...remainingComponents];

      const result = await this.customAutocompletePrompt({
        message: selectedComponents.length === 0
          ? '4) Select components (type to filter, Enter to select):'
          : `   Select another component (${selectedComponents.length} selected):`,
        choices: choicesWithFinish,
        pageSize: this.config?.ui?.pageSize || 10
      });

      if (result === '--- Finish selecting components ---') {
        break;
      }

      selectedComponents.push(result);
      console.log(chalk.green(`✓ Selected: ${result}`));
    }

    if (selectedComponents.length === 0) {
      console.log(chalk.yellow('No components selected. Proceeding without components.'));
    }

    return selectedComponents;
  }

  async customAutocompletePrompt({ message, choices, pageSize = 10 }) {
    const readline = require('readline');

    return new Promise((resolve) => {
      let filter = '';
      let selectedIndex = 0;
      let filteredChoices = choices;
      let isActive = true;

      // Hide cursor and clear screen initially
      process.stdout.write('\x1B[?25l'); // Hide cursor

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      // Enable raw mode
      process.stdin.setRawMode(true);

      const render = () => {
        if (!isActive) return;

        // Clear entire screen and go to top
        process.stdout.write('\x1B[2J\x1B[H');

        // Re-print the CLI header and previous questions context
        console.log(chalk.blue('🎫 Jira Ticket Creator\n'));
        console.log(chalk.green('✓ Work type: Task'));
        console.log(chalk.green('✓ Summary: [entered]'));
        console.log(chalk.green('✓ Description: [entered]\n'));

        // Show current question with filter
        const filterText = filter ? ` [Filter: "${filter}"]` : '';
        console.log(chalk.cyan(message) + filterText);

        // Calculate visible window
        const totalChoices = filteredChoices.length;
        let startIndex = 0;
        let endIndex = Math.min(pageSize, totalChoices);

        if (totalChoices > pageSize) {
          const halfPage = Math.floor(pageSize / 2);
          startIndex = Math.max(0, selectedIndex - halfPage);
          endIndex = Math.min(totalChoices, startIndex + pageSize);

          if (endIndex - startIndex < pageSize && totalChoices >= pageSize) {
            startIndex = Math.max(0, endIndex - pageSize);
          }
        }

        const visibleChoices = filteredChoices.slice(startIndex, endIndex);

        // Show choices
        for (let i = 0; i < visibleChoices.length; i++) {
          const actualIndex = startIndex + i;
          const isSelected = actualIndex === selectedIndex;
          const prefix = isSelected ? chalk.cyan('▶ ') : '  ';
          const choice = isSelected ? chalk.inverse(visibleChoices[i]) : visibleChoices[i];
          console.log(prefix + choice);
        }

        // Show pagination
        if (totalChoices > pageSize) {
          const currentPage = Math.floor(selectedIndex / pageSize) + 1;
          const totalPages = Math.ceil(totalChoices / pageSize);
          console.log(chalk.gray(`  ... ${totalChoices} total (page ${currentPage}/${totalPages})`));
        } else if (totalChoices > endIndex) {
          console.log(chalk.gray(`  ... and ${totalChoices - endIndex} more`));
        }
      };

      const filterChoices = () => {
        filteredChoices = choices.filter(choice =>
          choice.toLowerCase().includes(filter.toLowerCase())
        );
        selectedIndex = Math.min(selectedIndex, Math.max(0, filteredChoices.length - 1));
      };

      const cleanup = () => {
        if (!isActive) return;
        isActive = false;
        process.stdin.setRawMode(false);
        rl.close();

        // Show cursor and clear screen one final time to clean up
        process.stdout.write('\x1B[?25h'); // Show cursor
        process.stdout.write('\x1B[2J\x1B[H');

        // Print just the essential context
        console.log(chalk.blue('🎫 Jira Ticket Creator\n'));
        console.log(chalk.green('✓ Work type: Task'));
        console.log(chalk.green('✓ Summary: [entered]'));
        console.log(chalk.green('✓ Description: [entered]'));
        console.log(chalk.green('✓ Components: [selected]\n'));
      };

      // Initial display
      filterChoices();
      render();

      process.stdin.on('data', (key) => {
        if (!isActive) return;

        const keyCode = key[0];

        if (key.equals(Buffer.from([3]))) {
          cleanup();
          process.exit(0);
          return;
        }

        if (key.equals(Buffer.from([13]))) {
          if (filteredChoices.length > 0) {
            cleanup();
            resolve(filteredChoices[selectedIndex]);
            return;
          }
        }

        if (key.equals(Buffer.from([27, 91, 65]))) {
          if (selectedIndex > 0) {
            selectedIndex--;
            render();
          }
          return;
        }

        if (key.equals(Buffer.from([27, 91, 66]))) {
          if (selectedIndex < filteredChoices.length - 1) {
            selectedIndex++;
            render();
          }
          return;
        }

        if (keyCode === 127 || keyCode === 8) {
          if (filter.length > 0) {
            filter = filter.slice(0, -1);
            filterChoices();
            render();
          }
          return;
        }

        if (keyCode >= 32 && keyCode <= 126) {
          filter += key.toString();
          filterChoices();
          render();
          return;
        }
      });
    });
  }

  async showDryRun(ticketData) {
    console.log(chalk.yellow('\n🔍 DRY RUN MODE - No ticket will be created\n'));

    console.log(chalk.cyan('Ticket Data:'));
    console.log(chalk.white(JSON.stringify(ticketData, null, 2)));

    console.log(chalk.cyan('\nJira API Call that would be made:'));
    const apiCall = this.jiraService.buildCreateTicketPayload(ticketData, this.config);
    console.log(chalk.white('POST'), chalk.blue(`${this.config.jiraUrl}/rest/api/3/issue`));
    console.log(chalk.white('Headers:'));
    console.log(chalk.white('  Authorization: Basic [REDACTED]'));
    console.log(chalk.white('  Content-Type: application/json'));
    console.log(chalk.white('Payload:'));
    console.log(chalk.white(JSON.stringify(apiCall, null, 2)));

    console.log(chalk.yellow('\n📝 Manual Step Required:'));
    console.log(chalk.white('After creating the ticket, please manually update the "Software Capitalization Project" field in the Jira UI.'));
  }

  async createTicket(ticketData) {
    const spinner = ora('Creating Jira ticket...').start();

    try {
      const result = await this.jiraService.createTicket(ticketData, this.config);
      spinner.succeed('Ticket created successfully!');

      console.log(chalk.green('\n✅ Ticket Created:'));
      console.log(chalk.white(`Key: ${result.key}`));
      console.log(chalk.white(`ID: ${result.id}`));
      console.log(chalk.blue(`Link: ${this.config.jiraUrl}/browse/${result.key}`));

      console.log(chalk.yellow('\n📝 Manual Step Required:'));
      console.log(chalk.white('Please manually update the "Software Capitalization Project" field in the Jira UI.'));

    } catch (error) {
      spinner.fail('Failed to create ticket');
      throw error;
    }
  }

  async testConnection() {
    try {
      console.log(chalk.blue('🔗 Testing Jira Connection\n'));

      // Load configuration
      await this.loadConfig();

      const spinner = ora('Testing connection to Jira...').start();

      const userInfo = await this.jiraService.testConnection(this.config);
      spinner.succeed('Connection successful!');

      console.log(chalk.green('\n✅ Connected to Jira:'));
      console.log(chalk.white(`User: ${userInfo.displayName} (${userInfo.emailAddress})`));
      console.log(chalk.white(`Account ID: ${userInfo.accountId}`));
      console.log(chalk.white(`Jira URL: ${this.config.jiraUrl}`));
      console.log(chalk.white(`Project Key: ${this.config.projectKey}`));

      // Test component fetching
      const componentSpinner = ora('Testing component access...').start();
      try {
        const components = await this.jiraService.getProjectComponents(this.config);
        componentSpinner.succeed(`Found ${components.length} components in project`);
        console.log(chalk.white(`Components: ${components.slice(0, 3).join(', ')}${components.length > 3 ? '...' : ''}`));
      } catch (error) {
        componentSpinner.warn('Could not fetch components (will use defaults)');
      }

    } catch (error) {
      console.error(chalk.red('Connection failed:'), error.message);
      process.exit(1);
    }
  }

  async listCustomFields() {
    try {
      console.log(chalk.blue('🔍 Listing Custom Fields\n'));

      // Load configuration
      await this.loadConfig();

      const spinner = ora('Fetching all custom fields...').start();

      const fields = await this.jiraService.getAllFields(this.config);
      spinner.succeed(`Found ${fields.length} custom fields`);

      console.log(chalk.green('\n📋 Custom Fields in your Jira instance:\n'));

      // Group fields by relevance
      const relevantFields = [];
      const otherFields = [];

      fields.forEach(field => {
        const name = field.name.toLowerCase();
        if (name.includes('software') ||
            name.includes('capitalization') ||
            name.includes('capitalize') ||
            name.includes('classification') ||
            name.includes('category') ||
            name.includes('project')) {
          relevantFields.push(field);
        } else {
          otherFields.push(field);
        }
      });

      if (relevantFields.length > 0) {
        console.log(chalk.yellow('🎯 Potentially Relevant Fields:'));
        relevantFields.forEach(field => {
          console.log(chalk.cyan(`  ${field.id}`), chalk.white(`- ${field.name}`));
          if (field.description) {
            console.log(chalk.gray(`    Description: ${field.description}`));
          }
        });
        console.log('');
      }

      console.log(chalk.yellow('📄 All Custom Fields:'));
      otherFields.forEach(field => {
        console.log(chalk.cyan(`  ${field.id}`), chalk.white(`- ${field.name}`));
      });

      console.log(chalk.green('\n💡 To use a field, add it to your .jirarc file:'));
      console.log(chalk.white('  "customFields": {'));
      console.log(chalk.white('    "softwareCapitalizationProject": "customfield_XXXXX",'));
      console.log(chalk.white('    "ticketClassification": "customfield_YYYYY"'));
      console.log(chalk.white('  }'));

    } catch (error) {
      console.error(chalk.red('Failed to list fields:'), error.message);
      process.exit(1);
    }
  }

  async listFieldOptions(fieldId) {
    try {
      console.log(chalk.blue(`🔍 Getting options for field: ${fieldId}`));

      const config = await this.loadConfig();

      this.jiraService.initializeClient(config);
      const options = await this.jiraService.getFieldOptions(fieldId);

      if (!options || options.length === 0) {
        console.log(chalk.yellow('⚠️  No options found for this field.'));
        console.log(chalk.white('This could mean:'));
        console.log(chalk.white('  • The field is a text input (not a select field)'));
        console.log(chalk.white('  • The field doesn\'t exist'));
        console.log(chalk.white('  • You don\'t have permission to view the field options'));
        return;
      }

      console.log(chalk.green(`\n✅ Found ${options.length} option(s):`));
      console.log('');

      options.forEach((option, index) => {
        const displayValue = option.value || option.name || option.id || option;
        const description = option.description ? ` (${option.description})` : '';
        console.log(chalk.cyan(`  ${index + 1}.`), chalk.white(`${displayValue}${description}`));

        if (option.id && option.id !== displayValue) {
          console.log(chalk.gray(`     ID: ${option.id}`));
        }
      });

      console.log('');
      console.log(chalk.blue('💡 Usage: Use these exact values when setting defaults in your .jirarc file'));

    } catch (error) {
      console.error(chalk.red('Failed to get field options:'), error.message);
      process.exit(1);
    }
  }
}

module.exports = JiraTicketCLI;
