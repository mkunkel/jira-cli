const JiraService = require('../src/jira-service');

describe('JiraService - Issue Linking Integration', () => {
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
  });

  describe('getLinkableIssues with filtering', () => {
    it('should fetch only Epic types when filter specified', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: {
          issues: [
            {
              key: 'TEST-1',
              fields: {
                summary: 'Epic 1',
                status: { name: 'Open' },
                issuetype: { name: 'Epic' },
                updated: '2024-01-01'
              }
            }
          ]
        }
      });
      jiraService.client = { post: mockPost };

      const result = await jiraService.getLinkableIssues(mockConfig, null, 'Epic');

      expect(mockPost).toHaveBeenCalledWith(
        '/rest/api/3/search/jql',
        expect.objectContaining({
          jql: expect.stringContaining('issuetype = "Epic"'),
          maxResults: 1000
        })
      );
      expect(result[0].workType).toBe('Epic');
    });

    it('should use higher limit for filtered searches', async () => {
      const mockPost = jest.fn().mockResolvedValue({ data: { issues: [] } });
      jiraService.client = { post: mockPost };

      await jiraService.getLinkableIssues(mockConfig, null, 'Epic');
      const epicCall = mockPost.mock.calls[0][1];
      expect(epicCall.maxResults).toBe(1000);

      await jiraService.getLinkableIssues(mockConfig, null, null);
      const generalCall = mockPost.mock.calls[1][1];
      expect(generalCall.maxResults).toBe(500);
    });

    it('should sort by key DESC', async () => {
      const mockPost = jest.fn().mockResolvedValue({ data: { issues: [] } });
      jiraService.client = { post: mockPost };

      await jiraService.getLinkableIssues(mockConfig);

      expect(mockPost).toHaveBeenCalledWith(
        '/rest/api/3/search/jql',
        expect.objectContaining({
          jql: expect.stringContaining('ORDER BY key DESC')
        })
      );
    });
  });

  describe('createIssueLinks batch operations', () => {
    it('should create multiple links in parallel', async () => {
      const mockPost = jest.fn().mockResolvedValue({ data: {} });
      jiraService.client = { post: mockPost };

      const linkData = [
        { type: 'Relates', issueKey: 'TEST-2' },
        { type: 'Relates', issueKey: 'TEST-3' },
        { type: 'Blocks', issueKey: 'TEST-4' }
      ];

      await jiraService.createIssueLinks('TEST-1', linkData, mockConfig);

      expect(mockPost).toHaveBeenCalledTimes(3);

      // Verify each link was created with correct structure
      expect(mockPost).toHaveBeenCalledWith(
        '/rest/api/3/issueLink',
        expect.objectContaining({
          type: { name: 'Relates' },
          inwardIssue: { key: 'TEST-1' }
        }),
        expect.any(Object)
      );
    });

    it('should handle partial failures in batch', async () => {
      const mockPost = jest.fn()
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce({
          response: { status: 400, data: { errorMessages: ['Invalid link'] } },
          message: 'Request failed with status code 400'
        })
        .mockResolvedValueOnce({ data: {} });

      jiraService.client = { post: mockPost };

      const linkData = [
        { type: 'Relates', issueKey: 'TEST-2' },
        { type: 'Relates', issueKey: 'TEST-3' },
        { type: 'Relates', issueKey: 'TEST-4' }
      ];

      await expect(
        jiraService.createIssueLinks('TEST-1', linkData, mockConfig)
      ).rejects.toThrow('Invalid link');
    });
  });

  describe('updateTicketField with timeout', () => {
    it('should include timeout in request', async () => {
      const mockPut = jest.fn().mockResolvedValue({ data: {} });
      jiraService.client = { put: mockPut };

      await jiraService.updateTicketField('TEST-1', 'summary', 'New', mockConfig);

      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { timeout: 30000 }
      );
    });

    it('should handle timeout errors gracefully', async () => {
      const mockPut = jest.fn().mockRejectedValue({
        code: 'ECONNABORTED'
      });
      jiraService.client = { put: mockPut };

      await expect(
        jiraService.updateTicketField('TEST-1', 'summary', 'New', mockConfig)
      ).rejects.toThrow('Request timed out');
    });
  });
});

