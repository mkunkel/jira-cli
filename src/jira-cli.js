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

          // Auto-migrate config if missing sections
          const needsMigration = await this.migrateConfig(configPath);
          if (needsMigration) {
            console.log(chalk.blue('ℹ️  Config updated with new tracking features'));
          }

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

  async migrateConfig(configPath) {
    let needsUpdate = false;

    // Add missing statusTracking section
    if (!this.config.statusTracking) {
      this.config.statusTracking = {
        recentDays: 30,
        enabled: true
      };
      needsUpdate = true;
    }

    // Add missing statusUsage section
    if (!this.config.statusUsage) {
      this.config.statusUsage = {};
      needsUpdate = true;
    }

    // Add missing assigneeTracking section
    if (!this.config.assigneeTracking) {
      this.config.assigneeTracking = {
        recentDays: 30,
        enabled: true
      };
      needsUpdate = true;
    }

    // Add missing assigneeUsage section
    if (!this.config.assigneeUsage) {
      this.config.assigneeUsage = {};
      needsUpdate = true;
    }

    // Add missing api section or missing properties
    if (!this.config.api) {
      this.config.api = {
        assigneePageSize: 1000
      };
      needsUpdate = true;
    } else if (!this.config.api.assigneePageSize) {
      this.config.api.assigneePageSize = 1000;
      needsUpdate = true;
    }

    // Add missing ticketTracking section
    if (!this.config.ticketTracking) {
      this.config.ticketTracking = {
        enabled: true,
        trackingDays: 90,
        doneStatusTrackingDays: 14,
        allowedStatuses: ["To Do", "In Progress", "In Review", "Ready for Testing", "Done"]
      };
      needsUpdate = true;
    } else if (!this.config.ticketTracking.allowedStatuses) {
      this.config.ticketTracking.allowedStatuses = ["To Do", "In Progress", "In Review", "Ready for Testing", "Done"];
      needsUpdate = true;
    }

    // Add missing ui.listPageSize
    if (!this.config.ui) {
      this.config.ui = {
        pageSize: 10,
        listPageSize: 25
      };
      needsUpdate = true;
    } else if (!this.config.ui.listPageSize) {
      this.config.ui.listPageSize = 25;
      needsUpdate = true;
    }

    // Add missing trackedTickets section
    if (!this.config.trackedTickets) {
      this.config.trackedTickets = {};
      needsUpdate = true;
    }

    // Save updated config if changes were made
    if (needsUpdate) {
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
    }

    return needsUpdate;
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
        pageSize: 10,
        listPageSize: 25
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
      assigneeUsage: {},
      ticketTracking: {
        enabled: true,
        trackingDays: 90,
        doneStatusTrackingDays: 14,
        allowedStatuses: ["To Do", "In Progress", "In Review", "Ready for Testing", "Done"]
      },
      trackedTickets: {}
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

  addTrackedTicket(ticketKey, ticketData) {
    if (!this.config?.ticketTracking?.enabled) {
      return;
    }

    if (!this.config.trackedTickets) {
      this.config.trackedTickets = {};
    }

    const now = new Date().toISOString();
    this.config.trackedTickets[ticketKey] = {
      summary: ticketData.summary,
      status: ticketData.status ? ticketData.status.name : 'Unknown',
      workType: ticketData.workType,
      assignee: ticketData.assignee ? ticketData.assignee.displayName : 'Unassigned',
      createdAt: now,
      updatedAt: now,
      createdBy: 'cli'
    };
  }

  updateTrackedTicketStatus(ticketKey, newStatus) {
    if (!this.config?.ticketTracking?.enabled || !this.config.trackedTickets?.[ticketKey]) {
      return;
    }

    this.config.trackedTickets[ticketKey].status = newStatus;
    this.config.trackedTickets[ticketKey].updatedAt = new Date().toISOString();
  }

  removeTrackedTicket(ticketKey) {
    if (!this.config?.ticketTracking?.enabled || !this.config.trackedTickets) {
      return;
    }

    delete this.config.trackedTickets[ticketKey];
  }

  cleanupOldTrackedTickets() {
    if (!this.config?.ticketTracking?.enabled || !this.config.trackedTickets) {
      return;
    }

    const trackingDays = this.config.ticketTracking.trackingDays || 90;
    const doneStatusTrackingDays = this.config.ticketTracking.doneStatusTrackingDays || 14;
    const now = new Date();

    const doneStatuses = ['Done', 'Closed', 'Resolved', 'Complete', 'Completed'];

    for (const [ticketKey, ticket] of Object.entries(this.config.trackedTickets)) {
      const updatedDate = new Date(ticket.updatedAt);
      const isDoneStatus = doneStatuses.some(status =>
        ticket.status.toLowerCase().includes(status.toLowerCase())
      );

      let daysSinceUpdate = Math.floor((now - updatedDate) / (1000 * 60 * 60 * 24));

      // Use different thresholds for done vs active tickets
      const threshold = isDoneStatus ? doneStatusTrackingDays : trackingDays;

      if (daysSinceUpdate > threshold) {
        delete this.config.trackedTickets[ticketKey];
      }
    }
  }

  async saveTrackedTickets() {
    if (!this.config?.ticketTracking?.enabled) {
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
          console.warn(chalk.yellow(`Warning: Could not save tracked tickets to ${configPath}`));
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

  async moveTicket(ticketKey) {
    try {
      console.log(chalk.blue('🎫 Jira Ticket Mover\n'));

      // Load configuration
      await this.loadConfig();

      // Normalize ticket key if it's numeric
      ticketKey = this.normalizeTicketKey(ticketKey);

      // Validate configuration
      this.validateConfiguration();

      // Validate token before proceeding
      await this.validateToken();

      // Clean up old tracked tickets first
      this.cleanupOldTrackedTickets();

      let selectedTicket = null;

      if (ticketKey) {
        // Ticket key provided, fetch its details
        console.log(chalk.cyan(`📋 Fetching ticket details for ${ticketKey}...`));
        try {
          selectedTicket = await this.jiraService.getTicketDetails(ticketKey, this.config);
        } catch (error) {
          console.error(chalk.red(`Error: ${error.message}`));
          process.exit(1);
        }
      } else {
        // No ticket key provided, show selection menu
        selectedTicket = await this.selectTicketFromList();
      }

      if (!selectedTicket) {
        console.log(chalk.yellow('No ticket selected. Exiting.'));
        return;
      }

      // Show status transition menu
      await this.showStatusTransitionMenu(selectedTicket);

    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  async listTickets() {
    try {
      console.log(chalk.blue('📋 Jira Ticket List\n'));

      // Load configuration
      await this.loadConfig();

      // Validate configuration
      this.validateConfiguration();

      // Validate token before proceeding
      await this.validateToken();

      // Clean up old tracked tickets first
      this.cleanupOldTrackedTickets();

      const spinner = ora('Fetching all tickets...').start();

      try {
        // Get tracked tickets from local config
        const trackedTickets = this.config.trackedTickets || {};

        // Get ALL assigned tickets from Jira (including completed ones)
        const assignedTickets = await this.jiraService.getAllAssignedTickets(this.config);

        spinner.succeed('Tickets loaded');

        // Combine and deduplicate tickets
        const allTickets = this.combineAllTickets(trackedTickets, assignedTickets);

        if (allTickets.length === 0) {
          console.log(chalk.yellow('No tickets found.'));
          console.log(chalk.white('Create tickets using the CLI or get assigned tickets in Jira to see them here.'));
          return;
        }

        // Filter out old done tickets
        const filteredTickets = this.filterOldDoneTickets(allTickets);

        if (filteredTickets.length === 0) {
          console.log(chalk.yellow('No active tickets found.'));
          console.log(chalk.white('All tickets are either completed or have been done for too long.'));
          return;
        }

        // Group tickets by status and display
        await this.displayTicketsByStatus(filteredTickets);

      } catch (error) {
        spinner.fail('Failed to fetch tickets');
        throw error;
      }

    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  combineAllTickets(trackedTickets, assignedTickets) {
    const ticketMap = new Map();

    // Add tracked tickets
    for (const [key, ticket] of Object.entries(trackedTickets)) {
      ticketMap.set(key, {
        key: key,
        summary: ticket.summary,
        status: ticket.status,
        workType: ticket.workType,
        assignee: ticket.assignee,
        updated: ticket.updatedAt,
        source: 'tracked'
      });
    }

    // Add assigned tickets (will overwrite if same key exists with more recent data)
    for (const ticket of assignedTickets) {
      ticketMap.set(ticket.key, ticket);
    }

    // Convert to array - no sorting needed for list view, we'll group by status
    return Array.from(ticketMap.values());
  }

  filterOldDoneTickets(tickets) {
    const doneStatusTrackingDays = this.config?.ticketTracking?.doneStatusTrackingDays || 14;
    const now = new Date();
    const doneStatuses = ['Done', 'Closed', 'Resolved', 'Complete', 'Completed'];

    return tickets.filter(ticket => {
      // Check if this is a done status
      const isDoneStatus = doneStatuses.some(doneStatus =>
        ticket.status.toLowerCase().includes(doneStatus.toLowerCase())
      );

      // If it's not a done status, keep it
      if (!isDoneStatus) {
        return true;
      }

      // If it is a done status, check how old it is
      const updatedDate = new Date(ticket.updated);
      const daysSinceUpdate = Math.floor((now - updatedDate) / (1000 * 60 * 60 * 24));

      // Keep it only if it's newer than the threshold
      return daysSinceUpdate <= doneStatusTrackingDays;
    });
  }

  async displayTicketsByStatus(tickets) {
    // Group tickets by status
    const ticketsByStatus = new Map();

    for (const ticket of tickets) {
      if (!ticketsByStatus.has(ticket.status)) {
        ticketsByStatus.set(ticket.status, []);
      }
      ticketsByStatus.get(ticket.status).push(ticket);
    }

    // Get allowed statuses for ordering
    const allowedStatuses = this.config?.ticketTracking?.allowedStatuses || [];

    // Create ordered list of statuses
    const orderedStatuses = [];

    // First, add allowed statuses in configured order
    for (const status of allowedStatuses) {
      if (ticketsByStatus.has(status)) {
        orderedStatuses.push(status);
      }
    }

    // Then add remaining statuses alphabetically
    const remainingStatuses = Array.from(ticketsByStatus.keys())
      .filter(status => !allowedStatuses.includes(status))
      .sort();

    orderedStatuses.push(...remainingStatuses);

    // Build scrollable list items
    const listItems = [];
    let totalTickets = 0;

    for (const status of orderedStatuses) {
      const statusTickets = ticketsByStatus.get(status);
      if (!statusTickets || statusTickets.length === 0) continue;

      // Sort tickets within each status by ticket number
      statusTickets.sort((a, b) => this.compareTicketNumbers(a.key, b.key));

      // Determine status color
      const isDoneStatus = ['Done', 'Closed', 'Resolved', 'Complete', 'Completed']
        .some(doneStatus => status.toLowerCase().includes(doneStatus.toLowerCase()));
      const statusColor = isDoneStatus ? chalk.green : chalk.yellow;

      // Add status header
      listItems.push(new inquirer.Separator(statusColor(`📌 ${status} (${statusTickets.length})`)));

      // Add tickets in this status
      for (const ticket of statusTickets) {
        const truncatedSummary = ticket.summary.length > 80
          ? ticket.summary.substring(0, 77) + '...'
          : ticket.summary;

        const sourceIndicator = ticket.source === 'tracked' ? '📌' : '👤';
        const ticketLine = `${sourceIndicator} ${chalk.white(ticket.key)} - ${truncatedSummary}`;

        listItems.push({
          name: ticketLine,
          value: ticket.key,
          short: ticket.key
        });
      }

      totalTickets += statusTickets.length;

      // Add spacing between status groups
      if (status !== orderedStatuses[orderedStatuses.length - 1]) {
        listItems.push(new inquirer.Separator(' '));
      }
    }

    // Add summary separator and exit option
    listItems.push(new inquirer.Separator(chalk.cyan(`📊 Total: ${totalTickets} tickets across ${orderedStatuses.length} statuses`)));
    listItems.push(new inquirer.Separator(chalk.gray('Legend: 📌 = CLI tracked, 👤 = Jira assigned')));
    listItems.push(new inquirer.Separator(' '));
    listItems.push({
      name: chalk.blue('← Exit'),
      value: 'exit',
      short: 'Exit'
    });

    // Show scrollable list
    const listPageSize = this.config?.ui?.listPageSize || 25;

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'selection',
      message: 'Browse tickets (Use arrow keys to scroll, Enter to select):',
      choices: listItems,
      pageSize: listPageSize,
      loop: false
    }]);

    // Handle selection (currently just viewing, but could be extended)
    if (answer.selection !== 'exit') {
      console.log(chalk.blue(`\n🔗 View in Jira: ${this.config.jiraUrl}/browse/${answer.selection}`));

      // Ask if user wants to manage this ticket
      const action = await inquirer.prompt([{
        type: 'confirm',
        name: 'manage',
        message: 'Would you like to manage this ticket?',
        default: false
      }]);

      if (action.manage) {
        // Get ticket details and show management menu
        try {
          const ticketDetails = await this.jiraService.getTicketDetails(answer.selection, this.config);
          await this.showStatusTransitionMenu(ticketDetails);
        } catch (error) {
          console.error(chalk.red(`Error fetching ticket details: ${error.message}`));
        }
      }
    }
  }

  async editTicket(ticketKey) {
    try {
      console.log(chalk.blue('✏️  Jira Ticket Editor\n'));

      // Load configuration
      await this.loadConfig();

      // Normalize ticket key if it's numeric
      ticketKey = this.normalizeTicketKey(ticketKey);

      // Validate configuration
      this.validateConfiguration();

      // Validate token before proceeding
      await this.validateToken();

      let selectedTicket = null;

      if (ticketKey) {
        // Ticket key provided, fetch its details
        console.log(chalk.cyan(`📋 Fetching ticket details for ${ticketKey}...`));
        try {
          selectedTicket = await this.jiraService.getTicketDetails(ticketKey, this.config);
        } catch (error) {
          console.error(chalk.red(`Error: ${error.message}`));
          process.exit(1);
        }
      } else {
        // No ticket key provided, show selection menu (reuse list logic)
        selectedTicket = await this.selectTicketForEdit();
      }

      if (!selectedTicket) {
        console.log(chalk.yellow('No ticket selected. Exiting.'));
        return;
      }

      // Start the field editing loop
      await this.editTicketFields(selectedTicket);

    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  async selectTicketForEdit() {
    const spinner = ora('Fetching tickets...').start();

    try {
      // Get tracked tickets from local config
      const trackedTickets = this.config.trackedTickets || {};

      // Get ALL assigned tickets from Jira (including completed ones)
      const assignedTickets = await this.jiraService.getAllAssignedTickets(this.config);

      spinner.succeed('Tickets loaded');

      // Combine and deduplicate tickets (using the same sorting as list command)
      const allTickets = this.combineTickets(trackedTickets, assignedTickets);

      // Filter out old done tickets
      const filteredTickets = this.filterOldDoneTickets(allTickets);

      if (filteredTickets.length === 0) {
        console.log(chalk.yellow('No tickets available for editing.'));
        return null;
      }

      // Show ticket selection menu (simpler version than list)
      const choices = filteredTickets.map(ticket => {
        const truncatedSummary = ticket.summary.length > 80
          ? ticket.summary.substring(0, 77) + '...'
          : ticket.summary;

        const sourceIndicator = ticket.source === 'tracked' ? '📌' : '👤';
        const statusColor = ['Done', 'Closed', 'Resolved', 'Complete', 'Completed']
          .some(done => ticket.status.toLowerCase().includes(done.toLowerCase()))
          ? chalk.green : chalk.yellow;

        return {
          name: `${sourceIndicator} ${ticket.key} - ${truncatedSummary} [${statusColor(ticket.status)}]`,
          value: ticket,
          short: ticket.key
        };
      });

      const answer = await inquirer.prompt([{
        type: 'list',
        name: 'ticket',
        message: 'Select ticket to edit (Use arrow keys, Enter to select):',
        choices: choices,
        pageSize: this.config?.ui?.listPageSize || 25,
        loop: false
      }]);

      return answer.ticket;

    } catch (error) {
      spinner.fail('Failed to fetch tickets');
      throw error;
    }
  }

  async editTicketFields(ticket) {
    console.log(chalk.cyan(`\n✏️  Editing ticket: ${ticket.key}`));
    console.log(chalk.white(`Summary: ${ticket.summary}\n`));

    while (true) {
      const spinner = ora('Fetching editable fields...').start();

      try {
        // Get editable fields from Jira
        const editableFields = await this.jiraService.getEditableFields(ticket.key, this.config);

        // Get current ticket details
        const currentTicket = await this.jiraService.getTicketDetails(ticket.key, this.config);

        spinner.succeed('Fields loaded');

        // Organize fields for display
        const organizedFields = this.organizeEditableFields(editableFields, currentTicket);

        if (organizedFields.length === 0) {
          console.log(chalk.yellow('No editable fields available for this ticket.'));
          return;
        }

        // Show field selection menu
        const fieldChoice = await this.showFieldSelectionMenu(organizedFields);

        if (fieldChoice === 'exit') {
          console.log(chalk.blue('✅ Editing completed'));
          return;
        }

        // Edit the selected field
        const editResult = await this.editSelectedField(ticket.key, fieldChoice, currentTicket);

        if (editResult.updated) {
          console.log(chalk.green(`✅ ${fieldChoice.displayName} updated successfully`));
          console.log(chalk.blue(`🔗 View in Jira: ${this.config.jiraUrl}/browse/${ticket.key}`));
        }

        // Continue the loop to allow more edits

      } catch (error) {
        spinner.fail('Failed to fetch fields');
        console.error(chalk.red(`Error: ${error.message}`));
        return;
      }
    }
  }

  organizeEditableFields(editableFields, currentTicket) {
    // Fields to exclude from editing (non-updatable fields)
    const excludedFields = [
      'Software Capitalization Project',
      'software capitalization project',
      'Software_Capitalization_Project'
    ];

    // Filter out excluded fields by checking field name and display name
    const filteredEditableFields = {};
    for (const [key, fieldMeta] of Object.entries(editableFields)) {
      const fieldName = (fieldMeta.name || key).toLowerCase();
      const isExcluded = excludedFields.some(excluded =>
        fieldName.includes(excluded.toLowerCase()) ||
        key.toLowerCase().includes(excluded.toLowerCase())
      );

      if (!isExcluded) {
        filteredEditableFields[key] = fieldMeta;
      }
    }

    // Define CLI creation order with Jira field mappings
    const cliFieldOrder = [
      { key: 'issuetype', displayName: 'Work Type' },
      { key: 'summary', displayName: 'Summary' },
      { key: 'description', displayName: 'Description' },
      { key: 'components', displayName: 'Components' },
      { key: 'priority', displayName: 'Priority' },
      { key: this.config?.customFields?.ticketClassification, displayName: 'Ticket Classification' },
      { key: 'assignee', displayName: 'Assignee' }
    ].filter(field => field.key && filteredEditableFields[field.key]); // Only include if field exists and is editable

    // Get remaining fields alphabetically
    const remainingFields = Object.keys(filteredEditableFields)
      .filter(key => !cliFieldOrder.some(cliField => cliField.key === key))
      .sort()
      .map(key => ({
        key: key,
        displayName: filteredEditableFields[key].name || key
      }));

    // Combine with CLI fields first
    const allFields = [...cliFieldOrder, ...remainingFields];

    // Add current values and field metadata
    return allFields.map(field => {
      const fieldMeta = filteredEditableFields[field.key];
      const currentValue = this.getCurrentFieldValue(currentTicket, field.key);

      return {
        ...field,
        schema: fieldMeta.schema,
        allowedValues: fieldMeta.allowedValues,
        currentValue: currentValue,
        displayValue: this.formatFieldValueForDisplay(currentValue, fieldMeta)
      };
    });
  }

  getCurrentFieldValue(ticket, fieldKey) {
    // Handle special field mappings
    switch (fieldKey) {
      case 'issuetype':
        return ticket.workType;
      case 'summary':
        return ticket.summary;
      case 'status':
        return ticket.status;
      case 'assignee':
        return ticket.assignee;
      case 'description':
        return ticket.description ? this.extractTextFromADF(ticket.description) : '';
      case 'components':
        return ticket.components ? ticket.components.map(c => c.name || c) : [];
      case 'issuelinks':
        if (ticket.fullFields && ticket.fullFields[fieldKey]) {
          const links = ticket.fullFields[fieldKey];
          if (Array.isArray(links) && links.length > 0) {
            return links.map(link => {
              // Handle both inward and outward links
              if (link.outwardIssue) {
                return link.outwardIssue.key;
              } else if (link.inwardIssue) {
                return link.inwardIssue.key;
              }
              return null;
            }).filter(Boolean);
          }
        }
        return [];
      case 'parent':
        // Handle parent field (for parent-child relationships and epics)
        if (ticket.fullFields && ticket.fullFields[fieldKey]) {
          const parent = ticket.fullFields[fieldKey];
          if (parent && parent.key) {
            return parent.key;
          }
        }
        return 'Unknown';
      case 'priority':
        return ticket.priority;
      default:
        // Handle epic link and other custom fields that might link to issues
        if (ticket.fullFields && ticket.fullFields[fieldKey]) {
          const fieldValue = ticket.fullFields[fieldKey];

          // Handle issue object (for epic link, parent link, etc.)
          if (fieldValue && typeof fieldValue === 'object' && fieldValue.key) {
            return fieldValue.key;
          }

          // Handle different field value formats
          if (fieldValue && typeof fieldValue === 'object') {
            if (fieldValue.value) return fieldValue.value;
            if (fieldValue.name) return fieldValue.name;
            if (fieldValue.displayName) return fieldValue.displayName;
            if (Array.isArray(fieldValue)) return fieldValue;
          }

          return fieldValue;
        }
        return 'Unknown';
    }
  }

  extractTextFromADF(adfContent) {
    // Simple ADF to text conversion for description display
    if (!adfContent || !adfContent.content) {
      return '';
    }

    let text = '';
    for (const block of adfContent.content) {
      if (block.type === 'paragraph' && block.content) {
        for (const inline of block.content) {
          if (inline.type === 'text') {
            text += inline.text;
          }
        }
        text += '\n';
      }
    }

    return text.trim();
  }

  formatFieldValueForDisplay(value, fieldMeta) {
    if (!value || value === 'Unknown') {
      return chalk.gray('(not set)');
    }

    if (typeof value === 'string') {
      // Truncate long values
      return value.length > 50 ? value.substring(0, 47) + '...' : value;
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ') : chalk.gray('(none)');
    }

    return String(value);
  }

  async showFieldSelectionMenu(fields) {
    const choices = [
      ...fields.map(field => ({
        name: `${field.displayName}: ${field.displayValue}`,
        value: field,
        short: field.displayName
      })),
      new inquirer.Separator('─────────────────────'),
      {
        name: chalk.blue('← Exit editing'),
        value: 'exit',
        short: 'Exit'
      }
    ];

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'field',
      message: 'Select field to edit (Use arrow keys, Enter to select):',
      choices: choices,
      pageSize: this.config?.ui?.pageSize || 10,
      loop: false
    }]);

    return answer.field;
  }

  async editSelectedField(ticketKey, field, currentTicket) {
    console.log(chalk.cyan(`\n📝 Editing: ${field.displayName}`));
    console.log(chalk.white(`Current value: ${field.displayValue}\n`));

    // Handle different field types
    let newValue;
    const fieldType = field.schema?.type;

    try {
      // Check for special fields first (parent, epic link, etc.)
      if (field.key === 'parent' ||
          field.key.includes('epic') ||
          field.displayName?.toLowerCase().includes('parent') ||
          field.displayName?.toLowerCase().includes('epic')) {
        // Handle parent/epic link fields with issue selection
        newValue = await this.editIssueField(field, ticketKey);
      } else {
        // Handle by field type
        switch (fieldType) {
          case 'string':
            newValue = await this.editStringField(field);
            break;
          case 'array':
            newValue = await this.editArrayField(field, ticketKey);
            break;
          case 'option':
            newValue = await this.editOptionField(field);
            break;
          case 'user':
            newValue = await this.editUserField(field);
            break;
          default:
            newValue = await this.editStringField(field); // Default to string input
        }
      }

      if (newValue === null) {
        console.log(chalk.yellow('❌ Edit cancelled'));
        return { updated: false };
      }

      // Check if this is issue link data that needs special handling
      if (newValue && newValue._issueLinkData) {
        const spinner = ora(`Creating issue links...`).start();

        try {
          // Prepare link data for the dedicated endpoint
          const linkData = newValue.issues.map(issueKey => ({
            type: newValue.linkType,
            issueKey: issueKey
          }));

          await this.jiraService.createIssueLinks(ticketKey, linkData, this.config);

          spinner.succeed(`Issue links created (${linkData.length} link${linkData.length !== 1 ? 's' : ''})`);
          return { updated: true, newValue: linkData };
        } catch (error) {
          spinner.fail('Failed to create issue links');
          throw error;
        }
      }

      // Update the ticket (standard field update)
      const spinner = ora(`Updating ${field.displayName}...`).start();

      await this.jiraService.updateTicketField(ticketKey, field.key, newValue, this.config);

      spinner.succeed(`${field.displayName} updated`);

      return { updated: true, newValue };

    } catch (error) {
      console.error(chalk.red(`Failed to update ${field.displayName}: ${error.message}`));
      return { updated: false };
    }
  }

  async editStringField(field) {
    // For description field, use editor
    if (field.key === 'description') {
      return await this.editDescriptionField(field);
    }

    const answer = await inquirer.prompt([{
      type: 'input',
      name: 'value',
      message: `Enter new value for ${field.displayName} (or press Enter to cancel):`,
      default: field.currentValue === 'Unknown' ? '' : field.currentValue
    }]);

    if (answer.value === '') {
      const confirmCancel = await inquirer.prompt([{
        type: 'confirm',
        name: 'cancel',
        message: 'Cancel editing this field?',
        default: true
      }]);

      return confirmCancel.cancel ? null : answer.value;
    }

    return answer.value;
  }

  async editDescriptionField(field) {
    console.log(chalk.cyan('📝 Editing Description'));
    console.log(chalk.gray('Tip: You can use markdown formatting (bold, italic, links, etc.)'));

    const answer = await inquirer.prompt([{
      type: 'editor',
      name: 'description',
      message: 'Edit description (markdown supported):',
      default: field.currentValue === 'Unknown' ? '' : field.currentValue,
      postfix: '.md'
    }]);

    if (!answer.description || answer.description.trim() === '') {
      const confirmCancel = await inquirer.prompt([{
        type: 'confirm',
        name: 'cancel',
        message: 'Cancel editing description?',
        default: true
      }]);

      return confirmCancel.cancel ? null : '';
    }

    // Convert markdown to ADF using existing method
    try {
      const adfContent = this.jiraService.createDescriptionContent(answer.description, this.config);
      return {
        type: "doc",
        version: 1,
        content: adfContent
      };
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not parse markdown, using plain text'));
      return answer.description.trim();
    }
  }

  async editArrayField(field, ticketKey) {
    // For components and other array fields
    if (field.key === 'components') {
      // Reuse component selection logic
      try {
        const components = await this.jiraService.getProjectComponents(this.config);

        console.log(chalk.cyan('\n📋 Selecting Components'));
        console.log(chalk.gray('Current components: ' + (field.currentValue.length > 0 ? field.currentValue.join(', ') : 'None')));

        const selectedComponents = await this.selectComponents(components, { components: [] }, false);

        if (selectedComponents.length === 0) {
          const confirmEmpty = await inquirer.prompt([{
            type: 'confirm',
            name: 'empty',
            message: 'No components selected. Clear all components from this ticket?',
            default: false
          }]);

          if (!confirmEmpty.empty) {
            return null; // Cancel
          }
        }

        return selectedComponents.map(name => ({ name }));
      } catch (error) {
        console.error(chalk.red(`Error fetching components: ${error.message}`));
        return null;
      }
    }

    // For issue links
    if (field.key === 'issuelinks') {
      try {
        console.log(chalk.cyan('\n🔗 Linking Issues'));

        const spinner = ora('Fetching linkable issues...').start();
        const availableIssues = await this.jiraService.getLinkableIssues(this.config, ticketKey);
        spinner.succeed(`Found ${availableIssues.length} linkable issues`);

        // Parse current links
        let currentIssues = [];
        if (Array.isArray(field.currentValue)) {
          currentIssues = field.currentValue;
        }

        console.log(chalk.gray('Current linked issues: ' + (currentIssues.length > 0 ? currentIssues.join(', ') : 'None')));

        const selectedIssues = await this.selectIssues(availableIssues, currentIssues);

        if (selectedIssues.length === 0) {
          console.log(chalk.yellow('No new issues selected to link.'));
          return null; // Cancel - don't modify existing links
        }

        // Prompt for link type
        const linkTypeAnswer = await inquirer.prompt([{
          type: 'list',
          name: 'linkType',
          message: 'Select link type:',
          choices: [
            { name: 'Relates to', value: 'Relates' },
            { name: 'Blocks', value: 'Blocks' },
            { name: 'Is blocked by', value: 'Blocked' },
            { name: 'Duplicates', value: 'Duplicate' },
            { name: 'Is duplicated by', value: 'Duplicated' },
            { name: 'Clones', value: 'Cloners' },
            { name: 'Is cloned by', value: 'Cloners' },
            new inquirer.Separator(),
            'Cancel'
          ]
        }]);

        if (linkTypeAnswer.linkType === 'Cancel') {
          return null;
        }

        // Return special marker for issue links to use dedicated endpoint
        return {
          _issueLinkData: true,
          linkType: linkTypeAnswer.linkType,
          issues: selectedIssues.map(issue => issue.key)
        };
      } catch (error) {
        console.error(chalk.red(`Error fetching issues: ${error.message}`));
        return null;
      }
    }

    // Generic array editing (simplified)
    return await this.editStringField(field);
  }

  async editOptionField(field) {
    if (!field.allowedValues || field.allowedValues.length === 0) {
      console.log(chalk.yellow('No options available for this field.'));
      return null;
    }

    const choices = [
      ...field.allowedValues.map(option => ({
        name: option.value || option.name,
        value: option,
        short: option.value || option.name
      })),
      new inquirer.Separator('─────────────────────'),
      {
        name: chalk.blue('← Cancel'),
        value: 'cancel',
        short: 'Cancel'
      }
    ];

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'option',
      message: `Select new value for ${field.displayName}:`,
      choices: choices,
      pageSize: this.config?.ui?.pageSize || 10,
      loop: false
    }]);

    return answer.option === 'cancel' ? null : answer.option;
  }

  async editIssueField(field, ticketKey) {
    // For parent, epic link, and other issue relationship fields
    try {
      const fieldName = field.displayName || field.key;
      console.log(chalk.cyan(`\n🔗 Selecting ${fieldName}`));

      // Determine if we should filter by issue type (e.g., only Epics for epic link)
      let issueTypeFilter = null;
      const fieldNameLower = fieldName.toLowerCase();
      const fieldKeyLower = field.key.toLowerCase();

      if (fieldNameLower.includes('epic') || fieldKeyLower.includes('epic')) {
        issueTypeFilter = 'Epic';
      }

      const spinner = ora('Fetching linkable issues...').start();
      const availableIssues = await this.jiraService.getLinkableIssues(this.config, ticketKey, issueTypeFilter);
      spinner.succeed(`Found ${availableIssues.length} linkable issues${issueTypeFilter ? ` (${issueTypeFilter}s)` : ''}`);

      // Show current value
      const currentValue = field.currentValue;
      if (currentValue && currentValue !== 'Unknown') {
        console.log(chalk.gray(`Current ${fieldName}: ${currentValue}`));
      } else {
        console.log(chalk.gray(`Current ${fieldName}: (not set)`));
      }

      // Build choices list with issue key and summary (all strings for filtering)
      const choices = [
        '--- Clear (remove link) ---',
        '--- Cancel ---'
      ];

      availableIssues.forEach(issue => {
        const displayText = `${issue.key} - ${issue.summary.substring(0, 60)}${issue.summary.length > 60 ? '...' : ''}`;
        choices.push(displayText);
      });

      const result = await this.customAutocompletePrompt({
        message: `Select issue for ${fieldName} (type to filter, Enter to select):`,
        choices: choices,
        pageSize: this.config?.ui?.pageSize || 10,
        nonSelectableItems: [],
        ticketData: {},
        selectedComponents: []
      });

      if (result === '--- Cancel ---') {
        return null;
      }

      if (result === '--- Clear (remove link) ---') {
        // Return null to clear the field
        return null;
      }

      // Extract the issue key from the selected result
      const issueKey = result.split(' - ')[0];
      const selectedIssue = availableIssues.find(issue => issue.key === issueKey);

      if (selectedIssue) {
        console.log(chalk.green(`✓ Selected: ${issueKey}`));

        // Different field types expect different formats:
        // - parent field (standard): { key: "KEY" }
        // - epic link (custom field): just "KEY" as string
        // Check if this is a custom field (starts with customfield_)
        if (field.key.startsWith('customfield_')) {
          return issueKey; // Epic Link custom fields expect just the string key
        } else {
          return { key: issueKey }; // Parent field expects object
        }
      }

      return null;
    } catch (error) {
      console.error(chalk.red(`Error fetching issues: ${error.message}`));
      return null;
    }
  }

  async editUserField(field) {
    // For assignee field
    if (field.key === 'assignee') {
      console.log(chalk.cyan('\n👤 Selecting Assignee'));
      console.log(chalk.gray(`Current assignee: ${field.currentValue}`));

      try {
        const assignees = await this.jiraService.getProjectAssignees(this.config);
        const currentUser = await this.jiraService.getCurrentUser(this.config);

        const selectedAssignee = await this.selectAssignee(assignees, currentUser, { assignee: null }, false);

        if (!selectedAssignee) {
          return null; // User cancelled
        }

        return selectedAssignee;
      } catch (error) {
        console.error(chalk.red(`Error fetching assignees: ${error.message}`));

        // Fallback to manual email entry
        const answer = await inquirer.prompt([{
          type: 'input',
          name: 'email',
          message: `Enter email for ${field.displayName} (or press Enter to cancel):`
        }]);

        if (!answer.email) {
          return null;
        }

        return { emailAddress: answer.email };
      }
    }

    // Generic user field handling
    const answer = await inquirer.prompt([{
      type: 'input',
      name: 'email',
      message: `Enter email for ${field.displayName} (or press Enter to cancel):`
    }]);

    if (!answer.email) {
      return null;
    }

    return { emailAddress: answer.email };
  }

  normalizeTicketKey(ticketKey) {
    if (!ticketKey) {
      return ticketKey;
    }

    // Check if the ticket key is purely numeric
    if (/^\d+$/.test(ticketKey)) {
      // Prepend project key
      const projectKey = this.config?.projectKey;
      if (projectKey) {
        return `${projectKey}-${ticketKey}`;
      }
    }

    return ticketKey;
  }

  async showTicket(ticketKey) {
    try {
      console.log(chalk.blue('📋 Jira Ticket Details\n'));

      // Load configuration
      await this.loadConfig();

      // Normalize ticket key if it's numeric
      ticketKey = this.normalizeTicketKey(ticketKey);

      // Validate configuration
      this.validateConfiguration();

      // Validate token before proceeding
      await this.validateToken();

      const spinner = ora(`Fetching ticket details for ${ticketKey}...`).start();

      try {
        // Get comprehensive ticket details
        const ticketData = await this.jiraService.getComprehensiveTicketDetails(ticketKey, this.config);

        spinner.succeed('Ticket details loaded');

        // Display formatted ticket information
        this.displayTicketDetails(ticketData);

      } catch (error) {
        spinner.fail('Failed to fetch ticket details');
        throw error;
      }

    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  displayTicketDetails(ticketData) {
    const fields = ticketData.fields;
    const names = ticketData.names || {};

    // Header with key and summary
    console.log(chalk.cyan.bold(`🎫 ${ticketData.key}`));
    if (fields.summary) {
      console.log(chalk.white.bold(fields.summary));
    }
    console.log(chalk.blue(`🔗 ${this.config.jiraUrl}/browse/${ticketData.key}\n`));

    // Core fields in preferred order
    const coreFields = [
      { key: 'status', label: 'Status', icon: '📊' },
      { key: 'issuetype', label: 'Work Type', icon: '🏷️' },
      { key: 'priority', label: 'Priority', icon: '⚡' },
      { key: 'assignee', label: 'Assignee', icon: '👤' },
      { key: 'reporter', label: 'Reporter', icon: '📝' },
      { key: 'created', label: 'Created', icon: '📅' },
      { key: 'updated', label: 'Updated', icon: '🔄' },
      { key: 'components', label: 'Components', icon: '🧩' }
    ];

    // Display core fields
    for (const fieldDef of coreFields) {
      const value = this.formatFieldValueForShow(fields[fieldDef.key], fieldDef.key);
      if (value) {
        console.log(`${fieldDef.icon} ${chalk.cyan(fieldDef.label + ':')} ${value}`);
      }
    }

    // Display description if present
    if (fields.description) {
      console.log(`\n📄 ${chalk.cyan('Description:')}`);
      const descriptionText = this.extractTextFromADF(fields.description);
      if (descriptionText) {
        console.log(chalk.white(this.wrapText(descriptionText, 80)));
      }
    }

    // Display custom fields
    const customFields = this.getPopulatedCustomFields(fields, names, coreFields);
    if (customFields.length > 0) {
      console.log(`\n🔧 ${chalk.cyan('Custom Fields:')}`);
      for (const field of customFields) {
        console.log(`   ${chalk.gray(field.name + ':')} ${field.value}`);
      }
    }

    console.log(''); // Empty line at end
  }

  formatFieldValueForShow(value, fieldKey) {
    if (!value) {
      return null;
    }

    switch (fieldKey) {
      case 'status':
        return value.name ? chalk.yellow(value.name) : chalk.yellow(value);

      case 'issuetype':
        return value.name || value;

      case 'priority':
        const priorityName = value.name || value;
        const priorityColors = {
          'Blocker': chalk.red.bold,
          'Highest': chalk.red,
          'High': chalk.yellow,
          'Medium': chalk.blue,
          'Low': chalk.gray,
          'Lowest': chalk.gray
        };
        return priorityColors[priorityName] ? priorityColors[priorityName](priorityName) : priorityName;

      case 'assignee':
      case 'reporter':
        return value.displayName || value.name || value.emailAddress || value;

      case 'created':
      case 'updated':
        return this.formatDate(value);

      case 'components':
        if (Array.isArray(value) && value.length > 0) {
          return value.map(c => c.name || c).join(', ');
        }
        return null;

      default:
        // Check if this looks like a date field
        if (typeof value === 'string' && this.isDateField(fieldKey, value)) {
          return this.formatDate(value);
        }

        return this.formatComplexValue(value);
    }
  }

  isDateField(fieldKey, value) {
    // Check if field name suggests it's a date
    const dateFieldNames = ['date', 'created', 'updated', 'changed', 'time', 'last', 'viewed'];
    const fieldName = fieldKey.toLowerCase();

    if (dateFieldNames.some(dateWord => fieldName.includes(dateWord))) {
      // Check if value looks like a date
      return this.looksLikeDate(value);
    }

    return false;
  }

  looksLikeDate(value) {
    if (typeof value !== 'string') return false;

    // Check for common date patterns
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO format
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/, // SQL format
      /^\d{1,2}\/\d{1,2}\/\d{4}/,              // US format
      /^\d{4}\/\d{2}\/\d{2}/                   // Alternative format
    ];

    return datePatterns.some(pattern => pattern.test(value));
  }

  formatComplexValue(value) {
    // Handle arrays
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return null;
      }

      const formattedItems = value.map(item => {
        if (typeof item === 'object' && item !== null) {
          return item.value || item.name || item.displayName || item.key || null;
        }
        return item;
      }).filter(item => item !== null);

      return formattedItems.length > 0 ? formattedItems.join(', ') : null;
    }

    // Handle objects
    if (typeof value === 'object' && value !== null) {
      // Check for common object properties that have meaningful display values
      if (value.value !== undefined && value.value !== null) {
        return String(value.value);
      }

      if (value.name !== undefined && value.name !== null) {
        return String(value.name);
      }

      if (value.displayName !== undefined && value.displayName !== null) {
        return String(value.displayName);
      }

      if (value.key !== undefined && value.key !== null) {
        return String(value.key);
      }

      // Check for count/size properties
      if (value.size !== undefined) {
        return `${value.size} items`;
      }

      if (value.total !== undefined) {
        return String(value.total);
      }

      // For objects with only system properties or no meaningful data, return null
      const meaningfulKeys = Object.keys(value).filter(key =>
        !key.startsWith('_') &&
        !['self', 'id', 'iconUrl', 'avatarUrl'].includes(key)
      );

      if (meaningfulKeys.length === 0) {
        return null;
      }

      // If it's a simple object with just a few string properties, try to format it
      if (meaningfulKeys.length <= 2) {
        const simpleValues = meaningfulKeys.map(key => {
          const val = value[key];
          if (typeof val === 'string' || typeof val === 'number') {
            return val;
          }
          return null;
        }).filter(val => val !== null);

        if (simpleValues.length > 0) {
          return simpleValues.join(' ');
        }
      }

      // For complex objects we can't meaningfully display, return null
      return null;
    }

    // Handle primitive values
    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number') {
      // Clean up decimal numbers that are actually integers
      if (Number.isInteger(value) || value % 1 === 0) {
        return String(Math.round(value));
      }
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    return null;
  }

  getPopulatedCustomFields(fields, names, coreFields) {
    const customFields = [];
    const coreFieldKeys = coreFields.map(f => f.key);
    const systemFields = ['summary', 'description', 'project', 'labels', 'fixVersions', 'versions'];

    // Fields that commonly contain complex objects with no meaningful display value
    const skipFields = [
      'comment', 'comments',
      'worklog', 'worklogs',
      'development',
      'progress',
      'votes',
      'watchers',
      'timetracking',
      'timeoriginalestimate',
      'timeestimate',
      'timespent',
      'aggregatetimeoriginalestimate',
      'aggregatetimeestimate',
      'aggregatetimespent',
      'log work',
      'restrict to'
    ];

    for (const [fieldKey, fieldValue] of Object.entries(fields)) {
      // Skip core fields, system fields, and empty values
      if (coreFieldKeys.includes(fieldKey) || systemFields.includes(fieldKey) || !fieldValue) {
        continue;
      }

      // Skip commonly problematic fields
      const fieldName = (names[fieldKey] || fieldKey).toLowerCase();
      if (skipFields.some(skip => fieldName.includes(skip) || fieldKey.toLowerCase().includes(skip))) {
        continue;
      }

      // Skip fields that start with 'customfield_' if they're empty objects or arrays
      if (fieldKey.startsWith('customfield_') && typeof fieldValue === 'object') {
        if (!fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0)) {
          continue;
        }

        // Skip if it's an object with only system properties
        if (!Array.isArray(fieldValue)) {
          const meaningfulKeys = Object.keys(fieldValue).filter(key =>
            !key.startsWith('_') &&
            !['self', 'id', 'iconUrl', 'avatarUrl'].includes(key)
          );
          if (meaningfulKeys.length === 0) {
            continue;
          }
        }
      }

      const displayName = names[fieldKey] || fieldKey;
      const formattedValue = this.formatFieldValueForShow(fieldValue, fieldKey);

      // Only include if we got a meaningful formatted value
      if (formattedValue && formattedValue !== 'null' && formattedValue !== '{}') {
        // Skip fields with very long text containing Jira markup
        if (typeof formattedValue === 'string' && formattedValue.length > 200 &&
            (formattedValue.includes('{panel') || formattedValue.includes('{code') ||
             formattedValue.includes('{quote') || formattedValue.includes('{color'))) {
          continue;
        }

        customFields.push({
          name: displayName,
          value: formattedValue
        });
      }
    }

    // Sort custom fields alphabetically
    return customFields.sort((a, b) => a.name.localeCompare(b.name));
  }

  formatDate(dateString) {
    if (!dateString) return null;

    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor(diffMs / (1000 * 60));

      const formatted = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (diffMinutes < 60) {
        return `${formatted} ${chalk.gray(`(${diffMinutes}m ago)`)}`;
      } else if (diffHours < 24) {
        return `${formatted} ${chalk.gray(`(${diffHours}h ago)`)}`;
      } else if (diffDays < 30) {
        return `${formatted} ${chalk.gray(`(${diffDays}d ago)`)}`;
      } else {
        return formatted;
      }
    } catch (error) {
      return dateString;
    }
  }

  wrapText(text, width) {
    const lines = text.split('\n');
    const wrappedLines = [];

    for (const line of lines) {
      if (line.length <= width) {
        wrappedLines.push(line);
      } else {
        const words = line.split(' ');
        let currentLine = '';

        for (const word of words) {
          if (currentLine.length + word.length + 1 <= width) {
            currentLine = currentLine ? currentLine + ' ' + word : word;
          } else {
            if (currentLine) {
              wrappedLines.push(currentLine);
            }
            currentLine = word;
          }
        }

        if (currentLine) {
          wrappedLines.push(currentLine);
        }
      }
    }

    return wrappedLines.join('\n');
  }

  async selectTicketFromList() {
    const spinner = ora('Fetching tickets...').start();

    try {
      // Get tracked tickets from local config
      const trackedTickets = this.config.trackedTickets || {};

      // Get assigned tickets from Jira
      const assignedTickets = await this.jiraService.getAssignedTickets(this.config);

      spinner.succeed('Tickets loaded');

      // Combine and deduplicate tickets
      const allTickets = this.combineTickets(trackedTickets, assignedTickets);

      if (allTickets.length === 0) {
        console.log(chalk.yellow('\nNo tickets found. You can:'));
        console.log(chalk.white('• Create tickets using the CLI to start tracking them'));
        console.log(chalk.white('• Get tickets assigned to you in Jira to manage them'));
        return null;
      }

      // Show ticket selection menu
      return await this.showTicketSelectionMenu(allTickets);

    } catch (error) {
      spinner.fail('Failed to fetch tickets');
      throw error;
    }
  }

  combineTickets(trackedTickets, assignedTickets) {
    const ticketMap = new Map();

    // Add tracked tickets
    for (const [key, ticket] of Object.entries(trackedTickets)) {
      ticketMap.set(key, {
        key: key,
        summary: ticket.summary,
        status: ticket.status,
        workType: ticket.workType,
        assignee: ticket.assignee,
        updated: ticket.updatedAt,
        source: 'tracked'
      });
    }

    // Add assigned tickets (will overwrite if same key exists)
    for (const ticket of assignedTickets) {
      ticketMap.set(ticket.key, ticket);
    }

    // Convert to array and apply complex sorting
    const tickets = Array.from(ticketMap.values());
    const allowedStatuses = this.config?.ticketTracking?.allowedStatuses || [];

    return tickets.sort((a, b) => {
      const aIsAllowed = allowedStatuses.includes(a.status);
      const bIsAllowed = allowedStatuses.includes(b.status);

      // First, separate allowed vs non-allowed statuses
      if (aIsAllowed && !bIsAllowed) return -1;
      if (!aIsAllowed && bIsAllowed) return 1;

      if (aIsAllowed && bIsAllowed) {
        // Both have allowed statuses - sort by status order in config, then by ticket number
        const aStatusIndex = allowedStatuses.indexOf(a.status);
        const bStatusIndex = allowedStatuses.indexOf(b.status);

        if (aStatusIndex !== bStatusIndex) {
          return aStatusIndex - bStatusIndex;
        }

        // Same status, sort by ticket number
        return this.compareTicketNumbers(a.key, b.key);
      }

      if (!aIsAllowed && !bIsAllowed) {
        // Both have non-allowed statuses - sort alphabetically by status, then by ticket number
        if (a.status !== b.status) {
          return a.status.localeCompare(b.status);
        }

        // Same status, sort by ticket number
        return this.compareTicketNumbers(a.key, b.key);
      }

      return 0;
    });
  }

  compareTicketNumbers(keyA, keyB) {
    // Extract numeric part from ticket keys (e.g., "PROJ-123" -> 123)
    const numA = parseInt(keyA.split('-').pop()) || 0;
    const numB = parseInt(keyB.split('-').pop()) || 0;
    return numA - numB;
  }

  async showTicketSelectionMenu(tickets) {
    console.log(chalk.cyan('\n📋 Select a ticket to manage:\n'));

    const choices = tickets.map(ticket => {
      const truncatedSummary = ticket.summary.length > 60
        ? ticket.summary.substring(0, 57) + '...'
        : ticket.summary;

      const sourceIndicator = ticket.source === 'tracked' ? '📌' : '👤';
      const statusColor = ticket.status === 'Done' || ticket.status === 'Closed' ? chalk.green : chalk.yellow;

      return {
        name: `${sourceIndicator} ${ticket.key} - ${truncatedSummary} [${statusColor(ticket.status)}]`,
        value: ticket,
        short: ticket.key
      };
    });

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'ticket',
      message: 'Select ticket (Use arrow keys, Enter to select):',
      choices: choices,
      pageSize: this.config?.ui?.pageSize || 10,
      loop: false
    }]);

    return answer.ticket;
  }

  async showStatusTransitionMenu(ticket) {
    console.log(chalk.cyan(`\n🔄 Managing ticket: ${ticket.key}`));
    console.log(chalk.white(`Summary: ${ticket.summary}`));
    console.log(chalk.white(`Current Status: ${ticket.status}\n`));

    const spinner = ora('Fetching available transitions...').start();

    try {
      // Get available transitions for this ticket
      const allTransitions = await this.jiraService.getAvailableTransitions(ticket.key, this.config);

      // Filter transitions based on allowed statuses and exclude current status
      const allowedStatuses = this.config?.ticketTracking?.allowedStatuses || [];
      let transitions = allowedStatuses.length > 0
        ? allTransitions.filter(transition =>
            allowedStatuses.includes(transition.name) &&
            transition.name !== ticket.status
          )
        : allTransitions.filter(transition => transition.name !== ticket.status);

      // Sort transitions to match the order in allowedStatuses
      if (allowedStatuses.length > 0) {
        transitions.sort((a, b) => {
          const aIndex = allowedStatuses.indexOf(a.name);
          const bIndex = allowedStatuses.indexOf(b.name);
          return aIndex - bIndex;
        });
      }

      spinner.succeed('Transitions loaded');

      if (transitions.length === 0) {
        console.log(chalk.yellow('No allowed status transitions available for this ticket.'));
        console.log(chalk.white('Check your allowedStatuses configuration in .jirarc or you may lack permissions.'));
        return;
      }

      // Build choices for status menu
      const choices = [
        ...transitions.map(transition => ({
          name: `Change status to: ${transition.name}`,
          value: { action: 'transition', transition: transition },
          short: transition.name
        })),
        new inquirer.Separator('─────────────────────'),
        {
          name: '🗑️  Delete',
          value: { action: 'delete' },
          short: 'Delete'
        }
      ];

      const answer = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'Select action (Use arrow keys, Enter to select):',
        choices: choices,
        pageSize: this.config?.ui?.pageSize || 10,
        loop: false
      }]);

      const selectedAction = answer.action;

      if (selectedAction.action === 'delete') {
        await this.confirmAndDeleteTicket(ticket);
      } else if (selectedAction.action === 'transition') {
        await this.executeStatusTransition(ticket, selectedAction.transition);
      }

    } catch (error) {
      spinner.fail('Failed to fetch transitions');
      throw error;
    }
  }

  async confirmAndDeleteTicket(ticket) {
    console.log(chalk.yellow(`\n⚠️  This will remove ${ticket.key} from local tracking only.`));
    console.log(chalk.white('The ticket will remain in Jira unchanged.\n'));

    const confirmation = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: 'Are you sure you want to remove this ticket from tracking?',
      default: false
    }]);

    if (confirmation.confirmed) {
      this.removeTrackedTicket(ticket.key);
      await this.saveTrackedTickets();
      console.log(chalk.green(`✅ ${ticket.key} removed from local tracking`));
    } else {
      console.log(chalk.yellow('❌ Deletion cancelled'));
    }
  }

  async executeStatusTransition(ticket, transition) {
    const spinner = ora(`Transitioning ${ticket.key} - ${ticket.summary} to "${transition.name}"...`).start();

    try {
      await this.jiraService.transitionTicket(ticket.key, transition.name, this.config);
      spinner.succeed(`Status changed to "${transition.name}"`);

      // Update local tracking if this ticket is tracked
      if (this.config.trackedTickets?.[ticket.key]) {
        this.updateTrackedTicketStatus(ticket.key, transition.name);
        await this.saveTrackedTickets();
        console.log(chalk.blue('📌 Local tracking updated'));
      }

      console.log(chalk.green(`\n✅ ${ticket.key} - ${ticket.summary} successfully transitioned to "${transition.name}"`));
      console.log(chalk.blue(`🔗 View in Jira: ${this.config.jiraUrl}/browse/${ticket.key}`));

    } catch (error) {
      spinner.fail(`Failed to transition ticket: ${error.message}`);
      console.log(chalk.red('❌ Status transition failed'));
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
    const workType = await this.customListPrompt({
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
      defaultValue: this.config?.defaults?.workType || 'Task',
      pageSize: pageSize
    });

    console.log(chalk.green(`✓ Work type: ${workType}`));

    const remainingQuestions = [
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

    const inputAnswers = await inquirer.prompt(remainingQuestions);
    const basicAnswers = { workType, ...inputAnswers };

    // Handle components selection with autocomplete
    const selectedComponents = await this.selectComponents(components, basicAnswers, isDryRun);

    // Handle status selection (pass current state including components)
    const currentStateForStatus = { ...basicAnswers, components: selectedComponents };
    const selectedStatus = await this.selectStatus(statuses, currentStateForStatus, isDryRun);

    // Handle assignee selection (pass current state including components and status)
    const currentState = { ...basicAnswers, components: selectedComponents, status: selectedStatus };
    const selectedAssignee = await this.selectAssignee(assignees, currentUser, currentState, isDryRun);

        // Continue with remaining questions - handle individually for consistent formatting
    const priorityAnswer = await this.customListPrompt({
      message: '7) Select priority:',
      choices: [
        'Lowest',
        'Low',
        'Medium',
        'High',
        'Highest',
        'Blocker'
      ],
      defaultValue: this.config?.defaults?.priority || 'Medium',
      pageSize: pageSize,
      ticketData: { ...basicAnswers, components: selectedComponents, status: selectedStatus, assignee: selectedAssignee }
    });

    console.log(chalk.green(`✓ Priority: ${priorityAnswer}`));

    const classificationAnswer = await this.customListPrompt({
      message: '8) Select ticket classification:',
      choices: [
        'Bug',
        'Feature/Enhancement',
        'Operations',
        'R&D',
        'Risk',
        'Tech Debt'
      ],
      defaultValue: this.config?.defaults?.ticketClassification || 'Feature/Enhancement',
      pageSize: pageSize,
      ticketData: { ...basicAnswers, components: selectedComponents, status: selectedStatus, assignee: selectedAssignee, priority: priorityAnswer }
    });

    console.log(chalk.green(`✓ Classification: ${classificationAnswer}`));

    const remainingAnswers = {
      priority: priorityAnswer,
      ticketClassification: classificationAnswer
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
    if (ticketData.components && ticketData.components.length > 0) {
      console.log(chalk.green(`✓ Components:`));
      ticketData.components.forEach(comp => console.log(chalk.green(`    • ${comp}`)));
    } else {
      console.log(chalk.green(`✓ Components: none selected`));
    }
    console.log('\n');

    const selectedStatus = await this.customStatusPrompt(choices, ticketData);

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

  async selectIssues(availableIssues, currentIssues = []) {
    const selectedIssues = [];

    // Extract issue keys from current issues
    const currentIssueKeys = currentIssues.map(issue => issue.key || issue);

    while (true) {
      // Filter out already selected issues
      const selectableIssues = availableIssues.filter(issue =>
        !selectedIssues.some(selected => selected.key === issue.key) &&
        !currentIssueKeys.includes(issue.key)
      );

      if (selectableIssues.length === 0) {
        console.log(chalk.yellow('All issues have been selected.'));
        break;
      }

      // Build choices list with issue key and summary
      const choices = ['--- Finish selecting issues ---'];

      selectableIssues.forEach(issue => {
        const displayText = `${issue.key} - ${issue.summary.substring(0, 60)}${issue.summary.length > 60 ? '...' : ''}`;
        choices.push(displayText);
      });

      const result = await this.customAutocompletePrompt({
        message: selectedIssues.length === 0
          ? 'Select issues to link (type to filter, Enter to select):'
          : `   Select another issue (${selectedIssues.length} selected):`,
        choices: choices,
        pageSize: this.config?.ui?.pageSize || 10,
        nonSelectableItems: [],
        ticketData: {},
        selectedComponents: []
      });

      if (result === '--- Finish selecting issues ---') {
        break;
      }

      // Extract the issue key from the selected result
      const issueKey = result.split(' - ')[0];
      const selectedIssue = selectableIssues.find(issue => issue.key === issueKey);

      if (selectedIssue) {
        selectedIssues.push(selectedIssue);
        console.log(chalk.green(`✓ Selected: ${issueKey}`));
      }
    }

    if (selectedIssues.length === 0) {
      console.log(chalk.yellow('No issues selected.'));
    }

    return selectedIssues;
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

        console.log(chalk.gray(`\n(Type to filter, arrow keys to navigate, Escape to return to top, Enter to select)`));
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
        } else if (key === '\x1b') { // Escape key
          // Return to top of list
          selectedIndex = 0;
          // Find first selectable item
          while (selectedIndex < filteredChoices.length &&
                 (typeof filteredChoices[selectedIndex] === 'string' && nonSelectableItems.includes(filteredChoices[selectedIndex]) ||
                  filteredChoices[selectedIndex] && filteredChoices[selectedIndex].constructor && filteredChoices[selectedIndex].constructor.name === 'Separator')) {
            selectedIndex++;
          }
          render();
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

  async customStatusPrompt(choices, ticketData) {
    return new Promise((resolve) => {
      let selectedIndex = 0;
      let isActive = true;

      const nonSelectableItems = ['--- Recently Used ---', '--- Other Statuses ---'];

      const render = () => {
        if (!isActive) return;

        // Clear screen and move to top
        process.stdout.write('\x1B[2J\x1B[0f');

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

        console.log('\n5) Select initial status:');
        console.log('');

        const pageSize = this.config?.ui?.pageSize || 10;
        const startIndex = Math.max(0, selectedIndex - Math.floor(pageSize / 2));
        const endIndex = Math.min(choices.length, startIndex + pageSize);

        for (let i = startIndex; i < endIndex; i++) {
          const choice = choices[i];
          const isSelected = i === selectedIndex;
          const isNonSelectable = typeof choice === 'string' && nonSelectableItems.includes(choice);

          let displayText;

          // Handle different choice types
          if (choice && choice.constructor && choice.constructor.name === 'Separator') {
            displayText = choice.separator || choice.line || '--- Separator ---';
            console.log(chalk.gray(`   ${displayText}`));
            continue;
          } else if (typeof choice === 'object' && choice.name) {
            displayText = choice.name;
          } else if (typeof choice === 'string') {
            displayText = choice;
          } else {
            displayText = `UNKNOWN: ${JSON.stringify(choice)}`;
          }

          if (isNonSelectable) {
            console.log(chalk.gray(`   ${displayText}`));
          } else if (isSelected) {
            console.log(chalk.cyan(`❯ ${displayText}`));
          } else {
            console.log(`  ${displayText}`);
          }
        }

        console.log(chalk.gray(`\n(Use arrow keys, Escape to return to top, Enter to select)`));
      };

      const cleanup = () => {
        if (!isActive) return;
        isActive = false;
        process.stdin.setRawMode(false);
        // Clear screen after selection
        process.stdout.write('\x1B[2J\x1B[0f');
      };

      // Initial render
      render();

      // Enable raw mode for key capture
      process.stdin.setRawMode(true);
      process.stdin.resume();

      process.stdin.on('data', (key) => {
        if (!isActive) return;

        if (key.equals(Buffer.from([3]))) { // Ctrl+C
          cleanup();
          process.exit(0);
          return;
        }

        if (key.equals(Buffer.from([13]))) { // Enter
          const selectedChoice = choices[selectedIndex];
          // Don't allow selection of non-selectable items or separators
          if (!nonSelectableItems.includes(selectedChoice) &&
              (!selectedChoice || !selectedChoice.constructor || selectedChoice.constructor.name !== 'Separator')) {
            cleanup();
            resolve(selectedChoice === 'Leave as default (created status)' ? selectedChoice : selectedChoice.value || selectedChoice);
            return;
          }
        }

        if (key.equals(Buffer.from([27]))) { // Escape key
          // Return to top of list
          selectedIndex = 0;
          // Find first selectable item
          while (selectedIndex < choices.length &&
                 (nonSelectableItems.includes(choices[selectedIndex]) ||
                  (choices[selectedIndex] && choices[selectedIndex].constructor && choices[selectedIndex].constructor.name === 'Separator'))) {
            selectedIndex++;
          }
          render();
          return;
        }

        if (key.equals(Buffer.from([27, 91, 65]))) { // Up arrow
          selectedIndex = Math.max(0, selectedIndex - 1);
          // Skip non-selectable items and separators
          while (selectedIndex >= 0 &&
                 (nonSelectableItems.includes(choices[selectedIndex]) ||
                  (choices[selectedIndex] && choices[selectedIndex].constructor && choices[selectedIndex].constructor.name === 'Separator'))) {
            selectedIndex--;
          }
          if (selectedIndex < 0) selectedIndex = 0;
          render();
          return;
        }

        if (key.equals(Buffer.from([27, 91, 66]))) { // Down arrow
          selectedIndex = Math.min(choices.length - 1, selectedIndex + 1);
          // Skip non-selectable items and separators
          while (selectedIndex < choices.length &&
                 (nonSelectableItems.includes(choices[selectedIndex]) ||
                  (choices[selectedIndex] && choices[selectedIndex].constructor && choices[selectedIndex].constructor.name === 'Separator'))) {
            selectedIndex++;
          }
          if (selectedIndex >= choices.length) selectedIndex = choices.length - 1;
          render();
          return;
        }
      });
    });
  }

  async customListPrompt({ message, choices, defaultValue, pageSize = 10, ticketData = {} }) {
    return new Promise((resolve) => {
      let selectedIndex = 0;
      let isActive = true;

      // Find default index if provided
      if (defaultValue) {
        const defaultIndex = choices.findIndex(choice => choice === defaultValue);
        if (defaultIndex >= 0) {
          selectedIndex = defaultIndex;
        }
      }

      // Hide cursor
      process.stdout.write('\x1B[?25l');

      const render = () => {
        if (!isActive) return;

        // Clear screen and move to top
        process.stdout.write('\x1B[2J\x1B[0f');

        // Show CLI header
        console.log(chalk.blue('🎫 Jira Ticket Creator\n'));

        // Show context if available
        if (ticketData.workType) {
          console.log(chalk.green(`✓ Work type: ${ticketData.workType}`));
        }
        if (ticketData.summary) {
          console.log(chalk.green(`✓ Summary: ${ticketData.summary.substring(0, 50)}${ticketData.summary.length > 50 ? '...' : ''}`));
        }
        if (ticketData.description) {
          console.log(chalk.green(`✓ Description: ${ticketData.description.substring(0, 60)}${ticketData.description.length > 60 ? '...' : ''}`));
        }
        if (ticketData.components && ticketData.components.length > 0) {
          console.log(chalk.green(`✓ Components:`));
          ticketData.components.forEach(comp => console.log(chalk.green(`    • ${comp}`)));
        } else if (ticketData.components) {
          console.log(chalk.green(`✓ Components: none selected`));
        }
        if (ticketData.status) {
          console.log(chalk.green(`✓ Status: ${ticketData.status.name || ticketData.status}`));
        }
        if (ticketData.assignee) {
          console.log(chalk.green(`✓ Assignee: ${ticketData.assignee.displayName || ticketData.assignee}`));
        }
        if (ticketData.priority) {
          console.log(chalk.green(`✓ Priority: ${ticketData.priority}`));
        }

        console.log('\n' + message);
        console.log('');

        // Calculate visible window
        const totalChoices = choices.length;
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

        // Show choices
        for (let i = startIndex; i < endIndex; i++) {
          const isSelected = i === selectedIndex;
          const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
          const choice = isSelected ? chalk.cyan(choices[i]) : choices[i];
          console.log(prefix + choice);
        }

        // Show pagination info if needed
        if (totalChoices > pageSize) {
          console.log(chalk.gray(`\n(Use arrow keys to navigate, Escape to return to top, Enter to select)`));
        } else {
          console.log(chalk.gray(`\n(Use arrow keys, Escape to return to top, Enter to select)`));
        }
      };

      const cleanup = () => {
        if (!isActive) return;
        isActive = false;
        process.stdin.setRawMode(false);
        process.stdout.write('\x1B[?25h'); // Show cursor
        // Clear screen after selection
        process.stdout.write('\x1B[2J\x1B[0f');
      };

      // Initial render
      render();

      // Enable raw mode for key capture
      process.stdin.setRawMode(true);
      process.stdin.resume();

      process.stdin.on('data', (key) => {
        if (!isActive) return;

        if (key.equals(Buffer.from([3]))) { // Ctrl+C
          cleanup();
          process.exit(0);
          return;
        }

        if (key.equals(Buffer.from([13]))) { // Enter
          cleanup();
          resolve(choices[selectedIndex]);
          return;
        }

        if (key.equals(Buffer.from([27]))) { // Escape key
          selectedIndex = 0;
          render();
          return;
        }

        if (key.equals(Buffer.from([27, 91, 65]))) { // Up arrow
          selectedIndex = Math.max(0, selectedIndex - 1);
          render();
          return;
        }

        if (key.equals(Buffer.from([27, 91, 66]))) { // Down arrow
          selectedIndex = Math.min(choices.length - 1, selectedIndex + 1);
          render();
          return;
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

        console.log(chalk.gray(`\n(Type to filter, arrow keys to navigate, Escape to return to top, Enter to select)`));
      };

      const findNextSelectableIndex = (currentIndex, direction) => {
        const len = filteredChoices.length;
        let newIndex = currentIndex;

        for (let i = 0; i < len; i++) {
          if (direction > 0) {
            // Going down - stop at bottom instead of wrapping
            newIndex = newIndex + 1;
            if (newIndex >= len) {
              return currentIndex; // Stay at current if we hit the bottom
            }
          } else {
            // Going up - stop at top instead of wrapping
            newIndex = newIndex - 1;
            if (newIndex < 0) {
              return currentIndex; // Stay at current if we hit the top
            }
          }

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

        if (key.equals(Buffer.from([27]))) { // Escape key
          // Return to top of list
          selectedIndex = 0;
          // Find first selectable item
          while (selectedIndex < filteredChoices.length &&
                 nonSelectableItems.includes(filteredChoices[selectedIndex])) {
            selectedIndex++;
          }
          render();
          return;
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
      console.log(chalk.white('   (Transition to: "' + ticketData.status.name + '")'));
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
          await this.jiraService.transitionTicket(result.key, ticketData.status.name, this.config);
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

      // Track the newly created ticket
      this.addTrackedTicket(result.key, ticketData);
      await this.saveTrackedTickets();

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
