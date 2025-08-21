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

      // Validate configuration
      this.validateConfiguration();

      // Validate token before proceeding
      await this.validateToken();

      // Collect ticket information
      const ticketData = await this.collectTicketData(isDryRun);

      // Create the ticket or show dry run
      if (isDryRun) {
        await this.showDryRun(ticketData);

        // Prompt user to optionally create the ticket after preview
        const shouldSubmit = await inquirer.prompt([{
          type: 'confirm',
          name: 'submit',
          message: 'Would you like to create this ticket?',
          default: false
        }]);

        if (shouldSubmit.submit) {
          console.log(chalk.blue('\n🚀 Creating ticket...'));
          await this.createTicket(ticketData);
        } else {
          console.log(chalk.yellow('\n✅ Preview completed - no ticket created'));
        }
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
        ticketClassification: 'Feature/Enhancement'
      },
      workTypes: [
        'Task',
        'Bug',
        'Epic',
        'Incident',
        'Story',
        'Initiative',
        'Deployment Task',
        'Feature'
      ],
      customFields: {
        ticketClassification: null
      },
      editor: {
        command: process.env.EDITOR
      },
      ui: {
        pageSize: 10
      },
      api: {
        assigneePageSize: 1000
      },
      componentTracking: {
        recentDays: 30,
        enabled: true
      },
      componentUsage: {},
      statusTracking: {
        recentDays: 30,
        enabled: true
      },
      statusUsage: {},
      assigneeTracking: {
        recentDays: 30,
        enabled: true
      },
      assigneeUsage: {}
    };

    const configPath = path.join(os.homedir(), '.jirarc');
    await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
    console.log(chalk.green(`✓ Configuration saved to: ${configPath}\n`));
  }

  validateConfiguration() {
    // Validate that default workType is in the workTypes list
    if (this.config?.defaults?.workType && this.config?.workTypes) {
      if (!this.config.workTypes.includes(this.config.defaults.workType)) {
        console.warn(chalk.yellow(`Warning: Default workType "${this.config.defaults.workType}" is not in the workTypes list`));
      }
    }
  }

  cleanupComponentUsage(availableComponents) {
    if (!this.config?.componentTracking?.enabled || !this.config?.componentUsage) {
      return;
    }

    const recentDays = this.config.componentTracking?.recentDays || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - recentDays);

    // Remove components that no longer exist in the project
    for (const componentName of Object.keys(this.config.componentUsage)) {
      if (!availableComponents.includes(componentName)) {
        delete this.config.componentUsage[componentName];
      }
    }

    // Remove components older than the recent days threshold
    for (const [componentName, usage] of Object.entries(this.config.componentUsage)) {
      const lastUsedDate = new Date(usage.lastUsed);
      if (lastUsedDate < cutoffDate) {
        delete this.config.componentUsage[componentName];
      }
    }
  }

  cleanupStatusUsage(availableStatuses) {
    if (!this.config?.statusTracking?.enabled || !this.config.statusUsage) {
      return;
    }

    const recentDays = this.config.statusTracking?.recentDays || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - recentDays);

    // Create array of available status names for easy lookup
    const availableStatusNames = new Set(availableStatuses.map(s => s.name));

    // Remove statuses that no longer exist or are too old
    for (const [statusName, usage] of Object.entries(this.config.statusUsage)) {
      const isOld = new Date(usage.lastUsed) < cutoffDate;
      const isNonExistent = !availableStatusNames.has(statusName);

      if (isOld || isNonExistent) {
        delete this.config.statusUsage[statusName];
      }
    }
  }

  cleanupAssigneeUsage(availableAssignees) {
    if (!this.config?.assigneeTracking?.enabled || !this.config.assigneeUsage) {
      return;
    }

    const recentDays = this.config.assigneeTracking?.recentDays || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - recentDays);

    // Create array of available assignee names for easy lookup
    const availableAssigneeNames = new Set(availableAssignees.map(a => a.displayName));

    // Remove assignees that no longer exist or are too old
    for (const [assigneeName, usage] of Object.entries(this.config.assigneeUsage)) {
      const isOld = new Date(usage.lastUsed) < cutoffDate;
      const isNonExistent = !availableAssigneeNames.has(assigneeName);

      if (isOld || isNonExistent) {
        delete this.config.assigneeUsage[assigneeName];
      }
    }
  }

  organizeComponents(availableComponents, selectedComponents = []) {
    if (!this.config?.componentTracking?.enabled) {
      // If tracking disabled, return all available components alphabetically
      return {
        recentComponents: [],
        otherComponents: availableComponents
          .filter(comp => !selectedComponents.includes(comp))
          .sort()
      };
    }

    const recentDays = this.config.componentTracking?.recentDays || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - recentDays);

    const recentComponents = [];
    const otherComponents = [];

    for (const component of availableComponents) {
      // Skip already selected components
      if (selectedComponents.includes(component)) {
        continue;
      }

      const usage = this.config.componentUsage?.[component];
      if (usage && new Date(usage.lastUsed) >= cutoffDate) {
        recentComponents.push(component);
      } else {
        otherComponents.push(component);
      }
    }

    return {
      recentComponents: recentComponents.sort(),
      otherComponents: otherComponents.sort()
    };
  }

  organizeStatuses(availableStatuses) {
    if (!this.config?.statusTracking?.enabled) {
      // If tracking disabled, return all available statuses alphabetically
      return {
        recentStatuses: [],
        otherStatuses: [...availableStatuses].sort((a, b) => a.name.localeCompare(b.name))
      };
    }

    const recentDays = this.config.statusTracking?.recentDays || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - recentDays);

    const recentStatuses = [];
    const otherStatuses = [];

    for (const status of availableStatuses) {
      const usage = this.config.statusUsage?.[status.name];
      if (usage && new Date(usage.lastUsed) >= cutoffDate) {
        recentStatuses.push(status);
      } else {
        otherStatuses.push(status);
      }
    }

    // Sort both arrays alphabetically by name
    recentStatuses.sort((a, b) => a.name.localeCompare(b.name));
    otherStatuses.sort((a, b) => a.name.localeCompare(b.name));

    return {
      recentStatuses,
      otherStatuses
    };
  }

  organizeAssignees(availableAssignees, currentUser) {
    // Filter out any invalid assignees first
    const validAssignees = availableAssignees.filter(assignee =>
      assignee &&
      assignee.accountId &&
      assignee.displayName &&
      assignee.displayName !== 'undefined' &&
      typeof assignee.displayName === 'string'
    );

    if (!this.config?.assigneeTracking?.enabled) {
      // If tracking disabled, return all available assignees alphabetically (excluding current user)
      return {
        recentAssignees: [],
        otherAssignees: validAssignees
          .filter(assignee => assignee.accountId !== currentUser.accountId)
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
      };
    }

    const recentDays = this.config.assigneeTracking?.recentDays || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - recentDays);

    const recentAssignees = [];
    const otherAssignees = [];

    for (const assignee of validAssignees) {
      // Skip current user
      if (assignee.accountId === currentUser.accountId) {
        continue;
      }

      const usage = this.config.assigneeUsage?.[assignee.displayName];
      if (usage && new Date(usage.lastUsed) >= cutoffDate) {
        recentAssignees.push(assignee);
      } else {
        otherAssignees.push(assignee);
      }
    }

    // Sort both arrays alphabetically by display name
    recentAssignees.sort((a, b) => a.displayName.localeCompare(b.displayName));
    otherAssignees.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return {
      recentAssignees,
      otherAssignees
    };
  }

  updateComponentUsage(componentName) {
    if (!this.config?.componentTracking?.enabled) {
      return;
    }

    if (!this.config.componentUsage) {
      this.config.componentUsage = {};
    }

    const now = new Date().toISOString();
    const existing = this.config.componentUsage[componentName];

    this.config.componentUsage[componentName] = {
      lastUsed: now,
      count: existing ? existing.count + 1 : 1
    };
  }

  updateStatusUsage(statusName) {
    if (!this.config?.statusTracking?.enabled) {
      return;
    }

    if (!this.config.statusUsage) {
      this.config.statusUsage = {};
    }

    const now = new Date().toISOString();
    const existing = this.config.statusUsage[statusName];

    this.config.statusUsage[statusName] = {
      lastUsed: now,
      count: existing ? existing.count + 1 : 1
    };
  }

  updateAssigneeUsage(assigneeName) {
    if (!this.config?.assigneeTracking?.enabled) {
      return;
    }

    if (!this.config.assigneeUsage) {
      this.config.assigneeUsage = {};
    }

    const now = new Date().toISOString();
    const existing = this.config.assigneeUsage[assigneeName];

    this.config.assigneeUsage[assigneeName] = {
      lastUsed: now,
      count: existing ? existing.count + 1 : 1
    };
  }

  async saveComponentUsage() {
    if (!this.config?.componentTracking?.enabled) {
      return;
    }

    // Find the config file path (same logic as loadConfig)
    const configPaths = [
      path.join(process.cwd(), '.jirarc'),
      path.join(os.homedir(), '.jirarc'),
      path.join(__dirname, '..', '.jirarc')
    ];

    for (const configPath of configPaths) {
      if (await fs.pathExists(configPath)) {
        try {
          await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
          return;
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Could not save component usage to ${configPath}`));
        }
      }
    }
  }

  async saveStatusUsage() {
    if (!this.config?.statusTracking?.enabled) {
      return;
    }

    // Find the config file path (same logic as loadConfig)
    const configPaths = [
      path.join(process.cwd(), '.jirarc'),
      path.join(os.homedir(), '.jirarc'),
      path.join(__dirname, '..', '.jirarc')
    ];

    for (const configPath of configPaths) {
      if (await fs.pathExists(configPath)) {
        try {
          await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
          return;
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Could not save status usage to ${configPath}`));
        }
      }
    }
  }

  async saveAssigneeUsage() {
    if (!this.config?.assigneeTracking?.enabled) {
      return;
    }

    // Find the config file path (same logic as loadConfig)
    const configPaths = [
      path.join(process.cwd(), '.jirarc'),
      path.join(os.homedir(), '.jirarc'),
      path.join(__dirname, '..', '.jirarc')
    ];

    for (const configPath of configPaths) {
      if (await fs.pathExists(configPath)) {
        try {
          await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
          return;
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Could not save assignee usage to ${configPath}`));
        }
      }
    }
  }

  async validateToken() {
    const spinner = ora('Validating API access...').start();

    try {
      // Test the token by making a simple API call
      await this.jiraService.testConnection(this.config);
      spinner.text = 'Testing project access...';

      // Test project access by fetching components
      await this.jiraService.getProjectComponents(this.config);
      spinner.succeed('API token and project access validated');
    } catch (error) {
      spinner.fail('API validation failed');

      // Provide helpful error messages based on the error type
      if (error.message.includes('401') || error.message.includes('unauthorized') || error.message.includes('invalid or expired')) {
        throw new Error(
          'API token has expired or is invalid.\n' +
          '  → Generate a new token at: https://id.atlassian.com/manage-profile/security/api-tokens\n' +
          '  → Update your .jirarc file with the new token'
        );
      } else if (error.message.includes('403') || error.message.includes('Access denied')) {
        throw new Error(
          'API token lacks sufficient permissions.\n' +
          '  → Ensure your Jira account has permission to create tickets\n' +
          '  → Check if your account has access to the project: ' + this.config.projectKey
        );
      } else if (error.message.includes('404') || error.message.includes('not found')) {
        throw new Error(
          'Project not found.\n' +
          '  → Verify the project key in .jirarc: ' + this.config.projectKey + '\n' +
          '  → Ensure the project exists and you have access to it'
        );
      } else if (error.message.includes('Network error') || error.message.includes('ENOTFOUND')) {
        throw new Error(
          'Cannot connect to Jira instance.\n' +
          '  → Check your internet connection\n' +
          '  → Verify the Jira URL in .jirarc: ' + this.config.jiraUrl
        );
      } else {
        throw new Error(
          'API validation failed: ' + error.message + '\n' +
          '  → Run `jira --test-connection` to test your configuration'
        );
      }
    }
  }

  async collectTicketData(isDryRun = false) {
    const pageSize = this.config?.ui?.pageSize || 10;

    // Get project data
    console.log(chalk.blue('📡 Fetching project data...'));
    const [components, statuses, currentUser] = await Promise.all([
      this.jiraService.getProjectComponents(this.config),
      this.jiraService.getProjectStatuses(this.config),
      this.jiraService.getCurrentUser(this.config)
    ]);

    // Get assignees separately with progress indicator
    console.log(chalk.blue('👥 Fetching assignable users (this may take a moment for large organizations)...'));
    const assignees = await this.jiraService.getProjectAssignees(this.config);

    // Clean up usage data
    this.cleanupComponentUsage(components);
    this.cleanupStatusUsage(statuses);
    this.cleanupAssigneeUsage(assignees);

    // Collect basic ticket information first
    const basicQuestions = [
      {
        type: 'list',
        name: 'workType',
        message: '1) Select work type:',
        choices: this.config?.workTypes || [
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
        message: this.config?.editor?.command
          ? `3) Enter ticket description (will open ${this.config.editor.command}):`
          : '3) Enter ticket description (this will open your default editor):',
        validate: input => input.length > 0 || 'Description is required',
        ...(this.config?.editor?.command && { editor: this.config.editor.command })
      }
    ];

    const basicAnswers = await inquirer.prompt(basicQuestions);

    // Handle components selection with autocomplete
    const selectedComponents = await this.selectComponents(components, basicAnswers, isDryRun);

    // Handle status selection (pass current state including components)
    const currentStateForStatus = { ...basicAnswers, components: selectedComponents };
    const selectedStatus = await this.selectStatus(statuses, currentStateForStatus, isDryRun);

    // Handle assignee selection (pass current state including components and status)
    const currentState = { ...basicAnswers, components: selectedComponents, status: selectedStatus };
    const selectedAssignee = await this.selectAssignee(assignees, currentUser, currentState, isDryRun);

        // Continue with remaining questions - handle individually for consistent formatting
    const priorityAnswer = await inquirer.prompt([{
      type: 'list',
      name: 'priority',
      message: '7) Select priority:',
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
    }]);

    // Clear the question line and show clean checkmark
    process.stdout.write('\x1B[1A\x1B[2K'); // Move up one line and clear it
    console.log(chalk.green(`✓ Priority: ${priorityAnswer.priority}`));

    const classificationAnswer = await inquirer.prompt([{
      type: 'list',
      name: 'ticketClassification',
      message: '8) Select ticket classification:',
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
    }]);

    // Clear the question line and show clean checkmark
    process.stdout.write('\x1B[1A\x1B[2K'); // Move up one line and clear it
    console.log(chalk.green(`✓ Classification: ${classificationAnswer.ticketClassification}`));

    const remainingAnswers = {
      priority: priorityAnswer.priority,
      ticketClassification: classificationAnswer.ticketClassification
    };

    // Combine all data
    const ticketData = {
      ...basicAnswers,
      components: selectedComponents,
      availableComponents: components,  // Include for dry run simulation
      status: selectedStatus,
      availableStatuses: statuses,  // Include for dry run simulation
      assignee: selectedAssignee,
      availableAssignees: assignees,  // Include for dry run simulation
      currentUser: currentUser,  // Include for dry run simulation
      ...remainingAnswers
    };

    // Don't clear screen - let user see the flow

    console.log(chalk.blue('🎫 Jira Ticket Creator\n'));
    console.log(chalk.green('✅ All data collected successfully!\n'));
    console.log(chalk.white(`Work Type: ${basicAnswers.workType}`));
    console.log(chalk.white(`Summary: ${basicAnswers.summary}`));
    console.log(chalk.white(`Description: ${basicAnswers.description.substring(0, 80)}${basicAnswers.description.length > 80 ? '...' : ''}`));
    if (selectedComponents.length > 0) {
      console.log(chalk.white(`Components:`));
      selectedComponents.forEach(comp => console.log(chalk.white(`  • ${comp}`)));
    } else {
      console.log(chalk.white(`Components: none`));
    }
    console.log(chalk.white(`Status: ${selectedStatus ? selectedStatus.name : 'default'}`));
    console.log(chalk.white(`Assignee: ${selectedAssignee ? (selectedAssignee.displayName || 'Assign myself') : 'unassigned'}`));
    console.log(chalk.white(`Priority: ${remainingAnswers.priority}`));
    console.log(chalk.white(`Classification: ${remainingAnswers.ticketClassification}`));

    return ticketData;
  }

  async selectStatus(availableStatuses, ticketData, isDryRun = false) {
    // Organize statuses with recent ones first
    const { recentStatuses, otherStatuses } = this.organizeStatuses(availableStatuses);

    // Build choices list
    const choices = [];

    // Add "Leave as default" option at the top
    choices.push('Leave as default (created status)');

    // Add recent statuses if any exist
    if (recentStatuses.length > 0) {
      choices.push(new inquirer.Separator('--- Recently Used ---'));
      recentStatuses.forEach(status => {
        choices.push({
          name: status.name,
          value: status
        });
      });
    }

    // Add other statuses
    if (otherStatuses.length > 0) {
      choices.push(new inquirer.Separator('--- Other Statuses ---'));
      otherStatuses.forEach(status => {
        choices.push({
          name: status.name,
          value: status
        });
      });
    }

    // Re-print the CLI header and previous questions context
    console.log(chalk.blue('🎫 Jira Ticket Creator\n'));
    console.log(chalk.green(`✓ Work type: ${ticketData.workType}`));
    console.log(chalk.green(`✓ Summary: ${ticketData.summary.substring(0, 50)}${ticketData.summary.length > 50 ? '...' : ''}`));
    console.log(chalk.green(`✓ Description: ${ticketData.description.substring(0, 60)}${ticketData.description.length > 60 ? '...' : ''}`));
    console.log(chalk.green(`✓ Components: ${ticketData.components ? ticketData.components.join(', ') : 'none selected'}\n`));

    const { selectedStatus } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedStatus',
      message: '5) Select initial status:',
      choices: choices,
      pageSize: this.config?.ui?.pageSize || 10,
      loop: false
    }]);

    if (selectedStatus === 'Leave as default (created status)') {
      return null;
    }

    // Update usage tracking only if not in dry run
    if (!isDryRun) {
      this.updateStatusUsage(selectedStatus.name);
    }

    return selectedStatus;
  }

  async selectAssignee(availableAssignees, currentUser, ticketData, isDryRun = false) {
    // Organize assignees with recent ones first (excluding current user from recent)
    const { recentAssignees, otherAssignees } = this.organizeAssignees(availableAssignees, currentUser);

    // Build choices list with autocomplete
    const choices = [];

    // Add "Assign myself" option at the very top
    choices.push({
      name: `Assign myself (${currentUser.displayName})`,
      value: currentUser
    });

    // Add "Leave unassigned" option
    choices.push('Leave unassigned');

    // Add recent assignees if any exist
    if (recentAssignees.length > 0) {
      choices.push(new inquirer.Separator('--- Recently Used ---'));
      recentAssignees.forEach(assignee => {
        if (assignee && assignee.displayName && assignee.displayName !== 'undefined') {
          choices.push({
            name: `${assignee.displayName} (${assignee.emailAddress || 'no email'})`,
            value: assignee
          });
        }
      });
    }

    // Add other assignees
    if (otherAssignees.length > 0) {
      choices.push(new inquirer.Separator('--- Other Assignees ---'));
      otherAssignees.forEach(assignee => {
        if (assignee && assignee.displayName && assignee.displayName !== 'undefined') {
          choices.push({
            name: `${assignee.displayName} (${assignee.emailAddress || 'no email'})`,
            value: assignee
          });
        }
      });
    }

    // Use custom autocomplete prompt for assignees
    const selectedAssignee = await this.customAssigneePrompt(choices, ticketData, currentUser);

    // Re-render context after assignee selection (since cleanup cleared screen)
    console.log(chalk.blue('🎫 Jira Ticket Creator\n'));
    console.log(chalk.green(`✓ Work type: ${ticketData.workType}`));
    console.log(chalk.green(`✓ Summary: ${ticketData.summary.substring(0, 50)}${ticketData.summary.length > 50 ? '...' : ''}`));
    console.log(chalk.green(`✓ Description: ${ticketData.description.substring(0, 60)}${ticketData.description.length > 60 ? '...' : ''}`));
    if (ticketData.components && ticketData.components.length > 0) {
      console.log(chalk.green(`✓ Components:`));
      ticketData.components.forEach(comp => console.log(chalk.green(`    • ${comp}`)));
    } else {
      console.log(chalk.green(`✓ Components: none selected`));
    }
    console.log(chalk.green(`✓ Status: ${ticketData.status ? ticketData.status.name : 'default (created status)'}`));

    // Show selection confirmation
    if (selectedAssignee === 'Leave unassigned') {
      console.log(chalk.green('✓ Assignee: unassigned'));
      console.log(''); // Add spacing
      return null;
    } else {
      console.log(chalk.green(`✓ Assignee: ${selectedAssignee.displayName}`));
      console.log(''); // Add spacing
    }

    // Update usage tracking only if not in dry run and not current user
    if (!isDryRun && selectedAssignee && selectedAssignee.accountId !== currentUser.accountId) {
      this.updateAssigneeUsage(selectedAssignee.displayName);
    }

    return selectedAssignee;
  }

  async selectComponents(availableComponents, ticketData, isDryRun = false) {
    const selectedComponents = [];

    while (true) {
      // Organize components into recently used and other
      const { recentComponents, otherComponents } = this.organizeComponents(availableComponents, selectedComponents);

      if (recentComponents.length === 0 && otherComponents.length === 0) {
        console.log(chalk.yellow('All components have been selected.'));
        break;
      }

      // Build choices list with proper layout
      const choices = ['--- Finish selecting components ---'];

      // Add recently used components
      if (recentComponents.length > 0) {
        choices.push(...recentComponents);
      }

      // Add "Other Components" header and components
      if (otherComponents.length > 0) {
        if (recentComponents.length > 0) {
          choices.push('--- Other Components ---');
        }
        choices.push(...otherComponents);
      }

      const result = await this.customAutocompletePrompt({
        message: selectedComponents.length === 0
          ? '4) Select components (type to filter, Enter to select):'
          : `   Select another component (${selectedComponents.length} selected):`,
        choices: choices,
        pageSize: this.config?.ui?.pageSize || 10,
        nonSelectableItems: ['--- Other Components ---'],
        ticketData: ticketData,
        selectedComponents: selectedComponents
      });

      if (result === '--- Finish selecting components ---') {
        break;
      }

      selectedComponents.push(result);
      if (!isDryRun) {
        this.updateComponentUsage(result);
      }
      console.log(chalk.green(`✓ Selected: ${result}`));
    }

    if (selectedComponents.length === 0) {
      console.log(chalk.yellow('No components selected. Proceeding without components.'));
    }

    return selectedComponents;
  }

  async customAssigneePrompt(choices, ticketData, currentUser) {
    return new Promise((resolve) => {
      let selectedIndex = 0;
      let filteredChoices = [...choices];
      let searchTerm = '';

      const nonSelectableItems = ['--- Recently Used ---', '--- Other Assignees ---'];

      const render = () => {
        // Only clear for the assignee menu (where it's needed for filtering)
        process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen and move to top

            // Re-print the CLI header and previous questions context
    console.log(chalk.blue('🎫 Jira Ticket Creator\n'));
    console.log(chalk.green(`✓ Work type: ${ticketData.workType}`));
    console.log(chalk.green(`✓ Summary: ${ticketData.summary.substring(0, 50)}${ticketData.summary.length > 50 ? '...' : ''}`));
    console.log(chalk.green(`✓ Description: ${ticketData.description.substring(0, 60)}${ticketData.description.length > 60 ? '...' : ''}`));
            if (ticketData.components && ticketData.components.length > 0) {
          console.log(chalk.green(`✓ Components:`));
          ticketData.components.forEach(comp => console.log(chalk.green(`    • ${comp}`)));
        } else {
          console.log(chalk.green(`✓ Components: none selected`));
        }
    console.log(chalk.green(`✓ Status: ${ticketData.status ? ticketData.status.name : 'default (created status)'}`));

                console.log('6) Select assignee (type to filter, Enter to select):');
        if (searchTerm) {
          console.log(chalk.gray(`   Filtering: "${searchTerm}"`));
        }
        console.log('');

        const pageSize = this.config?.ui?.pageSize || 10;
        const startIndex = Math.max(0, selectedIndex - Math.floor(pageSize / 2));
        const endIndex = Math.min(filteredChoices.length, startIndex + pageSize);

        for (let i = startIndex; i < endIndex; i++) {
          const choice = filteredChoices[i];
          const isSelected = i === selectedIndex;
          const isNonSelectable = typeof choice === 'string' && nonSelectableItems.includes(choice);

          let displayText;

          // Handle different choice types
          if (choice && choice.constructor && choice.constructor.name === 'Separator') {
            // This is a separator
            displayText = choice.separator || choice.line || '--- Separator ---';
            console.log(chalk.gray(`   ${displayText}`));
            continue; // Skip selection logic for separators
          } else if (typeof choice === 'object' && choice.name) {
            displayText = choice.name;
          } else if (typeof choice === 'string') {
            displayText = choice;
          } else {
            displayText = `UNKNOWN: ${JSON.stringify(choice)}`;
          }

          if (isNonSelectable) {
            // Non-selectable header
            console.log(chalk.gray(`   ${displayText}`));
          } else if (isSelected) {
            console.log(chalk.blue(`❯ ${displayText}`));
          } else {
            console.log(`  ${displayText}`);
          }
        }

        if (endIndex < filteredChoices.length) {
          console.log(chalk.gray(`   ... and ${filteredChoices.length - endIndex} more`));
        }
      };

            const filterChoices = () => {
        if (!searchTerm) {
          filteredChoices = [...choices];
        } else {
          filteredChoices = choices.filter(choice => {
            if (typeof choice === 'string') {
              return nonSelectableItems.includes(choice) ||
                     choice.toLowerCase().includes(searchTerm.toLowerCase());
            }
            return choice && choice.name && choice.name.toLowerCase().includes(searchTerm.toLowerCase());
          });
        }



                // Ensure selectedIndex is on a selectable item
        if (selectedIndex >= filteredChoices.length) {
          selectedIndex = filteredChoices.length - 1;
        }
        while (selectedIndex >= 0 &&
               (typeof filteredChoices[selectedIndex] === 'string' && nonSelectableItems.includes(filteredChoices[selectedIndex]) ||
                filteredChoices[selectedIndex] && filteredChoices[selectedIndex].constructor && filteredChoices[selectedIndex].constructor.name === 'Separator')) {
          selectedIndex++;
          if (selectedIndex >= filteredChoices.length) {
            selectedIndex = 0;
          }
        }
      };

      const cleanup = () => {
        process.stdin.setRawMode(false);
        process.stdin.removeAllListeners('data');
        process.stdin.pause();

        // Clear screen to remove the assignee menu
        process.stdout.write('\x1B[2J\x1B[0f');
      };

      process.stdin.setRawMode(true);
      process.stdin.resume();

      filterChoices();
      render();

      process.stdin.on('data', (data) => {
        const key = data.toString();

        if (key === '\r' || key === '\n') { // Enter
          const selectedChoice = filteredChoices[selectedIndex];
          if (selectedChoice &&
              !(typeof selectedChoice === 'string' && nonSelectableItems.includes(selectedChoice))) {
            cleanup();
            resolve(selectedChoice === 'Leave unassigned' ? selectedChoice : selectedChoice.value || selectedChoice);
            return;
          }
                } else if (key === '\x1b[A') { // Up arrow
          selectedIndex = Math.max(0, selectedIndex - 1);
          // Skip non-selectable items and separators
          while (selectedIndex >= 0 &&
                 (typeof filteredChoices[selectedIndex] === 'string' && nonSelectableItems.includes(filteredChoices[selectedIndex]) ||
                  filteredChoices[selectedIndex] && filteredChoices[selectedIndex].constructor && filteredChoices[selectedIndex].constructor.name === 'Separator')) {
            selectedIndex--;
          }
          if (selectedIndex < 0) selectedIndex = 0;
          render();
        } else if (key === '\x1b[B') { // Down arrow
          selectedIndex = Math.min(filteredChoices.length - 1, selectedIndex + 1);
          // Skip non-selectable items and separators
          while (selectedIndex < filteredChoices.length &&
                 (typeof filteredChoices[selectedIndex] === 'string' && nonSelectableItems.includes(filteredChoices[selectedIndex]) ||
                  filteredChoices[selectedIndex] && filteredChoices[selectedIndex].constructor && filteredChoices[selectedIndex].constructor.name === 'Separator')) {
            selectedIndex++;
          }
          if (selectedIndex >= filteredChoices.length) selectedIndex = filteredChoices.length - 1;
          render();
        } else if (key === '\x7f' || key === '\b') { // Backspace
          if (searchTerm.length > 0) {
            searchTerm = searchTerm.slice(0, -1);
            filterChoices();
            render();
          }
        } else if (key === '\x03') { // Ctrl+C
          cleanup();
          process.exit(0);
        } else if (key.length === 1 && key >= ' ') { // Regular character
          searchTerm += key;
          filterChoices();
          render();
        }
      });
    });
  }

  async customAutocompletePrompt({ message, choices, pageSize = 10, nonSelectableItems = [], ticketData = {}, selectedComponents = [] }) {
    // Helper function to truncate text
    const truncateText = (text, maxLength = 50) => {
      if (!text) return '[not entered]';
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength - 3) + '...';
    };
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
        console.log(chalk.green(`✓ Work type: ${ticketData.workType || 'Task'}`));
        console.log(chalk.green(`✓ Summary: ${truncateText(ticketData.summary)}`));
        console.log(chalk.green(`✓ Description: ${truncateText(ticketData.description, 60)}\n`));

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

      const findNextSelectableIndex = (currentIndex, direction) => {
        const len = filteredChoices.length;
        let newIndex = currentIndex;

        for (let i = 0; i < len; i++) {
          newIndex = direction > 0
            ? (newIndex + 1) % len
            : (newIndex - 1 + len) % len;

          if (!nonSelectableItems.includes(filteredChoices[newIndex])) {
            return newIndex;
          }
        }
        return currentIndex; // If no selectable items found, stay at current
      };

      const filterChoices = () => {
        filteredChoices = choices.filter(choice =>
          choice.toLowerCase().includes(filter.toLowerCase())
        );

        // Remove duplicates while preserving order
        const seen = new Set();
        filteredChoices = filteredChoices.filter(choice => {
          if (seen.has(choice)) return false;
          seen.add(choice);
          return true;
        });

        selectedIndex = Math.min(selectedIndex, Math.max(0, filteredChoices.length - 1));

        // Ensure we start on a selectable item
        if (filteredChoices.length > 0 && nonSelectableItems.includes(filteredChoices[selectedIndex])) {
          selectedIndex = findNextSelectableIndex(selectedIndex, 1);
        }
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
        console.log(chalk.green(`✓ Work type: ${ticketData.workType || 'Task'}`));
        console.log(chalk.green(`✓ Summary: ${truncateText(ticketData.summary)}`));
        console.log(chalk.green(`✓ Description: ${truncateText(ticketData.description, 60)}`));
        if (selectedComponents && selectedComponents.length > 0) {
          console.log(chalk.green(`✓ Components:`));
          selectedComponents.forEach(comp => console.log(chalk.green(`    • ${comp}`)));
        } else {
          console.log(chalk.green(`✓ Components: none selected`));
        }
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
            const selectedChoice = filteredChoices[selectedIndex];
            // Don't allow selection of non-selectable items
            if (!nonSelectableItems.includes(selectedChoice)) {
            cleanup();
              resolve(selectedChoice);
            return;
            }
          }
        }

        if (key.equals(Buffer.from([27, 91, 65]))) {
          const newIndex = findNextSelectableIndex(selectedIndex, -1);
          if (newIndex !== selectedIndex) {
            selectedIndex = newIndex;
            render();
          }
          return;
        }

        if (key.equals(Buffer.from([27, 91, 66]))) {
          const newIndex = findNextSelectableIndex(selectedIndex, 1);
          if (newIndex !== selectedIndex) {
            selectedIndex = newIndex;
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

  simulateAllConfigChanges(ticketData) {
    // Create a deep copy of the current config
    const simulatedConfig = JSON.parse(JSON.stringify(this.config));
    let hasChanges = false;

    // 1. Simulate component cleanup and updates
    if (simulatedConfig.componentUsage && ticketData.availableComponents) {
      const originalUsageCount = Object.keys(simulatedConfig.componentUsage).length;

      // Remove components that no longer exist in the project
      for (const componentName of Object.keys(simulatedConfig.componentUsage)) {
        if (!ticketData.availableComponents.includes(componentName)) {
          delete simulatedConfig.componentUsage[componentName];
          hasChanges = true;
        }
      }

      // Remove components older than the recent days threshold
      const recentDays = simulatedConfig.componentTracking?.recentDays || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - recentDays);

      for (const [componentName, usage] of Object.entries(simulatedConfig.componentUsage)) {
        const lastUsedDate = new Date(usage.lastUsed);
        if (lastUsedDate < cutoffDate) {
          delete simulatedConfig.componentUsage[componentName];
          hasChanges = true;
        }
      }

      // Check if cleanup removed any items
      const newUsageCount = Object.keys(simulatedConfig.componentUsage).length;
      if (originalUsageCount !== newUsageCount) {
        hasChanges = true;
      }
    }

    // 2. Simulate usage updates for components
    if (simulatedConfig.componentTracking?.enabled && ticketData.components) {
      if (!simulatedConfig.componentUsage) {
        simulatedConfig.componentUsage = {};
      }

      const now = new Date().toISOString();
      for (const componentName of ticketData.components) {
        const existing = simulatedConfig.componentUsage[componentName];
        simulatedConfig.componentUsage[componentName] = {
          lastUsed: now,
          count: existing ? existing.count + 1 : 1
        };
        hasChanges = true;
      }
    }

    // 3. Simulate status cleanup and updates
    if (simulatedConfig.statusUsage && ticketData.availableStatuses) {
      const originalStatusUsageCount = Object.keys(simulatedConfig.statusUsage).length;
      const availableStatusNames = new Set(ticketData.availableStatuses.map(s => s.name));

      // Remove statuses that no longer exist or are too old
      const statusRecentDays = simulatedConfig.statusTracking?.recentDays || 30;
      const statusCutoffDate = new Date();
      statusCutoffDate.setDate(statusCutoffDate.getDate() - statusRecentDays);

      for (const [statusName, usage] of Object.entries(simulatedConfig.statusUsage)) {
        const isOld = new Date(usage.lastUsed) < statusCutoffDate;
        const isNonExistent = !availableStatusNames.has(statusName);

        if (isOld || isNonExistent) {
          delete simulatedConfig.statusUsage[statusName];
          hasChanges = true;
        }
      }
    }

    // 4. Simulate usage updates for status
    if (simulatedConfig.statusTracking?.enabled && ticketData.status) {
      if (!simulatedConfig.statusUsage) {
        simulatedConfig.statusUsage = {};
      }

      const now = new Date().toISOString();
      const existing = simulatedConfig.statusUsage[ticketData.status.name];
      simulatedConfig.statusUsage[ticketData.status.name] = {
        lastUsed: now,
        count: existing ? existing.count + 1 : 1
      };
      hasChanges = true;
    }

    // 5. Simulate assignee cleanup and updates
    if (simulatedConfig.assigneeUsage && ticketData.availableAssignees) {
      const originalAssigneeUsageCount = Object.keys(simulatedConfig.assigneeUsage).length;
      const availableAssigneeNames = new Set(ticketData.availableAssignees.map(a => a.displayName));

      // Remove assignees that no longer exist or are too old
      const assigneeRecentDays = simulatedConfig.assigneeTracking?.recentDays || 30;
      const assigneeCutoffDate = new Date();
      assigneeCutoffDate.setDate(assigneeCutoffDate.getDate() - assigneeRecentDays);

      for (const [assigneeName, usage] of Object.entries(simulatedConfig.assigneeUsage)) {
        const isOld = new Date(usage.lastUsed) < assigneeCutoffDate;
        const isNonExistent = !availableAssigneeNames.has(assigneeName);

        if (isOld || isNonExistent) {
          delete simulatedConfig.assigneeUsage[assigneeName];
          hasChanges = true;
        }
      }
    }

    // 6. Simulate usage updates for assignee
    if (simulatedConfig.assigneeTracking?.enabled && ticketData.assignee && ticketData.currentUser &&
        ticketData.assignee.accountId !== ticketData.currentUser.accountId) {
      if (!simulatedConfig.assigneeUsage) {
        simulatedConfig.assigneeUsage = {};
      }

      const now = new Date().toISOString();
      const existing = simulatedConfig.assigneeUsage[ticketData.assignee.displayName];
      simulatedConfig.assigneeUsage[ticketData.assignee.displayName] = {
        lastUsed: now,
        count: existing ? existing.count + 1 : 1
      };
      hasChanges = true;
    }

    return hasChanges ? simulatedConfig : null;
  }

  async showDryRun(ticketData) {
    console.log(chalk.yellow('\n🔍 DRY RUN MODE - No ticket will be created\n'));

    console.log(chalk.cyan('Ticket Summary:'));
    console.log(chalk.white(`  Work Type: ${ticketData.workType}`));
    console.log(chalk.white(`  Summary: ${ticketData.summary}`));
    console.log(chalk.white(`  Description: ${ticketData.description.substring(0, 100)}${ticketData.description.length > 100 ? '...' : ''}`));
    if (ticketData.components && ticketData.components.length > 0) {
      console.log(chalk.white(`  Components:`));
      ticketData.components.forEach(comp => console.log(chalk.white(`    • ${comp}`)));
    } else {
      console.log(chalk.white(`  Components: none`));
    }
    console.log(chalk.white(`  Status: ${ticketData.status ? ticketData.status.name : 'default (created status)'}`));
    console.log(chalk.white(`  Assignee: ${ticketData.assignee ? ticketData.assignee.displayName : 'unassigned'}`));
    console.log(chalk.white(`  Priority: ${ticketData.priority}`));
    console.log(chalk.white(`  Classification: ${ticketData.ticketClassification}`));



    console.log(chalk.cyan('\nJira API Calls that would be made:'));

    // 1. Create ticket call
    const apiCall = this.jiraService.buildCreateTicketPayload(ticketData, this.config);
    console.log(chalk.white('1. CREATE TICKET:'));
    console.log(chalk.white('   POST'), chalk.blue(`${this.config.jiraUrl}/rest/api/3/issue`));
    console.log(chalk.white('   Payload:'));
    console.log(chalk.white(JSON.stringify(apiCall, null, 2)));

    // 2. Status transition call (if status selected)
    if (ticketData.status) {
      console.log(chalk.white('\n2. SET STATUS:'));
      console.log(chalk.white('   POST'), chalk.blue(`${this.config.jiraUrl}/rest/api/3/issue/[TICKET-KEY]/transitions`));
      console.log(chalk.white('   Payload:'));
      console.log(chalk.white(JSON.stringify({
        transition: {
          id: ticketData.status.id.toString()
        }
      }, null, 2)));
    }

        // Show what changes would be made to .jirarc
    const simulatedConfig = this.simulateAllConfigChanges(ticketData);

    console.log(chalk.cyan('\n.jirarc changes that would be made:'));

    if (simulatedConfig) {
      // Show the current state
      console.log(chalk.white('Before:'));
      console.log(chalk.gray(JSON.stringify({
        componentTracking: this.config.componentTracking || {},
        componentUsage: this.config.componentUsage || {},
        statusTracking: this.config.statusTracking || {},
        statusUsage: this.config.statusUsage || {},
        assigneeTracking: this.config.assigneeTracking || {},
        assigneeUsage: this.config.assigneeUsage || {}
      }, null, 2)));

      // Show the simulated state
      console.log(chalk.white('\nAfter:'));
      console.log(chalk.white(JSON.stringify({
        componentTracking: simulatedConfig.componentTracking || {},
        componentUsage: simulatedConfig.componentUsage || {},
        statusTracking: simulatedConfig.statusTracking || {},
        statusUsage: simulatedConfig.statusUsage || {},
        assigneeTracking: simulatedConfig.assigneeTracking || {},
        assigneeUsage: simulatedConfig.assigneeUsage || {}
      }, null, 2)));

      // Show summary of changes
      const changes = [];

      // Check for component cleanup changes
      const originalUsageKeys = Object.keys(this.config.componentUsage || {});
      const simulatedUsageKeys = Object.keys(simulatedConfig.componentUsage || {});
      const removedComponents = originalUsageKeys.filter(key => !simulatedUsageKeys.includes(key));

      if (removedComponents.length > 0) {
        changes.push(`Removed old/non-existent components: ${removedComponents.join(', ')}`);
      }

      // Check for status cleanup changes
      const originalStatusKeys = Object.keys(this.config.statusUsage || {});
      const simulatedStatusKeys = Object.keys(simulatedConfig.statusUsage || {});
      const removedStatuses = originalStatusKeys.filter(key => !simulatedStatusKeys.includes(key));

      if (removedStatuses.length > 0) {
        changes.push(`Removed old/non-existent statuses: ${removedStatuses.join(', ')}`);
      }

      // Check for assignee cleanup changes
      const originalAssigneeKeys = Object.keys(this.config.assigneeUsage || {});
      const simulatedAssigneeKeys = Object.keys(simulatedConfig.assigneeUsage || {});
      const removedAssignees = originalAssigneeKeys.filter(key => !simulatedAssigneeKeys.includes(key));

      if (removedAssignees.length > 0) {
        changes.push(`Removed old/non-existent assignees: ${removedAssignees.join(', ')}`);
      }

      // Check for new/updated components
      if (ticketData.components && ticketData.components.length > 0) {
        changes.push(`Updated component usage for: ${ticketData.components.length} component(s)`);
      }

      // Check for new/updated status
      if (ticketData.status) {
        changes.push(`Updated status usage for: ${ticketData.status.name}`);
      }

      // Check for new/updated assignee
      if (ticketData.assignee && ticketData.currentUser &&
          ticketData.assignee.accountId !== ticketData.currentUser.accountId) {
        changes.push(`Updated assignee usage for: ${ticketData.assignee.displayName}`);
      }

      if (changes.length > 0) {
        console.log(chalk.white('\nChanges summary:'));
        changes.forEach(change => console.log(chalk.white(`  • ${change}`)));
      }

      // Show tracking status
      if (this.config?.componentTracking?.enabled === false) {
        console.log(chalk.yellow('\nNote: Component tracking is currently disabled. Enable it to apply these changes.'));
      }
    } else {
      console.log(chalk.gray('No changes would be made to .jirarc'));
      if (!ticketData.components || ticketData.components.length === 0) {
        console.log(chalk.gray('(No components selected)'));
      } else if (this.config?.componentTracking?.enabled === false) {
        console.log(chalk.gray('(Component tracking is disabled)'));
      }
    }

    console.log(chalk.yellow('\n📝 Manual Step Required:'));
    console.log(chalk.white('After creating the ticket, please manually update the "Software Capitalization Project" field in the Jira UI.'));
  }

  async createTicket(ticketData) {
    const spinner = ora('Creating Jira ticket...').start();

    try {
      const result = await this.jiraService.createTicket(ticketData, this.config);
      spinner.succeed('Ticket created successfully!');

      // Set status if one was selected (requires separate API call after creation)
      if (ticketData.status) {
        const statusSpinner = ora(`Setting status to "${ticketData.status.name}"...`).start();
        try {
          await this.jiraService.transitionTicket(result.key, ticketData.status.id, this.config);
          statusSpinner.succeed(`Status set to "${ticketData.status.name}"`);
        } catch (error) {
          statusSpinner.fail(`Failed to set status: ${error.message}`);
          console.log(chalk.yellow(`Warning: Status could not be applied. You may need to set it manually in Jira.`));
        }
      }

      // Save component usage after successful ticket creation
      await this.saveComponentUsage();
      await this.saveStatusUsage();
      await this.saveAssigneeUsage();

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
        const components = await this.jiraService.getProjectComponents(this.config);
        componentSpinner.succeed(`Found ${components.length} components in project`);
        console.log(chalk.white(`Components: ${components.slice(0, 3).join(', ')}${components.length > 3 ? '...' : ''}`));

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
      console.log(chalk.white('    "ticketClassification": "customfield_XXXXX"'));
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
