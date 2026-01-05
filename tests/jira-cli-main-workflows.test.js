const JiraTicketCLI = require('../src/jira-cli');
const JiraService = require('../src/jira-service');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const ora = require('ora');

jest.mock('../src/jira-service');
jest.mock('inquirer');
jest.mock('fs-extra');
jest.mock('ora');

describe('JiraTicketCLI - Main Workflows', () => {
  let cli;
  let mockJiraService;
  let mockSpinner;

  beforeEach(() => {
    cli = new JiraTicketCLI();
    mockJiraService = new JiraService();
    cli.jiraService = mockJiraService;

    // Mock spinner
    mockSpinner = {
      start: jest.fn().mockReturnThis(),
      succeed: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis(),
      stop: jest.fn().mockReturnThis()
    };
    ora.mockReturnValue(mockSpinner);

    // Default config
    cli.config = {
      projectKey: 'TEST',
      jiraUrl: 'https://test.atlassian.net',
      auth: { email: 'test@test.com', apiToken: 'token' },
      defaults: { workType: 'Task', priority: 'Medium' },
      workTypes: ['Task', 'Bug', 'Story'],
      priorities: ['High', 'Medium', 'Low'],
      ui: { pageSize: 10 },
      ticketTracking: { enabled: true, trackingDays: 90, doneStatusTrackingDays: 14 },
      componentTracking: { enabled: true, recentDays: 30 },
      trackedTickets: {},
      componentUsage: {},
      statusUsage: {},
      assigneeUsage: {}
    };

    // Mock fs operations
    fs.pathExists = jest.fn().mockResolvedValue(true);
    fs.readJSON = jest.fn().mockResolvedValue(cli.config);
    fs.writeJSON = jest.fn().mockResolvedValue();

    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();

    jest.clearAllMocks();
  });

  describe('run() - Main Entry Point', () => {
    beforeEach(() => {
      // Mock loadConfig to avoid file system access
      cli.loadConfig = jest.fn().mockResolvedValue();
    });

    it('should create ticket in normal mode', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        displayName: 'Test User',
        emailAddress: 'test@test.com'
      });

      mockJiraService.getProjectComponents = jest.fn().mockResolvedValue(['Frontend']);
      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue(['To Do']);
      mockJiraService.getProjectAssignees = jest.fn().mockResolvedValue([
        { displayName: 'User 1', emailAddress: 'user1@test.com' }
      ]);

      mockJiraService.createTicket = jest.fn().mockResolvedValue({
        key: 'TEST-123',
        id: '1'
      });

      // Mock user input
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ workType: 'Task' })
        .mockResolvedValueOnce({ summary: 'Test ticket' })
        .mockResolvedValueOnce({ description: 'Test description' })
        .mockResolvedValueOnce({ component: 'Frontend' })
        .mockResolvedValueOnce({ continueAdding: false })
        .mockResolvedValueOnce({ priority: 'Medium' })
        .mockResolvedValueOnce({ assignee: { emailAddress: 'user1@test.com' } })
        .mockResolvedValueOnce({ status: 'To Do' });

      await cli.run(false);

      expect(mockJiraService.createTicket).toHaveBeenCalled();
    });

    it('should handle dry run mode', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        displayName: 'Test User'
      });

      mockJiraService.getProjectComponents = jest.fn().mockResolvedValue([]);
      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue(['To Do']);
      mockJiraService.getProjectAssignees = jest.fn().mockResolvedValue([]);

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ workType: 'Task' })
        .mockResolvedValueOnce({ summary: 'Test' })
        .mockResolvedValueOnce({ description: 'Test' })
        .mockResolvedValueOnce({ continueAdding: false })
        .mockResolvedValueOnce({ priority: 'Medium' })
        .mockResolvedValueOnce({ assignee: { displayName: 'Unassigned' } })
        .mockResolvedValueOnce({ status: 'To Do' })
        .mockResolvedValueOnce({ submit: false }); // Don't submit after preview

      await cli.run(true);

      expect(mockJiraService.createTicket).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Preview completed')
      );
    });

    it('should create ticket after dry run if user confirms', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        displayName: 'Test User'
      });

      mockJiraService.getProjectComponents = jest.fn().mockResolvedValue([]);
      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue(['To Do']);
      mockJiraService.getProjectAssignees = jest.fn().mockResolvedValue([]);
      mockJiraService.createTicket = jest.fn().mockResolvedValue({
        key: 'TEST-123',
        id: '1'
      });

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ workType: 'Task' })
        .mockResolvedValueOnce({ summary: 'Test' })
        .mockResolvedValueOnce({ description: 'Test' })
        .mockResolvedValueOnce({ continueAdding: false })
        .mockResolvedValueOnce({ priority: 'Medium' })
        .mockResolvedValueOnce({ assignee: { displayName: 'Unassigned' } })
        .mockResolvedValueOnce({ status: 'To Do' })
        .mockResolvedValueOnce({ submit: true }); // Submit after preview

      await cli.run(true);

      expect(mockJiraService.createTicket).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockRejectedValue(
        new Error('API Error')
      );

      const mockExit = jest.spyOn(process, 'exit').mockImplementation();

      await cli.run(false);

      expect(console.error).toHaveBeenCalledWith(
        expect.anything(),
        'API Error'
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });

  describe('listTickets()', () => {
    beforeEach(() => {
      cli.loadConfig = jest.fn().mockResolvedValue();
    });

    it('should list and display tickets', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        emailAddress: 'test@test.com'
      });

      mockJiraService.getAssignedTickets = jest.fn().mockResolvedValue([
        {
          key: 'TEST-1',
          summary: 'Test ticket',
          status: 'To Do',
          workType: 'Task',
          assignee: 'Test User',
          updated: new Date().toISOString()
        }
      ]);

      cli.config.trackedTickets = {};

      await cli.listTickets();

      expect(mockJiraService.getAssignedTickets).toHaveBeenCalled();
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.succeed).toHaveBeenCalled();
    });

    it('should handle no tickets found', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        emailAddress: 'test@test.com'
      });

      mockJiraService.getAssignedTickets = jest.fn().mockResolvedValue([]);
      cli.config.trackedTickets = {};

      await cli.listTickets();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No tickets found')
      );
    });

    it('should combine tracked and Jira tickets', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        emailAddress: 'test@test.com'
      });

      mockJiraService.getAssignedTickets = jest.fn().mockResolvedValue([
        {
          key: 'TEST-1',
          summary: 'Jira ticket',
          status: 'In Progress',
          updated: new Date().toISOString()
        }
      ]);

      cli.config.trackedTickets = {
        'TEST-2': {
          summary: 'Tracked ticket',
          status: 'To Do',
          updatedAt: new Date().toISOString()
        }
      };

      await cli.listTickets();

      expect(mockJiraService.getAssignedTickets).toHaveBeenCalled();
    });
  });

  describe('createTicket()', () => {
    it('should create ticket and update tracking', async () => {
      const ticketData = {
        workType: 'Task',
        summary: 'Test ticket',
        description: 'Description',
        components: ['Frontend'],
        priority: 'High',
        assignee: { emailAddress: 'user@test.com' },
        status: 'To Do'
      };

      mockJiraService.createTicket = jest.fn().mockResolvedValue({
        key: 'TEST-123',
        id: '1'
      });

      await cli.createTicket(ticketData);

      expect(mockJiraService.createTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          workType: 'Task',
          summary: 'Test ticket'
        }),
        cli.config
      );

      expect(cli.config.trackedTickets['TEST-123']).toBeDefined();
      expect(fs.writeJSON).toHaveBeenCalled();
    });

    it('should update usage statistics', async () => {
      const ticketData = {
        workType: 'Task',
        summary: 'Test',
        components: ['Frontend'],
        priority: 'High',
        assignee: { emailAddress: 'user@test.com' },
        status: 'In Progress'
      };

      mockJiraService.createTicket = jest.fn().mockResolvedValue({
        key: 'TEST-123',
        id: '1'
      });

      await cli.createTicket(ticketData);

      expect(cli.config.componentUsage['Frontend']).toBeDefined();
      expect(cli.config.statusUsage['In Progress']).toBeDefined();
      expect(cli.config.assigneeUsage['user@test.com']).toBeDefined();
    });

    it('should handle creation errors', async () => {
      const ticketData = {
        workType: 'Task',
        summary: 'Test'
      };

      mockJiraService.createTicket = jest.fn().mockRejectedValue(
        new Error('Creation failed')
      );

      await expect(cli.createTicket(ticketData)).rejects.toThrow('Creation failed');
    });
  });

  describe('showDryRun()', () => {
    it('should display ticket preview', async () => {
      const ticketData = {
        workType: 'Task',
        summary: 'Test ticket',
        description: 'Test description',
        components: ['Frontend', 'Backend'],
        priority: 'High',
        assignee: { displayName: 'John Doe' },
        status: 'To Do'
      };

      await cli.showDryRun(ticketData);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Dry Run Preview')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Test ticket')
      );
    });

    it('should handle minimal ticket data', async () => {
      const ticketData = {
        workType: 'Task',
        summary: 'Minimal'
      };

      await cli.showDryRun(ticketData);

      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('moveTicket()', () => {
    beforeEach(() => {
      cli.loadConfig = jest.fn().mockResolvedValue();
      cli.config.trackedTickets = {
        'TEST-1': {
          summary: 'Test ticket',
          status: 'To Do',
          updatedAt: new Date().toISOString()
        }
      };
    });

    it('should transition ticket status', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        emailAddress: 'test@test.com'
      });

      mockJiraService.getAssignedTickets = jest.fn().mockResolvedValue([
        {
          key: 'TEST-1',
          summary: 'Test ticket',
          status: 'To Do',
          updated: new Date().toISOString()
        }
      ]);

      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue([
        'To Do',
        'In Progress',
        'Done'
      ]);

      mockJiraService.transitionTicket = jest.fn().mockResolvedValue();

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ ticket: { key: 'TEST-1' } })
        .mockResolvedValueOnce({ newStatus: 'In Progress' })
        .mockResolvedValueOnce({ confirm: true });

      await cli.moveTicket();

      expect(mockJiraService.transitionTicket).toHaveBeenCalledWith(
        'TEST-1',
        'In Progress',
        cli.config
      );
    });

    it('should handle cancellation', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        emailAddress: 'test@test.com'
      });

      mockJiraService.getAssignedTickets = jest.fn().mockResolvedValue([
        {
          key: 'TEST-1',
          summary: 'Test',
          status: 'To Do',
          updated: new Date().toISOString()
        }
      ]);

      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue(['To Do', 'Done']);

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ ticket: { key: 'TEST-1' } })
        .mockResolvedValueOnce({ newStatus: 'Done' })
        .mockResolvedValueOnce({ confirm: false });

      await cli.moveTicket();

      expect(mockJiraService.transitionTicket).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('cancelled')
      );
    });
  });
});