describe('JiraService - ADF Content Creation', () => {
  let jiraService;
  let mockConfig;

  beforeEach(() => {
    jiraService = new JiraService();
    mockConfig = { projectKey: 'TEST', jiraUrl: 'https://test.atlassian.net' };
  });

  describe('createDescriptionContent', () => {
    it('should handle markdown bold and italic', () => {
      const markdown = '**bold** and *italic*';
      const result = jiraService.createDescriptionContent(markdown, mockConfig);

      expect(result[0].content.some(c => c.marks?.some(m => m.type === 'strong'))).toBe(true);
      expect(result[0].content.some(c => c.marks?.some(m => m.type === 'em'))).toBe(true);
    });

    it('should convert URLs to links', () => {
      const text = 'Visit https://example.com for details';
      const result = jiraService.createDescriptionContent(text, mockConfig);

      const link = result[0].content.find(c => c.type === 'text' && c.marks?.some(m => m.type === 'link'));
      expect(link).toBeDefined();
      expect(link.marks.find(m => m.type === 'link').attrs.href).toBe('https://example.com');
    });

    it('should convert ticket references to links', () => {
      const text = 'See TEST-123 for details';
      const result = jiraService.createDescriptionContent(text, mockConfig);

      const link = result[0].content.find(c =>
        c.type === 'text' &&
        c.text === 'TEST-123' &&
        c.marks?.some(m => m.type === 'link')
      );
      expect(link).toBeDefined();
    });

    it('should handle multiple paragraphs', () => {
      const text = 'Paragraph 1\n\nParagraph 2';
      const result = jiraService.createDescriptionContent(text, mockConfig);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('paragraph');
      expect(result[1].type).toBe('paragraph');
    });

    it('should return empty paragraph for empty description', () => {
      const result = jiraService.createDescriptionContent('', mockConfig);

      expect(result).toHaveLength(1);
      expect(result[0].content[0].text).toBe('');
    });
  });

  describe('parseParagraph', () => {
    it('should handle markdown links', () => {
      const text = '[Google](https://google.com)';
      const result = jiraService.parseParagraph(text, mockConfig);

      const link = result.content.find(c => c.marks?.some(m => m.type === 'link'));
      expect(link.text).toBe('Google');
      expect(link.marks.find(m => m.type === 'link').attrs.href).toBe('https://google.com');
    });

    it('should not double-link markdown links', () => {
      const text = '[TEST-123](https://test.atlassian.net/browse/TEST-123)';
      const result = jiraService.parseParagraph(text, mockConfig);

      // Should only have one link, not nested
      const links = result.content.filter(c => c.marks?.some(m => m.type === 'link'));
      expect(links).toHaveLength(1);
    });
  });
});

describe('JiraService - Error Handling', () => {
  let jiraService;
  let mockConfig;

  beforeEach(() => {
    jiraService = new JiraService();
    mockConfig = {
      jiraUrl: 'https://test.atlassian.net',
      projectKey: 'TEST',
      auth: { email: 'test@test.com', apiToken: 'token' }
    };
  });

  describe('HTTP error responses', () => {
    it('should handle 404 Not Found', async () => {
      const mockGet = jest.fn().mockRejectedValue({
        response: { status: 404 }
      });
      jiraService.client = { get: mockGet };

      await expect(
        jiraService.getTicketDetails('INVALID', mockConfig)
      ).rejects.toThrow('not found');
    });

    it('should handle 403 Forbidden', async () => {
      const mockPut = jest.fn().mockRejectedValue({
        response: { status: 403 },
        message: 'Forbidden'
      });
      jiraService.client = { put: mockPut };

      await expect(
        jiraService.updateTicketField('TEST-1', 'summary', 'New', mockConfig)
      ).rejects.toThrow('Access denied');
    });

    it('should handle 400 Bad Request with field errors', async () => {
      const mockPut = jest.fn().mockRejectedValue({
        response: {
          status: 400,
          data: {
            errors: {
              summary: 'Summary cannot be empty'
            }
          }
        },
        message: 'Bad Request'
      });
      jiraService.client = { put: mockPut };

      await expect(
        jiraService.updateTicketField('TEST-1', 'summary', '', mockConfig)
      ).rejects.toThrow('Summary cannot be empty');
    });

    it('should provide generic error for unknown errors', async () => {
      const mockPost = jest.fn().mockRejectedValue(new Error('Network error'));
      jiraService.client = { post: mockPost };

      await expect(
        jiraService.createTicket({}, mockConfig)
      ).rejects.toThrow('Network error');
    });
  });
});

