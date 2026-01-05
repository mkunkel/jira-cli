const JiraTicketCLI = require('../src/jira-cli');
const JiraService = require('../src/jira-service');
const inquirer = require('inquirer');
const fs = require('fs-extra');

jest.mock('../src/jira-service');
jest.mock('inquirer');
jest.mock('fs-extra');

describe('JiraTicketCLI - Interactive Workflows', () => {
  let cli;
  let mockJiraService;

  beforeEach(() => {
    cli = new JiraTicketCLI();
    mockJiraService = new JiraService();
    cli.jiraService = mockJiraService;
    cli.config = {
      projectKey: 'TEST',
      jiraUrl: 'https://test.atlassian.net',
      auth: { email: 'test@test.com', apiToken: 'token' },
      defaults: { workType: 'Task', priority: 'Medium' },
      ui: { pageSize: 10 },
      workTypes: ['Task', 'Bug', 'Story'],
      priorities: ['High', 'Medium', 'Low'],
      ticketTracking: { enabled: true, trackingDays: 90, doneStatusTrackingDays: 14 },
      componentTracking: { enabled: true, recentDays: 30 },
      trackedTickets: {},
      componentUsage: {},
      statusUsage: {},
      assigneeUsage: {}
    };

    fs.pathExists = jest.fn().mockResolvedValue(true);
    fs.readJSON = jest.fn().mockResolvedValue(cli.config);
    fs.writeJSON = jest.fn().mockResolvedValue();

    jest.clearAllMocks();
  });

  describe('organizeComponents', () => {
    beforeEach(() => {
      cli.config.componentTracking = { enabled: true, recentDays: 30 };
    });

    it('should organize components by usage frequency', () => {
      cli.config.componentUsage = {
        'Frontend': { count: 10, lastUsed: new Date().toISOString() },
        'Backend': { count: 5, lastUsed: new Date().toISOString() },
        'DevOps': { count: 2, lastUsed: new Date().toISOString() }
      };

      const allComponents = ['Frontend', 'Backend', 'DevOps', 'QA'];
      const result = cli.organizeComponents(allComponents);

      expect(result.recentComponents).toContain('Frontend');
      expect(result.recentComponents).toContain('Backend');
      expect(result.recentComponents).toContain('DevOps');
      expect(result.otherComponents).toContain('QA');
    });

    it('should handle components not in usage history', () => {
      cli.config.componentUsage = {
        'Frontend': { count: 5, lastUsed: new Date().toISOString() }
      };

      const allComponents = ['Frontend', 'NewComponent'];
      const result = cli.organizeComponents(allComponents);

      expect(result.recentComponents).toContain('Frontend');
      expect(result.otherComponents).toContain('NewComponent');
    });

    it('should handle empty component usage', () => {
      cli.config.componentUsage = {};
      const allComponents = ['Frontend', 'Backend'];

      const result = cli.organizeComponents(allComponents);
      expect(result.recentComponents).toEqual([]);
      expect(result.otherComponents).toContain('Frontend');
      expect(result.otherComponents).toContain('Backend');
    });

    it('should filter old component usage based on recentDays', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

      cli.config.componentTracking.recentDays = 30;
      cli.config.componentUsage = {
        'Frontend': { count: 10, lastUsed: oldDate.toISOString() },
        'Backend': { count: 5, lastUsed: new Date().toISOString() }
      };

      const allComponents = ['Frontend', 'Backend'];
      const result = cli.organizeComponents(allComponents);

      expect(result.recentComponents).toContain('Backend');
      expect(result.recentComponents).not.toContain('Frontend');
      expect(result.otherComponents).toContain('Frontend');
    });

    it('should exclude selected components', () => {
      cli.config.componentUsage = {
        'Frontend': { count: 5, lastUsed: new Date().toISOString() }
      };

      const allComponents = ['Frontend', 'Backend'];
      const result = cli.organizeComponents(allComponents, ['Frontend']);

      expect(result.recentComponents).not.toContain('Frontend');
      expect(result.otherComponents).toContain('Backend');
    });
  });

  describe('organizeStatuses', () => {
    beforeEach(() => {
      cli.config.statusTracking = { enabled: true, recentDays: 30 };
    });

    it('should organize statuses by usage frequency', () => {
      cli.config.statusUsage = {
        'In Progress': { count: 15, lastUsed: new Date().toISOString() },
        'To Do': { count: 10, lastUsed: new Date().toISOString() },
        'Done': { count: 5, lastUsed: new Date().toISOString() }
      };

      const allStatuses = ['To Do', 'In Progress', 'Done', 'Blocked'];
      const result = cli.organizeStatuses(allStatuses);

      expect(result.recentStatuses).toContain('In Progress');
      expect(result.recentStatuses).toContain('To Do');
      expect(result.recentStatuses).toContain('Done');
      expect(result.otherStatuses).toContain('Blocked');
    });

    it('should handle empty status usage', () => {
      cli.config.statusUsage = {};
      const allStatuses = ['To Do', 'Done'];

      const result = cli.organizeStatuses(allStatuses);
      expect(result.recentStatuses).toEqual([]);
      expect(result.otherStatuses).toContain('To Do');
      expect(result.otherStatuses).toContain('Done');
    });
  });

  describe('organizeAssignees', () => {
    beforeEach(() => {
      cli.config.assigneeTracking = { enabled: true, recentDays: 30 };
    });

    it('should organize assignees by usage frequency', () => {
      cli.config.assigneeUsage = {
        'user1@test.com': { count: 20, lastUsed: new Date().toISOString() },
        'user2@test.com': { count: 8, lastUsed: new Date().toISOString() }
      };

      const currentUser = { emailAddress: 'current@test.com', displayName: 'Current User' };
      const allAssignees = [
        { emailAddress: 'user1@test.com', displayName: 'User 1' },
        { emailAddress: 'user2@test.com', displayName: 'User 2' },
        { emailAddress: 'user3@test.com', displayName: 'User 3' }
      ];

      const result = cli.organizeAssignees(allAssignees, currentUser);

      expect(result.currentUser).toEqual(currentUser);
      expect(result.recentAssignees.some(a => a.emailAddress === 'user1@test.com')).toBe(true);
      expect(result.recentAssignees.some(a => a.emailAddress === 'user2@test.com')).toBe(true);
    });

    it('should handle assignees without email', () => {
      cli.config.assigneeUsage = {};

      const currentUser = { accountId: '123', displayName: 'Current User' };
      const allAssignees = [
        { accountId: '456', displayName: 'User 1' }
      ];

      const result = cli.organizeAssignees(allAssignees, currentUser);
      expect(result.otherAssignees).toHaveLength(1);
    });

    it('should handle empty assignee list', () => {
      const currentUser = { emailAddress: 'test@test.com', displayName: 'Test' };
      const result = cli.organizeAssignees([], currentUser);

      expect(result.recentAssignees).toEqual([]);
      expect(result.otherAssignees).toEqual([]);
    });
  });

  describe('updateStatusUsage', () => {
    beforeEach(() => {
      cli.config.statusUsage = {};
      cli.config.statusTracking = { enabled: true };
    });

    it('should create new status entry', () => {
      cli.updateStatusUsage('In Progress');

      expect(cli.config.statusUsage['In Progress']).toBeDefined();
      expect(cli.config.statusUsage['In Progress'].count).toBe(1);
    });

    it('should increment existing status count', () => {
      cli.config.statusUsage['In Progress'] = { count: 5, lastUsed: new Date().toISOString() };

      cli.updateStatusUsage('In Progress');
      expect(cli.config.statusUsage['In Progress'].count).toBe(6);
    });

    it('should not track when tracking is disabled', () => {
      cli.config.statusTracking.enabled = false;
      cli.updateStatusUsage('In Progress');

      expect(cli.config.statusUsage).toEqual({});
    });

    it('should update lastUsed timestamp', () => {
      const before = new Date();
      cli.updateStatusUsage('In Progress');
      const after = new Date();

      const timestamp = new Date(cli.config.statusUsage['In Progress'].lastUsed);
      expect(timestamp >= before && timestamp <= after).toBe(true);
    });
  });

  describe('updateAssigneeUsage', () => {
    beforeEach(() => {
      cli.config.assigneeUsage = {};
      cli.config.assigneeTracking = { enabled: true };
    });

    it('should create new assignee entry', () => {
      cli.updateAssigneeUsage('user@test.com');

      expect(cli.config.assigneeUsage['user@test.com']).toBeDefined();
      expect(cli.config.assigneeUsage['user@test.com'].count).toBe(1);
    });

    it('should increment existing assignee count', () => {
      cli.config.assigneeUsage['user@test.com'] = { count: 3, lastUsed: new Date().toISOString() };

      cli.updateAssigneeUsage('user@test.com');
      expect(cli.config.assigneeUsage['user@test.com'].count).toBe(4);
    });

    it('should not track when tracking is disabled', () => {
      cli.config.assigneeTracking = { enabled: false };
      cli.updateAssigneeUsage('user@test.com');

      expect(cli.config.assigneeUsage).toEqual({});
    });
  });

  describe('formatFieldValueForDisplay', () => {
    it('should format string values', () => {
      const result = cli.formatFieldValueForDisplay('Test value');
      expect(result).toBe('Test value');
    });

    it('should format array of strings', () => {
      const result = cli.formatFieldValueForDisplay(['Item1', 'Item2']);
      expect(result).toBe('Item1, Item2'); // joins with comma
    });

    it('should truncate long values at 50 chars', () => {
      const longString = 'a'.repeat(60);
      const result = cli.formatFieldValueForDisplay(longString);

      expect(result.length).toBeLessThan(longString.length);
      expect(result).toContain('...');
    });

    it('should return "not set" for null/undefined/empty', () => {
      expect(cli.formatFieldValueForDisplay(null)).toContain('not set');
      expect(cli.formatFieldValueForDisplay(undefined)).toContain('not set');
      expect(cli.formatFieldValueForDisplay('')).toContain('not set');
      expect(cli.formatFieldValueForDisplay('Unknown')).toContain('not set');
    });

    it('should convert non-string values to strings', () => {
      expect(cli.formatFieldValueForDisplay(123)).toBe('123');
      expect(cli.formatFieldValueForDisplay(true)).toBe('true');
    });

    it('should handle empty arrays', () => {
      const result = cli.formatFieldValueForDisplay([]);
      expect(result).toContain('none');
    });
  });

  describe('extractTextFromADF', () => {
    it('should extract text from simple ADF', () => {
      const adf = {
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world' }]
          }
        ]
      };

      const result = cli.extractTextFromADF(adf);
      expect(result.trim()).toBe('Hello world');
    });

    it('should extract text from multiple paragraphs', () => {
      const adf = {
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'First' }]
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Second' }]
          }
        ]
      };

      const result = cli.extractTextFromADF(adf);
      // Each paragraph adds a newline
      expect(result).toContain('First');
      expect(result).toContain('Second');
    });

    it('should handle empty ADF', () => {
      expect(cli.extractTextFromADF({})).toBe('');
      expect(cli.extractTextFromADF({ content: [] })).toBe('');
    });

    it('should skip non-paragraph content', () => {
      const adf = {
        content: [
          { type: 'heading', content: [{ type: 'text', text: 'Heading' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Paragraph' }] }
        ]
      };

      const result = cli.extractTextFromADF(adf);
      expect(result).toContain('Paragraph');
      expect(result).not.toContain('Heading');
    });
  });

  describe('getCurrentFieldValue', () => {
    it('should extract issuelinks correctly', () => {
      const ticket = {
        fullFields: {
          issuelinks: [
            { inwardIssue: { key: 'TEST-1' } },
            { outwardIssue: { key: 'TEST-2' } }
          ]
        }
      };

      const result = cli.getCurrentFieldValue(ticket, 'issuelinks');
      expect(result).toEqual(['TEST-1', 'TEST-2']);
    });

    it('should extract parent field correctly', () => {
      const ticket = {
        fullFields: {
          parent: { key: 'TEST-100' }
        }
      };

      const result = cli.getCurrentFieldValue(ticket, 'parent');
      expect(result).toBe('TEST-100');
    });

    it('should extract custom field with key property', () => {
      const ticket = {
        fullFields: {
          customfield_10001: { key: 'EPIC-1' }
        }
      };

      const result = cli.getCurrentFieldValue(ticket, 'customfield_10001');
      expect(result).toBe('EPIC-1');
    });

    it('should return components array', () => {
      const ticket = {
        components: ['Frontend', 'Backend']
      };

      const result = cli.getCurrentFieldValue(ticket, 'components');
      expect(result).toEqual(['Frontend', 'Backend']);
    });

    it('should handle nested value objects', () => {
      const ticket = {
        fullFields: {
          customfield_10002: { value: 'Custom Value' }
        }
      };

      const result = cli.getCurrentFieldValue(ticket, 'customfield_10002');
      expect(result).toBe('Custom Value');
    });
  });

  describe('cleanupOldTrackedTickets', () => {
    it('should remove old done tickets', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 20); // 20 days ago

      cli.config.trackedTickets = {
        'TEST-1': {
          status: 'Done',
          updatedAt: oldDate.toISOString()
        },
        'TEST-2': {
          status: 'In Progress',
          updatedAt: new Date().toISOString()
        }
      };

      cli.config.ticketTracking.doneStatusTrackingDays = 14;
      cli.cleanupOldTrackedTickets();

      expect(cli.config.trackedTickets['TEST-1']).toBeUndefined();
      expect(cli.config.trackedTickets['TEST-2']).toBeDefined();
    });

    it('should remove very old tickets regardless of status', () => {
      const veryOldDate = new Date();
      veryOldDate.setDate(veryOldDate.getDate() - 100); // 100 days ago

      cli.config.trackedTickets = {
        'TEST-1': {
          status: 'In Progress',
          updatedAt: veryOldDate.toISOString()
        }
      };

      cli.config.ticketTracking.trackingDays = 90;
      cli.cleanupOldTrackedTickets();

      expect(cli.config.trackedTickets['TEST-1']).toBeUndefined();
    });

    it('should not cleanup when tracking is disabled', () => {
      cli.config.ticketTracking.enabled = false;
      cli.config.trackedTickets = {
        'TEST-1': { status: 'Done', updatedAt: new Date(0).toISOString() }
      };

      cli.cleanupOldTrackedTickets();
      expect(cli.config.trackedTickets['TEST-1']).toBeDefined();
    });

    it('should handle tickets without updatedAt', () => {
      cli.config.trackedTickets = {
        'TEST-1': { status: 'Done' } // No updatedAt
      };

      expect(() => cli.cleanupOldTrackedTickets()).not.toThrow();
    });
  });

  describe('combineAllTickets', () => {
    it('should merge tracked and Jira tickets', () => {
      const tracked = {
        'TEST-1': { summary: 'Tracked', status: 'Old', updatedAt: new Date().toISOString() }
      };

      const jira = [
        { key: 'TEST-1', summary: 'Jira', status: 'New', updated: new Date().toISOString() },
        { key: 'TEST-2', summary: 'Only Jira', status: 'Open', updated: new Date().toISOString() }
      ];

      const result = cli.combineAllTickets(tracked, jira);

      expect(result).toHaveLength(2);
      expect(result.find(t => t.key === 'TEST-1').summary).toBe('Jira'); // Jira overrides
      expect(result.find(t => t.key === 'TEST-2')).toBeDefined();
    });

    it('should deduplicate tickets by key', () => {
      const tracked = {
        'TEST-1': { summary: 'Tracked', status: 'To Do', updatedAt: new Date().toISOString() }
      };

      const jira = [
        { key: 'TEST-1', summary: 'Jira', status: 'In Progress', updated: new Date().toISOString() }
      ];

      const result = cli.combineAllTickets(tracked, jira);
      expect(result).toHaveLength(1);
    });

    it('should handle empty inputs', () => {
      expect(cli.combineAllTickets({}, [])).toEqual([]);
    });
  });

  describe('filterOldDoneTickets', () => {
    it('should keep recent done tickets', () => {
      const tickets = [
        {
          key: 'TEST-1',
          status: 'Done',
          updated: new Date().toISOString() // uses 'updated', not 'updatedAt'
        }
      ];

      cli.config.ticketTracking.doneStatusTrackingDays = 14;
      const result = cli.filterOldDoneTickets(tickets);

      expect(result).toHaveLength(1);
    });

    it('should filter out old done tickets', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 20);

      const tickets = [
        {
          key: 'TEST-1',
          status: 'Done',
          updated: oldDate.toISOString()
        },
        {
          key: 'TEST-2',
          status: 'In Progress',
          updated: oldDate.toISOString()
        }
      ];

      cli.config.ticketTracking.doneStatusTrackingDays = 14;
      const result = cli.filterOldDoneTickets(tickets);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('TEST-2');
    });

    it('should detect various done status names', () => {
      const doneStatuses = ['Done', 'Closed', 'Resolved', 'Complete', 'Completed'];
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 20);

      doneStatuses.forEach(status => {
        const tickets = [{ key: 'TEST-1', status, updated: oldDate.toISOString() }];
        cli.config.ticketTracking.doneStatusTrackingDays = 14;
        const result = cli.filterOldDoneTickets(tickets);

        expect(result).toHaveLength(0);
      });
    });
  });
});

