const JiraTicketCLI = require('../src/jira-cli');
const JiraService = require('../src/jira-service');
const inquirer = require('inquirer');

jest.mock('../src/jira-service');
jest.mock('inquirer');

describe('Capitalized Field - TDD Implementation', () => {
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
      customFields: {
        capitalized: 'customfield_10037'
      }
    };

    jest.clearAllMocks();
    console.log = jest.fn();
  });

  describe('RED: Capitalized field configuration', () => {
    it('should have customfield_10037 configured for Capitalized field', () => {
      expect(cli.config.customFields.capitalized).toBe('customfield_10037');
    });
  });

  describe('RED: Ask Capitalized question after Work Type', () => {
    it('should ask "Will this be capitalized?" after work type is selected', async () => {
      // Mock the askCapitalized method
      cli.askCapitalized = jest.fn().mockResolvedValue('No');
      cli.selectComponents = jest.fn().mockResolvedValue([]);
      cli.selectStatus = jest.fn().mockResolvedValue({ name: 'To Do' });
      cli.selectAssignee = jest.fn().mockResolvedValue({ displayName: 'Unassigned' });
      cli.customListPrompt = jest.fn()
        .mockResolvedValueOnce('Task') // Work type
        .mockResolvedValueOnce('Medium') // Priority
        .mockResolvedValueOnce('Feature/Enhancement'); // Classification

      mockJiraService.getProjectComponents = jest.fn().mockResolvedValue([]);
      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue(['To Do']);
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({ displayName: 'Test' });
      mockJiraService.getProjectAssignees = jest.fn().mockResolvedValue([]);

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ summary: 'Test', description: 'Test' })
        .mockResolvedValueOnce({ linkEpic: false });

      await cli.collectTicketData(false);

      // Should ask capitalized after work type
      expect(cli.askCapitalized).toHaveBeenCalled();
    });
  });

  describe('RED: Capitalized = Yes requires Epic', () => {
    it('should require epic link when Capitalized = Yes', async () => {
      cli.askCapitalized = jest.fn().mockResolvedValue('Yes');
      cli.selectOrCreateEpic = jest.fn().mockResolvedValue('EPIC-1');
      cli.selectComponents = jest.fn().mockResolvedValue([]);
      cli.selectStatus = jest.fn().mockResolvedValue({ name: 'To Do' });
      cli.selectAssignee = jest.fn().mockResolvedValue({ displayName: 'Unassigned' });
      cli.customListPrompt = jest.fn()
        .mockResolvedValueOnce('Task') // Work type
        .mockResolvedValueOnce('Medium') // Priority
        .mockResolvedValueOnce('Feature/Enhancement'); // Classification

      mockJiraService.getProjectComponents = jest.fn().mockResolvedValue([]);
      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue(['To Do']);
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({ displayName: 'Test' });
      mockJiraService.getProjectAssignees = jest.fn().mockResolvedValue([]);

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ summary: 'Test', description: 'Test' });

      const result = await cli.collectTicketData(false);

      expect(cli.selectOrCreateEpic).toHaveBeenCalled();
      expect(result.epicLink).toBe('EPIC-1');
    });

    it('should only show Epics with Capitalized = Yes', async () => {
      mockJiraService.getLinkableIssues = jest.fn().mockResolvedValue([
        { key: 'EPIC-1', summary: 'Epic 1', fields: { customfield_10037: { value: 'Yes' }, status: { name: 'In Progress' } } },
        { key: 'EPIC-2', summary: 'Epic 2', fields: { customfield_10037: { value: 'No' }, status: { name: 'Open' } } },
        { key: 'EPIC-3', summary: 'Epic 3', fields: { customfield_10037: { value: 'Yes' }, status: { name: 'To Do' } } }
      ]);

      const result = await cli.getCapitalizedEpics();

      expect(result).toHaveLength(2);
      expect(result.find(e => e.key === 'EPIC-2')).toBeUndefined();
    });

    it('should exclude epics with Done status', async () => {
      mockJiraService.getLinkableIssues = jest.fn().mockResolvedValue([
        { key: 'EPIC-1', summary: 'Active Epic', fields: { customfield_10037: { value: 'Yes' }, status: { name: 'In Progress' } } },
        { key: 'EPIC-2', summary: 'Done Epic', fields: { customfield_10037: { value: 'Yes' }, status: { name: 'Done' } } },
        { key: 'EPIC-3', summary: 'Closed Epic', fields: { customfield_10037: { value: 'Yes' }, status: { name: 'Closed' } } }
      ]);

      const result = await cli.getCapitalizedEpics();

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('EPIC-1');
      expect(result.find(e => e.key === 'EPIC-2')).toBeUndefined();
      expect(result.find(e => e.key === 'EPIC-3')).toBeUndefined();
    });
  });

  describe('RED: Epic Creation Flow', () => {
    it('should offer to create epic when no suitable epic exists', async () => {
      mockJiraService.getLinkableIssues = jest.fn().mockResolvedValue([]);

      inquirer.prompt = jest.fn().mockResolvedValueOnce({
        action: 'create' // Create new epic
      });

      cli.createEpicAndContinue = jest.fn().mockResolvedValue('NEW-EPIC-1');

      const result = await cli.selectOrCreateEpic();

      expect(inquirer.prompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'What would you like to do?'
          })
        ])
      );
      expect(cli.createEpicAndContinue).toHaveBeenCalled();
    });

    it('should create epic with Capitalized = Yes automatically', async () => {
      cli.askCapitalized = jest.fn().mockResolvedValue('No'); // Epic won't ask again
      cli.selectComponents = jest.fn().mockResolvedValue([]);
      cli.selectStatus = jest.fn().mockResolvedValue({ name: 'To Do' });
      cli.selectAssignee = jest.fn().mockResolvedValue({ displayName: 'Unassigned' });
      cli.customListPrompt = jest.fn()
        .mockResolvedValueOnce('Epic')
        .mockResolvedValueOnce('Medium')
        .mockResolvedValueOnce('Feature/Enhancement');

      mockJiraService.getProjectComponents = jest.fn().mockResolvedValue([]);
      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue(['To Do']);
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({ displayName: 'Test' });
      mockJiraService.getProjectAssignees = jest.fn().mockResolvedValue([]);
      mockJiraService.createTicket = jest.fn().mockResolvedValue({ key: 'EPIC-100', id: '100' });

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ summary: 'New Epic', description: 'Epic desc' });

      const epicKey = await cli.createEpicAndContinue();

      expect(mockJiraService.createTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          customfield_10037: { id: '10022' } // Yes = 10022
        }),
        expect.anything()
      );
      expect(epicKey).toBe('EPIC-100');
    });
  });

  describe('RED: Capitalized = No (Optional Epic)', () => {
    it('should offer optional epic link when Capitalized = No', async () => {
      cli.askCapitalized = jest.fn().mockResolvedValue('No');
      cli.selectEpic = jest.fn().mockResolvedValue('EPIC-5');
      cli.selectComponents = jest.fn().mockResolvedValue([]);
      cli.selectStatus = jest.fn().mockResolvedValue({ name: 'To Do' });
      cli.selectAssignee = jest.fn().mockResolvedValue({ displayName: 'Unassigned' });
      cli.customListPrompt = jest.fn()
        .mockResolvedValueOnce('Task') // Work type
        .mockResolvedValueOnce('Medium') // Priority
        .mockResolvedValueOnce('Feature/Enhancement'); // Classification

      mockJiraService.getProjectComponents = jest.fn().mockResolvedValue([]);
      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue(['To Do']);
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({ displayName: 'Test' });
      mockJiraService.getProjectAssignees = jest.fn().mockResolvedValue([]);

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ linkEpic: true })
        .mockResolvedValueOnce({ summary: 'Test', description: 'Test' });

      const result = await cli.collectTicketData(false);

      expect(inquirer.prompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('link')
          })
        ])
      );
    });
  });

  describe('RED: Epic Work Type Special Case', () => {
    it('should not require epic link when workType is Epic and Capitalized = Yes', async () => {
      cli.askCapitalized = jest.fn().mockResolvedValue('Yes');
      cli.selectOrCreateEpic = jest.fn();
      cli.selectComponents = jest.fn().mockResolvedValue([]);
      cli.selectStatus = jest.fn().mockResolvedValue({ name: 'To Do' });
      cli.selectAssignee = jest.fn().mockResolvedValue({ displayName: 'Unassigned' });
      cli.customListPrompt = jest.fn()
        .mockResolvedValueOnce('Epic') // Work type = Epic
        .mockResolvedValueOnce('Medium') // Priority
        .mockResolvedValueOnce('Feature/Enhancement'); // Classification

      mockJiraService.getProjectComponents = jest.fn().mockResolvedValue([]);
      mockJiraService.getProjectStatuses = jest.fn().mockResolvedValue(['To Do']);
      mockJiraService.getCurrentUser = jest.fn().mockResolvedValue({ displayName: 'Test' });
      mockJiraService.getProjectAssignees = jest.fn().mockResolvedValue([]);

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ summary: 'Epic', description: 'Epic' });

      await cli.collectTicketData(false);

      // Should NOT call selectOrCreateEpic for Epic work type
      expect(cli.selectOrCreateEpic).not.toHaveBeenCalled();
    });
  });

  describe('RED: Edit Flow - Changing to Capitalized = Yes', () => {
    it('should require epic selection when changing from No to Yes', async () => {
      const currentTicket = {
        key: 'TEST-1',
        workType: 'Task',
        fullFields: {
          customfield_10037: { value: 'No', id: '10023' }
        }
      };

      cli.selectOrCreateEpic = jest.fn().mockResolvedValue('EPIC-10');
      mockJiraService.updateTicketField = jest.fn().mockResolvedValue();

      // User changes to Yes
      inquirer.prompt = jest.fn().mockResolvedValueOnce({
        value: 'Yes'
      });

      await cli.editCapitalizedField('TEST-1', { key: 'customfield_10037' }, currentTicket);

      expect(cli.selectOrCreateEpic).toHaveBeenCalled();
      expect(mockJiraService.updateTicketField).toHaveBeenCalled();
    });
  });

  describe('RED: Epic Selection UX', () => {
    it('should use autocomplete prompt for epic selection', async () => {
      const epics = [
        { key: 'EPIC-1', summary: 'First Epic', fields: { customfield_10037: { value: 'Yes' }, status: { name: 'Open' } } },
        { key: 'EPIC-2', summary: 'Second Epic', fields: { customfield_10037: { value: 'Yes' }, status: { name: 'Open' } } }
      ];

      cli.customAutocompletePrompt = jest.fn().mockResolvedValue('EPIC-1');

      const result = await cli.selectEpic(epics);

      expect(cli.customAutocompletePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.any(String),
          choices: expect.arrayContaining([
            expect.stringContaining('EPIC-1'),
            expect.stringContaining('EPIC-2')
          ])
        })
      );
      expect(result).toBe('EPIC-1');
    });

    it('should include "Create new Epic" option in list', async () => {
      const epics = [
        { key: 'EPIC-1', summary: 'Epic', fields: { customfield_10037: { value: 'Yes' }, status: { name: 'Open' } } }
      ];

      cli.customAutocompletePrompt = jest.fn().mockResolvedValue('➕ Create new Epic');
      cli.createEpicAndContinue = jest.fn().mockResolvedValue('NEW-EPIC-1');

      const result = await cli.selectEpic(epics);

      expect(cli.customAutocompletePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: expect.arrayContaining([
            '➕ Create new Epic'
          ])
        })
      );
      expect(cli.createEpicAndContinue).toHaveBeenCalled();
      expect(result).toBe('NEW-EPIC-1');
    });
  });
});

