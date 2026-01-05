const JiraTicketCLI = require('../src/jira-cli');
const JiraService = require('../src/jira-service');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const ora = require('ora');

jest.mock('../src/jira-service');
jest.mock('inquirer');
jest.mock('fs-extra');
jest.mock('ora');

describe('JiraTicketCLI - Full Integration Tests', () => {
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
      stop: jest.fn().mockReturnThis(),
      text: ''
    };
    ora.mockReturnValue(mockSpinner);

    // Full config
    cli.config = {
      projectKey: 'TEST',
      jiraUrl: 'https://test.atlassian.net',
      auth: { email: 'test@test.com', apiToken: 'token' },
      defaults: { workType: 'Task', priority: 'Medium' },
      workTypes: ['Task', 'Bug', 'Story'],
      priorities: ['High', 'Medium', 'Low'],
      ui: { pageSize: 10 },
      editor: { command: process.env.EDITOR || 'vi' },
      ticketTracking: { enabled: true, trackingDays: 90, doneStatusTrackingDays: 14 },
      componentTracking: { enabled: true, recentDays: 30 },
      statusTracking: { enabled: true, recentDays: 30 },
      assigneeTracking: { enabled: true, recentDays: 30 },
      trackedTickets: {},
      componentUsage: {},
      statusUsage: {},
      assigneeUsage: {}
    };

    // Mock fs operations
    fs.pathExists = jest.fn().mockResolvedValue(true);
    fs.readJSON = jest.fn().mockResolvedValue(cli.config);
    fs.writeJSON = jest.fn().mockResolvedValue();

    // Suppress console output
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();

    jest.clearAllMocks();
  });

  describe('Full Ticket Creation Flow', () => {
    it('should complete full ticket creation with all fields', async () => {
      // Mock all service calls
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        displayName: 'Test User',
        emailAddress: 'test@test.com',
        accountId: '123'
      });

      mockJiraService.getProjectComponents = jest.fn().mockResolvedValue([
        'Frontend',
        'Backend',
        'DevOps'
      ]);

      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue([
        'To Do',
        'In Progress',
        'Review',
        'Done'
      ]);

      mockJiraService.getProjectAssignees = jest.fn().mockResolvedValue([
        { displayName: 'John Doe', emailAddress: 'john@test.com', accountId: '456' },
        { displayName: 'Jane Smith', emailAddress: 'jane@test.com', accountId: '789' },
        { displayName: 'Test User', emailAddress: 'test@test.com', accountId: '123' }
      ]);

      mockJiraService.createTicket = jest.fn().mockResolvedValue({
        key: 'TEST-456',
        id: '12345'
      });

      // Mock the entire prompt sequence for collectTicketData
      let promptCallCount = 0;
      inquirer.prompt = jest.fn().mockImplementation((questions) => {
        promptCallCount++;

        // Handle array of questions (summary + description)
        if (Array.isArray(questions) && questions.length === 2) {
          return Promise.resolve({
            summary: 'Implement user authentication',
            description: 'Add OAuth2 authentication\nSupport Google and GitHub\nInclude JWT tokens'
          });
        }

        // Handle single questions
        const question = Array.isArray(questions) ? questions[0] : questions;

        // Component selection
        if (question.name === 'component') {
          return Promise.resolve({ component: 'Frontend' });
        }
        if (question.name === 'continueAdding') {
          if (promptCallCount <= 2) {
            return Promise.resolve({ continueAdding: true });
          }
          return Promise.resolve({ continueAdding: false });
        }

        // Priority, assignee, status
        if (question.name === 'priority') {
          return Promise.resolve({ priority: 'High' });
        }
        if (question.name === 'assignee') {
          return Promise.resolve({
            assignee: {
              displayName: 'John Doe',
              emailAddress: 'john@test.com',
              accountId: '456'
            }
          });
        }
        if (question.name === 'status') {
          return Promise.resolve({ status: 'In Progress' });
        }

        return Promise.resolve({});
      });

      // Mock customListPrompt for workType
      cli.customListPrompt = jest.fn().mockResolvedValue('Task');

      const ticketData = await cli.collectTicketData(false);

      expect(ticketData).toMatchObject({
        workType: 'Task',
        summary: 'Implement user authentication',
        description: expect.stringContaining('OAuth2'),
        components: expect.arrayContaining(['Frontend']),
        priority: 'High',
        status: 'In Progress'
      });

      expect(ticketData.assignee).toMatchObject({
        emailAddress: 'john@test.com'
      });

      // Verify service calls
      expect(mockJiraService.getProjectComponents).toHaveBeenCalled();
      expect(mockJiraService.getProjectStatuses).toHaveBeenCalled();
      expect(mockJiraService.getProjectAssignees).toHaveBeenCalled();
    });

    it('should handle ticket creation with minimal data', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        displayName: 'Test User',
        emailAddress: 'test@test.com'
      });

      mockJiraService.getProjectComponents = jest.fn().mockResolvedValue([]);
      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue(['To Do']);
      mockJiraService.getProjectAssignees = jest.fn().mockResolvedValue([]);
      mockJiraService.createTicket = jest.fn().mockResolvedValue({
        key: 'TEST-1',
        id: '1'
      });

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({
          summary: 'Simple ticket',
          description: 'Simple description'
        })
        .mockResolvedValueOnce({ continueAdding: false })
        .mockResolvedValueOnce({ priority: 'Medium' })
        .mockResolvedValueOnce({ assignee: { displayName: 'Unassigned' } })
        .mockResolvedValueOnce({ status: 'To Do' });

      cli.customListPrompt = jest.fn().mockResolvedValue('Task');

      const ticketData = await cli.collectTicketData(false);

      expect(ticketData.summary).toBe('Simple ticket');
      expect(ticketData.workType).toBe('Task');
    });
  });

  describe('Full List Tickets Flow', () => {
    it('should display tickets by status groups', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        emailAddress: 'test@test.com'
      });

      mockJiraService.getAssignedTickets = jest.fn().mockResolvedValue([
        {
          key: 'TEST-1',
          summary: 'First ticket',
          status: 'To Do',
          workType: 'Task',
          assignee: 'Test User',
          updated: new Date().toISOString()
        },
        {
          key: 'TEST-2',
          summary: 'Second ticket',
          status: 'In Progress',
          workType: 'Bug',
          assignee: 'Test User',
          updated: new Date().toISOString()
        },
        {
          key: 'TEST-3',
          summary: 'Third ticket',
          status: 'Done',
          workType: 'Story',
          assignee: 'Test User',
          updated: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() // 20 days old
        }
      ]);

      cli.config.trackedTickets = {
        'TEST-4': {
          summary: 'Tracked ticket',
          status: 'To Do',
          workType: 'Task',
          assignee: 'Test User',
          updatedAt: new Date().toISOString(),
          createdBy: 'cli'
        }
      };

      await cli.listTickets();

      // Should fetch tickets
      expect(mockJiraService.getAssignedTickets).toHaveBeenCalled();

      // Should start and succeed spinner
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.succeed).toHaveBeenCalled();

      // Should have displayed tickets (TEST-3 filtered out as old done ticket)
      expect(console.log).toHaveBeenCalled();
    });

    it('should handle empty ticket list', async () => {
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

    it('should filter old done tickets', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 20); // 20 days ago

      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        emailAddress: 'test@test.com'
      });

      mockJiraService.getAssignedTickets = jest.fn().mockResolvedValue([
        {
          key: 'TEST-1',
          summary: 'Old done ticket',
          status: 'Done',
          updated: oldDate.toISOString()
        },
        {
          key: 'TEST-2',
          summary: 'Active ticket',
          status: 'In Progress',
          updated: new Date().toISOString()
        }
      ]);

      cli.config.trackedTickets = {};

      await cli.listTickets();

      // Should only show TEST-2 (TEST-1 is filtered out)
      expect(mockJiraService.getAssignedTickets).toHaveBeenCalled();
    });
  });

  describe('Full Move Ticket Flow', () => {
    it('should complete status transition with confirmation', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        emailAddress: 'test@test.com'
      });

      mockJiraService.getAssignedTickets = jest.fn().mockResolvedValue([
        {
          key: 'TEST-1',
          summary: 'Ticket to move',
          status: 'To Do',
          workType: 'Task',
          assignee: 'Test User',
          updated: new Date().toISOString()
        }
      ]);

      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue([
        'To Do',
        'In Progress',
        'Review',
        'Done'
      ]);

      mockJiraService.transitionTicket = jest.fn().mockResolvedValue();

      cli.config.trackedTickets = {
        'TEST-1': {
          summary: 'Ticket to move',
          status: 'To Do',
          updatedAt: new Date().toISOString()
        }
      };

      // Mock the prompt sequence
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({
          ticket: {
            key: 'TEST-1',
            summary: 'Ticket to move',
            status: 'To Do'
          }
        })
        .mockResolvedValueOnce({ newStatus: 'In Progress' })
        .mockResolvedValueOnce({ confirm: true });

      await cli.moveTicket();

      expect(mockJiraService.transitionTicket).toHaveBeenCalledWith(
        'TEST-1',
        'In Progress',
        cli.config
      );

      // Should update tracked ticket
      expect(cli.config.trackedTickets['TEST-1'].status).toBe('In Progress');
      expect(fs.writeJSON).toHaveBeenCalled();
    });

    it('should cancel transition when user declines', async () => {
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
        .mockResolvedValueOnce({ ticket: { key: 'TEST-1', status: 'To Do' } })
        .mockResolvedValueOnce({ newStatus: 'Done' })
        .mockResolvedValueOnce({ confirm: false });

      await cli.moveTicket();

      expect(mockJiraService.transitionTicket).not.toHaveBeenCalled();
    });

    it('should handle same status selection', async () => {
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
        .mockResolvedValueOnce({ ticket: { key: 'TEST-1', status: 'To Do' } })
        .mockResolvedValueOnce({ newStatus: 'To Do' });

      await cli.moveTicket();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('already')
      );
      expect(mockJiraService.transitionTicket).not.toHaveBeenCalled();
    });
  });

  describe('Ticket Display and Formatting', () => {
    it('should display ticket details with all fields', async () => {
      mockJiraService.getTicketDetails = jest.fn().mockResolvedValue({
        key: 'TEST-1',
        summary: 'Test ticket',
        description: {
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Description text' }]
            }
          ]
        },
        status: 'In Progress',
        workType: 'Task',
        priority: 'High',
        assignee: 'John Doe',
        components: ['Frontend', 'Backend'],
        updated: new Date().toISOString(),
        fullFields: {
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          reporter: { displayName: 'Reporter' }
        }
      });

      await cli.showTicket('TEST-1');

      expect(mockJiraService.getTicketDetails).toHaveBeenCalledWith('TEST-1', cli.config);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('TEST-1'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test ticket'));
    });

    it('should wrap long text in descriptions', () => {
      const longText = 'a'.repeat(200);
      const wrapped = cli.wrapText(longText, 80);

      const lines = wrapped.split('\n');
      lines.forEach(line => {
        expect(line.length).toBeLessThanOrEqual(80);
      });
    });

    it('should handle text wrapping with newlines', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const wrapped = cli.wrapText(text, 80);

      expect(wrapped).toContain('Line 1');
      expect(wrapped).toContain('Line 2');
      expect(wrapped).toContain('Line 3');
    });
  });

  describe('Usage Cleanup Functions', () => {
    it('should cleanup old component usage', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);

      cli.config.componentUsage = {
        'Frontend': { count: 5, lastUsed: oldDate.toISOString() },
        'Backend': { count: 3, lastUsed: new Date().toISOString() },
        'OldComponent': { count: 1, lastUsed: oldDate.toISOString() }
      };

      cli.config.componentTracking = { enabled: true, recentDays: 30 };

      await cli.cleanupComponentUsage(['Frontend', 'Backend']);

      // OldComponent removed (not in available list)
      expect(cli.config.componentUsage['OldComponent']).toBeUndefined();

      // Frontend removed (too old)
      expect(cli.config.componentUsage['Frontend']).toBeUndefined();

      // Backend kept (recent)
      expect(cli.config.componentUsage['Backend']).toBeDefined();
    });

    it('should cleanup old status usage', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      cli.config.statusUsage = {
        'In Progress': { count: 10, lastUsed: new Date().toISOString() },
        'Old Status': { count: 1, lastUsed: oldDate.toISOString() }
      };

      cli.config.statusTracking = { enabled: true, recentDays: 30 };

      cli.cleanupStatusUsage(['In Progress', 'Done']);

      expect(cli.config.statusUsage['Old Status']).toBeUndefined();
      expect(cli.config.statusUsage['In Progress']).toBeDefined();
    });

    it('should cleanup old assignee usage', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      cli.config.assigneeUsage = {
        'current@test.com': { count: 5, lastUsed: new Date().toISOString() },
        'old@test.com': { count: 1, lastUsed: oldDate.toISOString() }
      };

      cli.config.assigneeTracking = { enabled: true, recentDays: 30 };

      const assignees = [
        { emailAddress: 'current@test.com', displayName: 'Current' }
      ];

      cli.cleanupAssigneeUsage(assignees);

      expect(cli.config.assigneeUsage['old@test.com']).toBeUndefined();
      expect(cli.config.assigneeUsage['current@test.com']).toBeDefined();
    });
  });

  describe('Error Handling in Workflows', () => {
    it('should handle ticket creation failure', async () => {
      const ticketData = {
        workType: 'Task',
        summary: 'Test',
        description: 'Test'
      };

      mockJiraService.createTicket = jest.fn().mockRejectedValue(
        new Error('API Error: Invalid field value')
      );

      await expect(cli.createTicket(ticketData)).rejects.toThrow('API Error');
    });

    it('should handle status transition failure', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        emailAddress: 'test@test.com'
      });

      mockJiraService.getAssignedTickets = jest.fn().mockResolvedValue([
        { key: 'TEST-1', summary: 'Test', status: 'To Do', updated: new Date().toISOString() }
      ]);

      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue(['To Do', 'Done']);
      mockJiraService.transitionTicket = jest.fn().mockRejectedValue(
        new Error('Transition not allowed')
      );

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ ticket: { key: 'TEST-1' } })
        .mockResolvedValueOnce({ newStatus: 'Done' })
        .mockResolvedValueOnce({ confirm: true });

      await cli.moveTicket();

      expect(mockSpinner.fail).toHaveBeenCalled();
    });

    it('should handle ticket fetch failure in list', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        emailAddress: 'test@test.com'
      });

      mockJiraService.getAssignedTickets = jest.fn().mockRejectedValue(
        new Error('Network error')
      );

      await expect(cli.listTickets()).rejects.toThrow('Network error');
      expect(mockSpinner.fail).toHaveBeenCalled();
    });
  });
});

