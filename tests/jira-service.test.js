const JiraService = require('../src/jira-service');
const axios = require('axios');

jest.mock('axios');

describe('JiraService', () => {
  let jiraService;
  let mockConfig;

  beforeEach(() => {
    jiraService = new JiraService();
    mockConfig = {
      jiraUrl: 'https://test.atlassian.net',
      projectKey: 'TEST',
      auth: {
        email: 'test@example.com',
        apiToken: 'test-token'
      }
    };
    jest.clearAllMocks();
  });

  describe('initializeClient', () => {
    it('should initialize axios client with correct config', () => {
      const mockCreate = jest.fn().mockReturnValue({});
      axios.create = mockCreate;

      jiraService.initializeClient(mockConfig);

      expect(mockCreate).toHaveBeenCalledWith({
        baseURL: 'https://test.atlassian.net',
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Basic'),
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        })
      });
    });
  });

  describe('createTicket', () => {
    it('should create ticket with correct payload', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: { key: 'TEST-123', id: '12345' }
      });
      jiraService.client = { post: mockPost };

      const ticketData = {
        workType: 'Task',
        summary: 'Test ticket',
        description: 'Test description',
        priority: 'Medium',
        components: ['Component1']
      };

      const result = await jiraService.createTicket(ticketData, mockConfig);

      expect(result).toEqual({ key: 'TEST-123', id: '12345' });
      expect(mockPost).toHaveBeenCalledWith(
        '/rest/api/3/issue',
        expect.objectContaining({
          fields: expect.objectContaining({
            project: { key: 'TEST' },
            summary: 'Test ticket',
            issuetype: { name: 'Task' }
          })
        })
      );
    });

    it('should handle 401 unauthorized error', async () => {
      const mockPost = jest.fn().mockRejectedValue({
        response: {
          status: 401,
          data: {
            errorMessages: ['API token is invalid or expired']
          }
        },
        message: 'Unauthorized'
      });
      jiraService.client = { post: mockPost };

      await expect(
        jiraService.createTicket({}, mockConfig)
      ).rejects.toThrow('API token is invalid');
    });
  });

  describe('getLinkableIssues', () => {
    it('should fetch issues with correct JQL', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: {
          issues: [
            {
              key: 'TEST-1',
              fields: {
                summary: 'Issue 1',
                status: { name: 'Open' },
                issuetype: { name: 'Task' },
                updated: '2024-01-01'
              }
            }
          ]
        }
      });
      jiraService.client = { post: mockPost };

      const result = await jiraService.getLinkableIssues(mockConfig, 'TEST-2');

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('TEST-1');
      expect(mockPost).toHaveBeenCalledWith(
        '/rest/api/3/search/jql',
        expect.objectContaining({
          jql: expect.stringContaining('project = "TEST"'),
          maxResults: 500
        })
      );
    });

    it('should filter by issue type when specified', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: { issues: [] }
      });
      jiraService.client = { post: mockPost };

      await jiraService.getLinkableIssues(mockConfig, null, 'Epic');

      expect(mockPost).toHaveBeenCalledWith(
        '/rest/api/3/search/jql',
        expect.objectContaining({
          jql: expect.stringContaining('issuetype = "Epic"'),
          maxResults: 1000
        })
      );
    });

    it('should exclude current issue from results', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: {
          issues: [
            {
              key: 'TEST-1',
              fields: { summary: 'Issue 1', status: { name: 'Open' }, issuetype: { name: 'Task' } }
            },
            {
              key: 'TEST-2',
              fields: { summary: 'Issue 2', status: { name: 'Open' }, issuetype: { name: 'Task' } }
            }
          ]
        }
      });
      jiraService.client = { post: mockPost };

      const result = await jiraService.getLinkableIssues(mockConfig, 'TEST-2');

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('TEST-1');
    });
  });

  describe('createIssueLinks', () => {
    it('should create multiple issue links', async () => {
      const mockPost = jest.fn().mockResolvedValue({ data: {} });
      jiraService.client = { post: mockPost };

      const linkData = [
        { type: 'Relates', issueKey: 'TEST-2' },
        { type: 'Blocks', issueKey: 'TEST-3' }
      ];

      await jiraService.createIssueLinks('TEST-1', linkData, mockConfig);

      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(mockPost).toHaveBeenCalledWith(
        '/rest/api/3/issueLink',
        expect.objectContaining({
          type: { name: 'Relates' },
          inwardIssue: { key: 'TEST-1' },
          outwardIssue: { key: 'TEST-2' }
        }),
        expect.any(Object)
      );
    });

    it('should handle timeout errors', async () => {
      const mockPost = jest.fn().mockRejectedValue({
        code: 'ECONNABORTED'
      });
      jiraService.client = { post: mockPost };

      await expect(
        jiraService.createIssueLinks('TEST-1', [{ type: 'Relates', issueKey: 'TEST-2' }], mockConfig)
      ).rejects.toThrow('Request timed out');
    });
  });

  describe('updateTicketField', () => {
    it('should update field with correct payload', async () => {
      const mockPut = jest.fn().mockResolvedValue({ data: {} });
      jiraService.client = { put: mockPut };

      await jiraService.updateTicketField('TEST-1', 'summary', 'New summary', mockConfig);

      expect(mockPut).toHaveBeenCalledWith(
        '/rest/api/3/issue/TEST-1',
        { fields: { summary: 'New summary' } },
        { timeout: 30000 }
      );
    });

    it('should handle 400 validation errors', async () => {
      const mockPut = jest.fn().mockRejectedValue({
        response: {
          status: 400,
          data: {
            errors: { summary: 'Summary is required' }
          }
        },
        message: 'Bad Request'
      });
      jiraService.client = { put: mockPut };

      await expect(
        jiraService.updateTicketField('TEST-1', 'summary', '', mockConfig)
      ).rejects.toThrow('Summary is required');
    });
  });

  describe('getProjectComponents', () => {
    it('should fetch and sort components', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: [
          { name: 'Zebra' },
          { name: 'Alpha' },
          { name: 'Beta' }
        ]
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getProjectComponents(mockConfig);

      expect(result).toEqual(['Alpha', 'Beta', 'Zebra']);
    });
  });

  describe('getProjectAssignees', () => {
    it('should fetch assignees with pagination', async () => {
      const mockGet = jest.fn()
        .mockResolvedValueOnce({
          data: Array(1000).fill().map((_, i) => ({
            accountId: `user-${i}`,
            displayName: `User ${i}`,
            emailAddress: `user${i}@example.com`
          }))
        })
        .mockResolvedValueOnce({
          data: Array(500).fill().map((_, i) => ({
            accountId: `user-${i + 1000}`,
            displayName: `User ${i + 1000}`,
            emailAddress: `user${i + 1000}@example.com`
          }))
        });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getProjectAssignees(mockConfig);

      expect(result).toHaveLength(1500);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('should filter out invalid users', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: [
          { accountId: '1', displayName: 'Valid User', emailAddress: 'valid@example.com' },
          { accountId: '2', displayName: 'undefined' },
          { accountId: '3', displayName: '' },
          null
        ]
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getProjectAssignees(mockConfig);

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('Valid User');
    });
  });

  describe('transitionTicket', () => {
  describe('transitionTicket', () => {
    it('should transition ticket to correct status', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: {
          transitions: [
            { id: '1', to: { name: 'In Progress' } },
            { id: '2', to: { name: 'Done' } }
          ]
        }
      });
      const mockPost = jest.fn().mockResolvedValue({ data: {} });
      jiraService.client = { get: mockGet, post: mockPost };

      await jiraService.transitionTicket('TEST-1', 'Done', mockConfig);

      expect(mockPost).toHaveBeenCalledWith(
        '/rest/api/3/issue/TEST-1/transitions',
        { transition: { id: '2' } }
      );
    });

    it('should throw error if transition not found', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: {
          transitions: [{ id: '1', to: { name: 'In Progress' } }]
        }
      });
      jiraService.client = { get: mockGet, post: jest.fn() };

      await expect(
        jiraService.transitionTicket('TEST-1', 'Done', mockConfig)
      ).rejects.toThrow('No transition available');
    });
  });
  });

  describe('getTicketDetails', () => {
    it('should fetch and format ticket details', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: {
          key: 'TEST-1',
          fields: {
            summary: 'Test ticket',
            status: { name: 'Open' },
            issuetype: { name: 'Task' },
            assignee: { displayName: 'John Doe' },
            components: [{ name: 'Frontend' }],
            priority: { name: 'High' }
          }
        }
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getTicketDetails('TEST-1', mockConfig);

      expect(result.key).toBe('TEST-1');
      expect(result.summary).toBe('Test ticket');
      expect(result.status).toBe('Open');
      expect(result.workType).toBe('Task');
    });
  });
});

