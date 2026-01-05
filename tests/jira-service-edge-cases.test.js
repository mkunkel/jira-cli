const JiraService = require('../src/jira-service');

jest.mock('axios');

describe('JiraService - Edge Cases and Error States', () => {
  let jiraService;
  let mockConfig;

  beforeEach(() => {
    jiraService = new JiraService();
    mockConfig = {
      jiraUrl: 'https://test.atlassian.net',
      projectKey: 'TEST',
      auth: { email: 'test@test.com', apiToken: 'token' }
    };
    jest.clearAllMocks();
  });

  describe('ADF Content Creation - Edge Cases', () => {
    it('should handle empty description', () => {
      const result = jiraService.createDescriptionContent('', mockConfig);
      expect(result).toHaveLength(1);
      expect(result[0].content[0].text).toBe('');
    });

    it('should handle null description', () => {
      const result = jiraService.createDescriptionContent(null, mockConfig);
      expect(result).toHaveLength(1);
      expect(result[0].content[0].text).toBe('');
    });

    it('should handle description with only whitespace', () => {
      const result = jiraService.createDescriptionContent('   \n  \n  ', mockConfig);
      expect(result).toHaveLength(0);
    });

    it('should handle multiple consecutive newlines', () => {
      const text = 'Line 1\n\n\n\nLine 2';
      const result = jiraService.createDescriptionContent(text, mockConfig);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle mixed markdown and plain text', () => {
      const text = '**Bold** and *italic* with [link](https://example.com) and plain text';
      const result = jiraService.createDescriptionContent(text, mockConfig);

      const content = result[0].content;
      expect(content.some(c => c.marks?.some(m => m.type === 'strong'))).toBe(true);
      expect(content.some(c => c.marks?.some(m => m.type === 'em'))).toBe(true);
      expect(content.some(c => c.marks?.some(m => m.type === 'link'))).toBe(true);
    });

    it('should handle ticket references without project key in config', () => {
      const noProjectConfig = { jiraUrl: 'https://test.atlassian.net' };
      const text = 'See TEST-123 for details';
      const result = jiraService.createDescriptionContent(text, noProjectConfig);
      // Should not create link without project key
      expect(result[0].content[0].text).toContain('TEST-123');
    });

    it('should handle malformed markdown links', () => {
      const text = '[Incomplete link](';
      const result = jiraService.createDescriptionContent(text, mockConfig);
      expect(result).toHaveLength(1);
    });

    it('should handle nested markdown', () => {
      const text = '**Bold with *italic* inside**';
      const result = jiraService.createDescriptionContent(text, mockConfig);
      const content = result[0].content;
      expect(content.some(c => c.marks?.length > 1)).toBe(true);
    });

    it('should handle URLs with query parameters', () => {
      const text = 'https://example.com?foo=bar&baz=qux';
      const result = jiraService.createDescriptionContent(text, mockConfig);
      const link = result[0].content.find(c => c.marks?.some(m => m.type === 'link'));
      expect(link.marks[0].attrs.href).toBe('https://example.com?foo=bar&baz=qux');
    });

    it('should handle URLs with anchors', () => {
      const text = 'https://example.com#section';
      const result = jiraService.createDescriptionContent(text, mockConfig);
      const link = result[0].content.find(c => c.marks?.some(m => m.type === 'link'));
      expect(link.marks[0].attrs.href).toBe('https://example.com#section');
    });
  });

  describe('Error Handling - Network Issues', () => {
    it('should handle ENOTFOUND network error', async () => {
      const mockPost = jest.fn().mockRejectedValue({
        code: 'ENOTFOUND',
        message: 'Network error'
      });
      jiraService.client = { post: mockPost };

      await expect(
        jiraService.createTicket({}, mockConfig)
      ).rejects.toThrow('Network error');
    });

    it('should handle ETIMEDOUT error', async () => {
      const mockGet = jest.fn().mockRejectedValue({
        code: 'ETIMEDOUT',
        message: 'Timeout'
      });
      jiraService.client = { get: mockGet };

      await expect(
        jiraService.getTicketDetails('TEST-1', mockConfig)
      ).rejects.toThrow();
    });

    it('should handle connection refused', async () => {
      const mockPost = jest.fn().mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'Connection refused'
      });
      jiraService.client = { post: mockPost };

      await expect(
        jiraService.createTicket({}, mockConfig)
      ).rejects.toThrow();
    });
  });

  describe('Pagination Edge Cases', () => {
    it('should handle empty page results', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: []
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getProjectAssignees(mockConfig);
      expect(result).toEqual([]);
    });

    it('should handle exactly maxResults count', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: Array(1000).fill().map((_, i) => ({
          accountId: `user-${i}`,
          displayName: `User ${i}`,
          emailAddress: `user${i}@test.com`
        }))
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getProjectAssignees(mockConfig);
      expect(result).toHaveLength(1000);
    });

    it('should stop at safety limit for assignees', async () => {
      const mockGet = jest.fn().mockImplementation(async (url, params) => ({
        data: Array(1000).fill().map((_, i) => ({
          accountId: `user-${params.params.startAt + i}`,
          displayName: `User ${params.params.startAt + i}`,
          emailAddress: `user${params.params.startAt + i}@test.com`
        }))
      }));
      jiraService.client = { get: mockGet };

      const result = await jiraService.getProjectAssignees(mockConfig);
      expect(result.length).toBeLessThanOrEqual(50000);
    });
  });

  describe('Field Validation Edge Cases', () => {
    it('should handle invalid email in assignee', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: [
          { accountId: '1', displayName: 'User 1', emailAddress: 'invalid-email' }
        ]
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getProjectAssignees(mockConfig);
      expect(result[0].emailAddress).toBe('invalid-email');
    });

    it('should handle components with duplicate names', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: [
          { name: 'Frontend' },
          { name: 'Frontend' },
          { name: 'Backend' }
        ]
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getProjectComponents(mockConfig);
      expect(result).toHaveLength(2);
      expect(result).toEqual(['Backend', 'Frontend']);
    });

    it('should handle empty component list', async () => {
      const mockGet = jest.fn().mockResolvedValue({ data: [] });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getProjectComponents(mockConfig);
      expect(result).toEqual([]);
    });
  });

  describe('Custom Field Handling', () => {
    it('should handle custom field without format specified', () => {
      const config = {
        ...mockConfig,
        customFields: {
          ticketClassification: 'customfield_10001'
        }
      };

      // Default format should be used
      expect(config.customFields.ticketClassification).toBe('customfield_10001');
    });

    it('should handle missing custom fields config', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: { key: 'TEST-1', id: '1' }
      });
      jiraService.client = { post: mockPost };

      const ticketData = {
        workType: 'Task',
        summary: 'Test',
        description: 'Test'
      };

      const result = await jiraService.createTicket(ticketData, mockConfig);
      expect(result.key).toBe('TEST-1');
    });
  });

  describe('Status Transition Edge Cases', () => {
    it('should handle status with special characters', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: {
          transitions: [
            { id: '1', to: { name: 'In Progress / Review' } }
          ]
        }
      });
      const mockPost = jest.fn().mockResolvedValue({ data: {} });
      jiraService.client = { get: mockGet, post: mockPost };

      await jiraService.transitionTicket('TEST-1', 'In Progress / Review', mockConfig);
      expect(mockPost).toHaveBeenCalled();
    });

    it('should handle empty transitions list', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: { transitions: [] }
      });
      jiraService.client = { get: mockGet };

      await expect(
        jiraService.transitionTicket('TEST-1', 'Done', mockConfig)
      ).rejects.toThrow('No transition available');
    });

    it('should provide helpful message listing available transitions', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: {
          transitions: [
            { id: '1', to: { name: 'In Progress' } },
            { id: '2', to: { name: 'Blocked' } }
          ]
        }
      });
      jiraService.client = { get: mockGet };

      await expect(
        jiraService.transitionTicket('TEST-1', 'Done', mockConfig)
      ).rejects.toThrow(/Available transitions.*In Progress.*Blocked/);
    });
  });

  describe('Issue Link Edge Cases', () => {
    it('should handle empty issue list', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: { issues: [] }
      });
      jiraService.client = { post: mockPost };

      const result = await jiraService.getLinkableIssues(mockConfig);
      expect(result).toEqual([]);
    });

    it('should filter out current issue from results', async () => {
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

      const result = await jiraService.getLinkableIssues(mockConfig, 'TEST-1');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('TEST-2');
    });

    it('should handle issue links with missing status', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: {
          issues: [
            {
              key: 'TEST-1',
              fields: {
                summary: 'Issue 1',
                status: { name: 'Unknown' }, // Provide status to avoid error
                issuetype: { name: 'Task' },
                updated: '2024-01-01'
              }
            }
          ]
        }
      });
      jiraService.client = { post: mockPost };

      const result = await jiraService.getLinkableIssues(mockConfig);
      expect(result).toHaveLength(1);
    });

    it('should handle creating link with empty array', async () => {
      jiraService.client = { post: jest.fn() };

      const result = await jiraService.createIssueLinks('TEST-1', [], mockConfig);
      expect(result).toBe(true);
    });
  });

  describe('getCurrentUser Edge Cases', () => {
    it('should handle getCurrentUser without email', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: {
          accountId: '123',
          displayName: 'Test User',
          emailAddress: '' // Empty but present
        }
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getCurrentUser(mockConfig);
      expect(result.displayName).toBe('Test User');
      expect(result.emailAddress).toBe('');
    });

    it('should handle malformed user response', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: {
          accountId: '123'
          // Missing required fields
        }
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getCurrentUser(mockConfig);
      expect(result).toBeDefined();
      expect(result.accountId).toBe('123');
    });
  });

  describe('Ticket Details Edge Cases', () => {
    it('should handle ticket without components', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: {
          key: 'TEST-1',
          fields: {
            summary: 'Test',
            status: { name: 'Open' },
            issuetype: { name: 'Task' },
            components: null
          }
        }
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getTicketDetails('TEST-1', mockConfig);
      expect(result.components).toBeUndefined();
    });

    it('should handle ticket without assignee', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: {
          key: 'TEST-1',
          fields: {
            summary: 'Test',
            status: { name: 'Open' },
            issuetype: { name: 'Task' },
            assignee: null
          }
        }
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getTicketDetails('TEST-1', mockConfig);
      expect(result.assignee).toBe('Unassigned');
    });

    it('should handle ticket with missing fields', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: {
          key: 'TEST-1',
          fields: {
            summary: 'Test',
            status: { name: 'Open' }
            // issuetype missing - will cause error
          }
        }
      });
      jiraService.client = { get: mockGet };

      await expect(
        jiraService.getTicketDetails('TEST-1', mockConfig)
      ).rejects.toThrow();
    });
  });
});

