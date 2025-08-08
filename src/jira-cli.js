const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const chalk = require('chalk');
const ora = require('ora');
const JiraService = require('./jira-service');

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
          return;
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Invalid JSON in ${configPath}`));
        }
      }
    }

    // If no config found, create a default one
    console.log(chalk.yellow('No configuration file found. Creating default configuration...\n'));
    await this.createDefaultConfig();
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
    
    const questions = [
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
      },
      {
        type: 'checkbox',
        name: 'components',
        message: '4) Select components:',
        choices: [
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
        ],
        loop: false,
        pageSize: pageSize
      },
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
      },
      {
        type: 'input',
        name: 'softwareCapitalizationProject',
        message: '7) Enter software capitalization project:',
        default: this.config?.defaults?.softwareCapitalizationProject || 'Lonely Planet Website'
      }
    ];

    return await inquirer.prompt(questions);
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
      
    } catch (error) {
      console.error(chalk.red('Connection failed:'), error.message);
      process.exit(1);
    }
  }
}

module.exports = JiraTicketCLI;
