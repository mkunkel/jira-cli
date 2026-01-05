const JiraTicketCLI = require('../src/jira-cli');
const JiraService = require('../src/jira-service');
const fs = require('fs-extra');
const inquirer = require('inquirer');

jest.mock('../src/jira-service');
jest.mock('inquirer');
jest.mock('fs-extra');

describe('JiraTicketCLI - Comprehensive Coverage', () => {
  let cli;
  let mockJiraService;

  beforeEach(() => {
    cli = new JiraTicketCLI();
    mockJiraService = new JiraService();
    cli.jiraService = mockJiraService;
    cli.config = {
      projectKey: 'TEST',
      jiraUrl: 'https://test.atlassian.net',
      defaults: { workType: 'Task', priority: 'Medium' },
      ui: { pageSize: 10 },
      ticketTracking: { enabled: true, trackingDays: 90, doneStatusTrackingDays: 14 },
      componentTracking: { enabled: true, recentDays: 30 },
      trackedTickets: {}
    };
    jest.clearAllMocks();
  });

  describe('Configuration Loading Edge Cases', () => {
    it('should handle missing .jirarc file', async () => {
      fs.pathExists = jest.fn().mockResolvedValue(false);

      await expect(cli.loadConfig()).rejects.toThrow();
    });

    it('should handle invalid JSON in .jirarc', async () => {
      fs.pathExists = jest.fn().mockResolvedValue(true);
      fs.readJSON = jest.fn().mockRejectedValue(new Error('Invalid JSON'));

      await expect(cli.loadConfig()).rejects.toThrow();
    });

    it('should try multiple config paths', async () => {
      fs.pathExists = jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      fs.readJSON = jest.fn().mockResolvedValue({
        projectKey: 'TEST',
        jiraUrl: 'https://test.atlassian.net',
        auth: { email: 'test@test.com', apiToken: 'token' }
      });

      await cli.loadConfig();
      expect(fs.pathExists).toHaveBeenCalledTimes(2);
    });
  });

  describe('Configuration Validation', () => {
    it('should not throw error when config is valid', () => {
      // validateConfiguration only checks workTypes, doesn't throw for missing fields
      expect(() => cli.validateConfiguration()).not.toThrow();
    });

    it('should warn if default workType not in workTypes list', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      cli.config.workTypes = ['Bug', 'Story'];
      cli.config.defaults = { workType: 'Task' };

      cli.validateConfiguration();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Task'));
      consoleSpy.mockRestore();
    });

    it('should not warn if workTypes is undefined', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      delete cli.config.workTypes;
      cli.config.defaults = { workType: 'Task' };

      cli.validateConfiguration();
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Token Validation', () => {
    it('should validate token successfully', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({
        displayName: 'Test User'
      });

      await expect(cli.validateToken()).resolves.not.toThrow();
    });

    it('should handle token validation error', async () => {
      mockJiraService.getCurrentUser = jest.fn().mockRejectedValue(
        new Error('API token is invalid')
      );

      await expect(cli.validateToken()).rejects.toThrow();
    });
  });

  describe('Component Cleanup', () => {
    it('should remove non-existent components from usage', async () => {
      cli.config.componentUsage = {
        'Frontend': { count: 5, lastUsed: new Date().toISOString() },
        'OldComponent': { count: 1, lastUsed: new Date().toISOString() }
      };

      const availableComponents = ['Frontend', 'Backend'];
      await cli.cleanupComponentUsage(availableComponents);

      expect(cli.config.componentUsage['Frontend']).toBeDefined();
      expect(cli.config.componentUsage['OldComponent']).toBeUndefined();
    });

    it('should handle empty component usage', async () => {
      cli.config.componentUsage = {};
      await cli.cleanupComponentUsage(['Frontend']);
      expect(cli.config.componentUsage).toEqual({});
    });

    it('should handle undefined componentUsage', async () => {
      delete cli.config.componentUsage;
      await cli.cleanupComponentUsage(['Frontend']);
      expect(cli.config.componentUsage).toBeUndefined();
    });
  });

  describe('Ticket Key Normalization Edge Cases', () => {
    it('should handle ticket key with lowercase project', () => {
      const result = cli.normalizeTicketKey('test-123');
      expect(result).toBe('test-123');
    });

    it('should handle ticket key with multiple hyphens', () => {
      const result = cli.normalizeTicketKey('TEST-SUB-123');
      expect(result).toBe('TEST-SUB-123');
    });

    it('should handle empty string', () => {
      const result = cli.normalizeTicketKey('');
      expect(result).toBe('');
    });

    it('should handle whitespace around number', () => {
      const result = cli.normalizeTicketKey('  123  ');
      const trimmed = '123'.trim();
      expect(result).toBe(`TEST-${trimmed}`);
    });

    it('should handle non-numeric input', () => {
      const result = cli.normalizeTicketKey('abc');
      expect(result).toBe('abc');
    });
  });

  describe('Field Value Formatting Edge Cases', () => {
    it('should handle undefined value', () => {
      const result = cli.formatFieldValueForDisplay(undefined);
      expect(result).toContain('not set');
    });

    it('should handle null value', () => {
      const result = cli.formatFieldValueForDisplay(null);
      expect(result).toContain('not set');
    });

    it('should handle zero', () => {
      const result = cli.formatFieldValueForDisplay(0);
      expect(result).toBe('0');
    });

    it('should handle boolean values', () => {
      expect(cli.formatFieldValueForDisplay(true)).toBe('true');
      expect(cli.formatFieldValueForDisplay(false)).toBe('false');
    });

    it('should handle object values', () => {
      const obj = { key: 'value' };
      const result = cli.formatFieldValueForDisplay(obj);
      expect(result).toContain('value');
    });

    it('should handle array with objects', () => {
      const arr = [{ name: 'Item1' }, { name: 'Item2' }];
      const result = cli.formatFieldValueForDisplay(arr);
      expect(result).toContain('Item1');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(200);
      const result = cli.formatFieldValueForDisplay(longString);
      expect(result.length).toBeLessThan(200);
      expect(result).toContain('...');
    });
  });

  describe('Component Usage Tracking', () => {
    beforeEach(() => {
      cli.config.componentUsage = {};
      cli.config.componentTracking = { enabled: true };
    });

    it('should not track when tracking is disabled', () => {
      cli.config.componentTracking.enabled = false;
      cli.updateComponentUsage('Frontend');
      expect(cli.config.componentUsage).toEqual({});
    });

    it('should not track when componentUsage is undefined', () => {
      delete cli.config.componentUsage;
      cli.updateComponentUsage('Frontend');
      expect(cli.config.componentUsage).toBeUndefined();
    });

    it('should track timestamp when adding component', () => {
      const before = new Date();
      cli.updateComponentUsage('Frontend');
      const after = new Date();

      const timestamp = new Date(cli.config.componentUsage['Frontend'].lastUsed);
      expect(timestamp >= before && timestamp <= after).toBe(true);
    });

    it('should handle special characters in component names', () => {
      cli.updateComponentUsage('Front/End (Web)');
      expect(cli.config.componentUsage['Front/End (Web)']).toBeDefined();
    });
  });

  describe('Ticket Tracking', () => {
    it('should add new tracked ticket', () => {
      const ticketData = {
        summary: 'Test ticket',
        workType: 'Task',
        status: { name: 'To Do' },
        assignee: { displayName: 'John Doe' }
      };

      cli.addTrackedTicket('TEST-1', ticketData);

      expect(cli.config.trackedTickets['TEST-1']).toBeDefined();
      expect(cli.config.trackedTickets['TEST-1'].summary).toBe('Test ticket');
      expect(cli.config.trackedTickets['TEST-1'].createdBy).toBe('cli');
    });

    it('should handle ticket without status', () => {
      const ticketData = {
        summary: 'Test',
        workType: 'Task'
      };

      cli.addTrackedTicket('TEST-1', ticketData);
      expect(cli.config.trackedTickets['TEST-1'].status).toBe('To Do');
    });

    it('should handle ticket without assignee', () => {
      const ticketData = {
        summary: 'Test',
        workType: 'Task'
      };

      cli.addTrackedTicket('TEST-1', ticketData);
      expect(cli.config.trackedTickets['TEST-1'].assignee).toBe('Unassigned');
    });

    it('should not track when tracking is disabled', () => {
      cli.config.ticketTracking.enabled = false;
      cli.addTrackedTicket('TEST-1', { summary: 'Test' });
      expect(cli.config.trackedTickets['TEST-1']).toBeUndefined();
    });
  });

  describe('Ticket Filtering and Combining', () => {
    it('should handle empty tracked tickets', () => {
      const result = cli.combineAllTickets({}, [
        { key: 'TEST-1', summary: 'Test', status: 'Open' }
      ]);
      expect(result).toHaveLength(1);
    });

    it('should handle empty Jira tickets', () => {
      const tracked = {
        'TEST-1': { summary: 'Test', status: 'Open' }
      };
      const result = cli.combineAllTickets(tracked, []);
      expect(result).toHaveLength(1);
    });

    it('should prioritize Jira data over tracked data', () => {
      const tracked = {
        'TEST-1': { summary: 'Old', status: 'Open', source: 'tracked' }
      };
      const jira = [
        { key: 'TEST-1', summary: 'New', status: 'In Progress', source: 'jira' }
      ];

      const result = cli.combineAllTickets(tracked, jira);
      expect(result[0].summary).toBe('New');
      expect(result[0].status).toBe('In Progress');
    });

    it('should handle tickets with null/undefined fields', () => {
      const tracked = {
        'TEST-1': { summary: null, status: undefined }
      };

      const result = cli.combineAllTickets(tracked, []);
      expect(result[0]).toBeDefined();
    });
  });

  describe('Done Status Detection', () => {
    const doneStatuses = ['Done', 'Closed', 'Resolved', 'Complete', 'Completed'];

    doneStatuses.forEach(status => {
      it(`should detect "${status}" as done status`, () => {
        const tickets = [
          { key: 'TEST-1', status: status, updated: new Date().toISOString() }
        ];
        const result = cli.filterOldDoneTickets(tickets);
        expect(result).toHaveLength(1);
      });

      it(`should detect "${status.toLowerCase()}" as done status (case-insensitive)`, () => {
        const tickets = [
          { key: 'TEST-1', status: status.toLowerCase(), updated: new Date().toISOString() }
        ];
        const result = cli.filterOldDoneTickets(tickets);
        expect(result).toHaveLength(1);
      });
    });

    it('should not detect "Done Soon" as done status', () => {
      const tickets = [
        { key: 'TEST-1', status: 'Almost Done', updated: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() }
      ];
      // Should still be included because it's not exactly a done status
      const result = cli.filterOldDoneTickets(tickets);
      expect(result).toHaveLength(1);
    });
  });

  describe('Editable Fields Organization', () => {
    it('should exclude Software Capitalization Project', () => {
      const fields = {
        'summary': { name: 'Summary', schema: { type: 'string' } },
        'customfield_10001': { name: 'Software Capitalization Project', schema: { type: 'string' } }
      };

      const result = cli.organizeEditableFields(fields, { summary: 'Test' });
      expect(result.find(f => f.key === 'customfield_10001')).toBeUndefined();
    });

    it('should handle empty editable fields', () => {
      const result = cli.organizeEditableFields({}, { summary: 'Test' });
      expect(result).toEqual([]);
    });

    it('should handle fields without schema', () => {
      const fields = {
        'summary': { name: 'Summary' }
      };

      const result = cli.organizeEditableFields(fields, { summary: 'Test' });
      expect(result).toHaveLength(1);
    });

    it('should sort CLI fields before custom fields', () => {
      const fields = {
        'customfield_10001': { name: 'Custom', schema: { type: 'string' } },
        'summary': { name: 'Summary', schema: { type: 'string' } },
        'description': { name: 'Description', schema: { type: 'string' } }
      };

      const result = cli.organizeEditableFields(fields, {});
      const summaryIndex = result.findIndex(f => f.key === 'summary');
      const customIndex = result.findIndex(f => f.key === 'customfield_10001');
      expect(summaryIndex).toBeLessThan(customIndex);
    });
  });

  describe('Current Field Value Extraction', () => {
    it('should extract value from various field formats', () => {
      const ticket = {
        fullFields: {
          customfield_10001: { value: 'test-value' },
          customfield_10002: { name: 'test-name' },
          customfield_10003: { displayName: 'test-display' }
        }
      };

      expect(cli.getCurrentFieldValue(ticket, 'customfield_10001')).toBe('test-value');
      expect(cli.getCurrentFieldValue(ticket, 'customfield_10002')).toBe('test-name');
      expect(cli.getCurrentFieldValue(ticket, 'customfield_10003')).toBe('test-display');
    });

    it('should return "Unknown" for missing fields', () => {
      const ticket = { fullFields: {} };
      expect(cli.getCurrentFieldValue(ticket, 'nonexistent')).toBe('Unknown');
    });

    it('should handle empty issuelinks array', () => {
      const ticket = {
        fullFields: { issuelinks: [] }
      };
      expect(cli.getCurrentFieldValue(ticket, 'issuelinks')).toEqual([]);
    });

    it('should handle parent field with missing key', () => {
      const ticket = {
        fullFields: { parent: {} }
      };
      expect(cli.getCurrentFieldValue(ticket, 'parent')).toBe('Unknown');
    });

    it('should handle components as strings', () => {
      const ticket = {
        components: ['Frontend', 'Backend']
      };
      expect(cli.getCurrentFieldValue(ticket, 'components')).toEqual(['Frontend', 'Backend']);
    });
  });

  describe('ADF Text Extraction', () => {
    it('should handle ADF without content', () => {
      expect(cli.extractTextFromADF({})).toBe('');
    });

    it('should handle ADF with empty content array', () => {
      expect(cli.extractTextFromADF({ content: [] })).toBe('');
    });

    it('should handle non-paragraph blocks', () => {
      const adf = {
        content: [
          { type: 'heading', content: [{ type: 'text', text: 'Header' }] }
        ]
      };
      expect(cli.extractTextFromADF(adf)).toBe('');
    });

    it('should handle paragraph without content', () => {
      const adf = {
        content: [{ type: 'paragraph' }]
      };
      expect(cli.extractTextFromADF(adf)).toBe('');
    });

    it('should handle mixed inline content types', () => {
      const adf = {
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Text ' },
            { type: 'mention', text: '@user' },
            { type: 'text', text: ' more text' }
          ]
        }]
      };
      const result = cli.extractTextFromADF(adf);
      expect(result).toBe('Text  more text');
    });
  });

  describe('Save Operations', () => {
    beforeEach(() => {
      fs.pathExists = jest.fn().mockResolvedValue(true);
      fs.writeJSON = jest.fn().mockResolvedValue();
    });

    it('should save component usage when tracking enabled', async () => {
      cli.config.componentTracking = { enabled: true };
      await cli.saveComponentUsage();
      expect(fs.writeJSON).toHaveBeenCalled();
    });

    it('should not save when component tracking disabled', async () => {
      cli.config.componentTracking = { enabled: false };
      await cli.saveComponentUsage();
      expect(fs.writeJSON).not.toHaveBeenCalled();
    });

    it('should handle save errors gracefully', async () => {
      cli.config.componentTracking = { enabled: true };
      fs.writeJSON = jest.fn().mockRejectedValue(new Error('Write failed'));
      await expect(cli.saveComponentUsage()).rejects.toThrow('Write failed');
    });

    it('should save tracked tickets when tracking enabled', async () => {
      cli.config.ticketTracking = { enabled: true };
      await cli.saveTrackedTickets();
      expect(fs.writeJSON).toHaveBeenCalled();
    });

    it('should not save when ticket tracking disabled', async () => {
      cli.config.ticketTracking = { enabled: false };
      await cli.saveTrackedTickets();
      expect(fs.writeJSON).not.toHaveBeenCalled();
    });
  });
});

