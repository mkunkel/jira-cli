const JiraTicketCLI = require('../src/jira-cli');
const JiraService = require('../src/jira-service');
const inquirer = require('inquirer');

jest.mock('../src/jira-service');
jest.mock('inquirer');

describe('Log Time Feature - TDD', () => {
  let cli;
  let mockJiraService;

  beforeEach(() => {
    cli = new JiraTicketCLI();
    mockJiraService = new JiraService();
    cli.jiraService = mockJiraService;

    cli.config = {
      projectKey: 'TEST',
      jiraUrl: 'https://test.atlassian.net',
      auth: { email: 'test@test.com', apiToken: 'token' }
    };

    console.log = jest.fn();
    jest.clearAllMocks();
  });

  describe('Time Validation', () => {
    it('should accept valid time formats', () => {
      expect(cli.validateTimeFormat('2h')).toBe(true);
      expect(cli.validateTimeFormat('30m')).toBe(true);
      expect(cli.validateTimeFormat('1d')).toBe(true);
      expect(cli.validateTimeFormat('1w')).toBe(true);
      expect(cli.validateTimeFormat('2h 30m')).toBe(true);
      expect(cli.validateTimeFormat('1d 4h 30m')).toBe(true);
    });

    it('should reject invalid time formats', () => {
      expect(cli.validateTimeFormat('2 hours')).toContain('Invalid time format');
      expect(cli.validateTimeFormat('abc')).toContain('Invalid time format');
      expect(cli.validateTimeFormat('')).toContain('Time cannot be empty');
      expect(cli.validateTimeFormat('2x')).toContain('Invalid time format');
      expect(cli.validateTimeFormat('2h3m')).toContain('spaces'); // No space between units
      expect(cli.validateTimeFormat('1d2h')).toContain('spaces'); // No space between units
    });

    it('should reject time units in wrong order', () => {
      expect(cli.validateTimeFormat('2h 1d')).toContain('order');
      expect(cli.validateTimeFormat('30m 2h')).toContain('order');
      expect(cli.validateTimeFormat('1h 1w')).toContain('order');
    });

    it('should accept single units with no spaces', () => {
      expect(cli.validateTimeFormat('2h')).toBe(true);
      expect(cli.validateTimeFormat('45m')).toBe(true);
      expect(cli.validateTimeFormat('3d')).toBe(true);
      expect(cli.validateTimeFormat('1w')).toBe(true);
    });

    it('should return error message for invalid formats', () => {
      const result = cli.validateTimeFormat('invalid');
      expect(result).toContain('Invalid time format');
    });
  });

  describe('Log Time Workflow', () => {
    it('should get worklogs and display current time', async () => {
      mockJiraService.getWorklogs = jest.fn().mockResolvedValue({
        worklogs: [
          { timeSpentSeconds: 7200 }, // 2h
          { timeSpentSeconds: 1800 }  // 30m
        ]
      });

      const total = await cli.getCurrentLoggedTime('TEST-1');

      expect(mockJiraService.getWorklogs).toHaveBeenCalledWith('TEST-1', cli.config);
      expect(total).toBe('2h 30m');
    });

    it('should log time with comment', async () => {
      mockJiraService.getWorklogs = jest.fn().mockResolvedValue({ worklogs: [] });
      mockJiraService.logWorklog = jest.fn().mockResolvedValue({ id: '123' });

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ timeSpent: '2h 30m' })
        .mockResolvedValueOnce({ addComment: true })
        .mockResolvedValueOnce({ comment: 'Working on feature' });

      await cli.logTime('TEST-1');

      expect(mockJiraService.logWorklog).toHaveBeenCalledWith(
        'TEST-1',
        '2h 30m',
        'Working on feature',
        expect.any(String), // started timestamp
        cli.config
      );
    });

    it('should log time without comment', async () => {
      mockJiraService.getWorklogs = jest.fn().mockResolvedValue({ worklogs: [] });
      mockJiraService.logWorklog = jest.fn().mockResolvedValue({ id: '123' });

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ timeSpent: '3h' })
        .mockResolvedValueOnce({ addComment: false });

      await cli.logTime('TEST-1');

      expect(mockJiraService.logWorklog).toHaveBeenCalledWith(
        'TEST-1',
        '3h',
        undefined,
        expect.any(String), // started timestamp
        cli.config
      );
    });

    it('should show total time after logging', async () => {
      mockJiraService.getWorklogs = jest.fn()
        .mockResolvedValueOnce({ worklogs: [{ timeSpentSeconds: 7200 }] }) // Before: 2h
        .mockResolvedValueOnce({ worklogs: [
          { timeSpentSeconds: 7200 },
          { timeSpentSeconds: 5400 } // After: 2h + 1h 30m = 3h 30m
        ]});

      mockJiraService.logWorklog = jest.fn().mockResolvedValue({
        id: '123',
        timeSpentSeconds: 5400
      });

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ timeSpent: '1h 30m' })
        .mockResolvedValueOnce({ addComment: false });

      await cli.logTime('TEST-1');

      // Verify we fetched worklogs twice (before and after)
      expect(mockJiraService.getWorklogs).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('3h 30m')
      );
    });

    it('should handle API errors gracefully', async () => {
      mockJiraService.getWorklogs = jest.fn().mockResolvedValue({ worklogs: [] });
      mockJiraService.logWorklog = jest.fn().mockRejectedValue(
        new Error('Failed to log work: API error')
      );

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ timeSpent: '2h' })
        .mockResolvedValueOnce({ addComment: false });

      await expect(cli.logTime('TEST-1')).rejects.toThrow('API error');
    });

    it('should display time syntax guide', async () => {
      mockJiraService.getWorklogs = jest.fn().mockResolvedValue({ worklogs: [] });

      cli.displayTimeSyntaxGuide();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('2h')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('30m')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('1d')
      );
    });
  });

  describe('Ticket Selection', () => {
    it('should use provided ticket key', async () => {
      mockJiraService.getWorklogs = jest.fn().mockResolvedValue({ worklogs: [] });
      mockJiraService.logWorklog = jest.fn().mockResolvedValue({ id: '123' });

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ timeSpent: '1h' })
        .mockResolvedValueOnce({ addComment: false });

      await cli.logTime('TEST-123');

      expect(mockJiraService.getWorklogs).toHaveBeenCalledWith('TEST-123', cli.config);
    });

    it('should normalize numeric ticket keys', async () => {
      mockJiraService.getWorklogs = jest.fn().mockResolvedValue({ worklogs: [] });
      mockJiraService.logWorklog = jest.fn().mockResolvedValue({ id: '123' });

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ timeSpent: '1h' })
        .mockResolvedValueOnce({ addComment: false });

      await cli.logTime('456'); // Just a number

      // Should prepend project key (LPWEB from config)
      expect(mockJiraService.getWorklogs).toHaveBeenCalledWith('LPWEB-456', cli.config);
      expect(mockJiraService.logWorklog).toHaveBeenCalledWith(
        'LPWEB-456',
        '1h',
        undefined,
        expect.any(String),
        cli.config
      );
    });

    it('should show ticket list when no key provided', async () => {
      cli.selectTicketForEdit = jest.fn().mockResolvedValue('TEST-456');
      mockJiraService.getWorklogs = jest.fn().mockResolvedValue({ worklogs: [] });
      mockJiraService.logWorklog = jest.fn().mockResolvedValue({ id: '123' });

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ timeSpent: '2h' })
        .mockResolvedValueOnce({ addComment: false });

      await cli.logTime();

      expect(cli.selectTicketForEdit).toHaveBeenCalled();
      expect(mockJiraService.getWorklogs).toHaveBeenCalledWith('TEST-456', cli.config);
    });
  });

  describe('Direct Time String Input', () => {
    it('should accept time string as parameter', async () => {
      mockJiraService.getWorklogs = jest.fn()
        .mockResolvedValueOnce({ worklogs: [] })
        .mockResolvedValueOnce({ worklogs: [{ timeSpentSeconds: 7200 }] });
      mockJiraService.logWorklog = jest.fn().mockResolvedValue({ id: '123' });

      await cli.logTime('TEST-123', '2h');

      expect(mockJiraService.logWorklog).toHaveBeenCalledWith(
        'TEST-123',
        '2h',
        undefined,
        expect.any(String),
        cli.config
      );
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it('should accept multi-unit time string', async () => {
      mockJiraService.getWorklogs = jest.fn()
        .mockResolvedValueOnce({ worklogs: [] })
        .mockResolvedValueOnce({ worklogs: [{ timeSpentSeconds: 9000 }] });
      mockJiraService.logWorklog = jest.fn().mockResolvedValue({ id: '123' });

      await cli.logTime('TEST-123', '2h 30m');

      expect(mockJiraService.logWorklog).toHaveBeenCalledWith(
        'TEST-123',
        '2h 30m',
        undefined,
        expect.any(String),
        cli.config
      );
    });

    it('should validate time string parameter', async () => {
      mockJiraService.getWorklogs = jest.fn().mockResolvedValue({ worklogs: [] });

      await expect(cli.logTime('TEST-123', 'invalid')).rejects.toThrow('Invalid time format');
    });

    it('should reject time string without spaces', async () => {
      mockJiraService.getWorklogs = jest.fn().mockResolvedValue({ worklogs: [] });

      await expect(cli.logTime('TEST-123', '2h30m')).rejects.toThrow('spaces');
    });

    it('should still prompt for time if not provided', async () => {
      mockJiraService.getWorklogs = jest.fn().mockResolvedValue({ worklogs: [] });
      mockJiraService.logWorklog = jest.fn().mockResolvedValue({ id: '123' });

      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ timeSpent: '3h' })
        .mockResolvedValueOnce({ addComment: false });

      await cli.logTime('TEST-123'); // No time string

      expect(inquirer.prompt).toHaveBeenCalled();
    });
  });
});

