const inquirer = require('inquirer');
const autocomplete = require('inquirer-autocomplete-prompt');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const chalk = require('chalk');
const ora = require('ora');
const JiraService = require('./jira-service');

// Register the autocomplete prompt
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

    // Fetch components from Jira
    const spinner = ora('Loading project components...').start();
    let components;
    try {
      components = await this.jiraService.getProjectComponents(this.config);
      spinner.succeed('Components loaded from Jira');
    } catch (error) {
      spinner.warn('Using default components (could not fetch from Jira)');
      components = [
        'Frontend',
        'Backend',
        'API',
        'Database',
        'Infrastructure',
        'Documentation',
        'Testing',
        'Security',
        'Mobile',
        'DevOps'
      ];
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

      const componentQuestion = {
        type: 'autocomplete',
        name: 'component',
        message: selectedComponents.length === 0
          ? '4) Select components (type to filter, Enter to select, empty Enter to finish):'
          : `   Select another component (${selectedComponents.length} selected, empty Enter to finish):`,
        source: (answersSoFar, input) => {
          return new Promise((resolve) => {
            const searchTerm = input || '';
            const filtered = remainingComponents.filter(comp =>
              comp.toLowerCase().includes(searchTerm.toLowerCase())
            );
            // Add an option to finish selection
            const options = [...filtered];
            if (searchTerm === '') {
              options.unshift('--- Finish selecting components ---');
            }
            resolve(options);
          });
        },
        pageSize: this.config?.ui?.pageSize || 10
      };

      const answer = await inquirer.prompt([componentQuestion]);

      if (!answer.component || answer.component === '--- Finish selecting components ---') {
        break;
      }

      selectedComponents.push(answer.component);
      console.log(chalk.green(`   ✓ Added: ${answer.component}`));

      if (selectedComponents.length > 0) {
        console.log(chalk.cyan(`   Selected (${selectedComponents.length}): ${selectedComponents.join(', ')}`));
      }
    }

    if (selectedComponents.length === 0) {
      console.log(chalk.yellow('   No components selected.'));
    }

    return selectedComponents;
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
