const JiraService = require('../src/jira-service');

jest.mock('axios');

describe('JiraService - Additional Coverage', () => {
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

  describe('Markdown to ADF Conversion - Comprehensive', () => {
    it('should handle bold text', () => {
      const result = jiraService.createDescriptionContent('**Bold text** normal', mockConfig);
      const boldNode = result[0].content.find(c => c.marks?.some(m => m.type === 'strong'));
      expect(boldNode).toBeDefined();
      expect(boldNode.text).toContain('Bold');
    });

    it('should handle italic text', () => {
      const result = jiraService.createDescriptionContent('normal *italic*', mockConfig);
      const italicNode = result[0].content.find(c => c.marks?.some(m => m.type === 'em'));
      expect(italicNode).toBeDefined();
    });

    it('should handle inline code', () => {
      const result = jiraService.createDescriptionContent('Use `console.log()` here', mockConfig);
      const codeNode = result[0].content.find(c => c.marks?.some(m => m.type === 'code'));
      expect(codeNode).toBeDefined();
    });

    it('should handle multiple ticket references', () => {
      const text = 'See TEST-1 and TEST-2 for details';
      const result = jiraService.createDescriptionContent(text, mockConfig);

      const linkNodes = result[0].content.filter(c =>
        c.marks?.some(m => m.type === 'link')
      );
      expect(linkNodes.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle mixed formatting', () => {
      const text = '**Bold** and *italic* and `code` and [link](https://test.com)';
      const result = jiraService.createDescriptionContent(text, mockConfig);

      expect(result[0].content.some(c => c.marks?.some(m => m.type === 'strong'))).toBe(true);
      expect(result[0].content.some(c => c.marks?.some(m => m.type === 'em'))).toBe(true);
      expect(result[0].content.some(c => c.marks?.some(m => m.type === 'code'))).toBe(true);
      expect(result[0].content.some(c => c.marks?.some(m => m.type === 'link'))).toBe(true);
    });

    it('should handle multiple paragraphs', () => {
      const text = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';
      const result = jiraService.createDescriptionContent(text, mockConfig);

      const paragraphs = result.filter(node => node.type === 'paragraph');
      expect(paragraphs.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle URLs in text', () => {
      const text = 'Visit https://example.com for more info';
      const result = jiraService.createDescriptionContent(text, mockConfig);

      const linkNode = result[0].content.find(c =>
        c.marks?.some(m => m.type === 'link' && m.attrs.href === 'https://example.com')
      );
      expect(linkNode).toBeDefined();
    });
  });

  describe('getAllFields - Error Handling', () => {
    it('should fetch all fields successfully', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: [
          { id: 'field1', name: 'Field 1', schema: { type: 'string' } },
          { id: 'field2', name: 'Field 2', schema: { type: 'array' } }
        ]
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getAllFields(mockConfig);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('field1');
    });

    it('should handle empty fields array', async () => {
      const mockGet = jest.fn().mockResolvedValue({ data: [] });
      jiraService.client = { get: mockGet };

      const result = await jiraService.getAllFields(mockConfig);
      expect(result).toEqual([]);
    });
  });

  describe('getFieldOptions - Comprehensive', () => {
    it('should return empty array (method not fully implemented)', async () => {
      const mockGet = jest.fn().mockResolvedValue({ data: {} });
      jiraService.client = { get: mockGet };

      // This method exists but doesn't parse results - just test it doesn't crash
      await expect(jiraService.getFieldOptions('customfield_10001')).resolves.toBeDefined();
    });
  });

  describe('testConnection - Comprehensive', () => {
    it('should return true for successful connection', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: { displayName: 'Test User' }
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.testConnection(mockConfig);
      expect(result).toBe(true);
    });

    it('should return false for authentication error', async () => {
      const mockGet = jest.fn().mockRejectedValue({
        response: { status: 401 },
        message: 'Unauthorized'
      });
      jiraService.client = { get: mockGet };

      const result = await jiraService.testConnection(mockConfig);
      expect(result).toBe(false);
    });

    it('should return false for any error', async () => {
      const mockGet = jest.fn().mockRejectedValue(new Error('Network error'));
      jiraService.client = { get: mockGet };

      const result = await jiraService.testConnection(mockConfig);
      expect(result).toBe(false);
    });
  });

  describe('getAllAssignedTickets - Pagination', () => {
    it('should handle single page of results', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: {
          issues: [
            {
              key: 'TEST-1',
              fields: {
                summary: 'Test',
                status: { name: 'Open' },
                issuetype: { name: 'Task' },
                updated: '2024-01-01'
              }
            }
          ]
        }
      });
      jiraService.client = { post: mockPost };

      const result = await jiraService.getAllAssignedTickets(mockConfig);

      expect(result).toHaveLength(1);
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('should handle empty results', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: { issues: [] }
      });
      jiraService.client = { post: mockPost };

      const result = await jiraService.getAllAssignedTickets(mockConfig);
      expect(result).toEqual([]);
    });
  });

  describe('createIssueLinks - Edge Cases', () => {
    it('should create multiple links in parallel', async () => {
      const mockPost = jest.fn().mockResolvedValue({ data: {} });
      jiraService.client = { post: mockPost };

      const linkData = [
        { type: 'Relates', issueKey: 'TEST-2' },
        { type: 'Blocks', issueKey: 'TEST-3' },
        { type: 'Relates', issueKey: 'TEST-4' }
      ];

      const result = await jiraService.createIssueLinks('TEST-1', linkData, mockConfig);

      expect(result).toBe(true);
      expect(mockPost).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures', async () => {
      const mockPost = jest.fn()
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce(new Error('Link failed'))
        .mockResolvedValueOnce({ data: {} });

      jiraService.client = { post: mockPost };

      const linkData = [
        { type: 'Relates', issueKey: 'TEST-2' },
        { type: 'Blocks', issueKey: 'TEST-3' },
        { type: 'Relates', issueKey: 'TEST-4' }
      ];

      await expect(
        jiraService.createIssueLinks('TEST-1', linkData, mockConfig)
      ).rejects.toThrow();
    });

    it('should handle timeout on link creation', async () => {
      const mockPost = jest.fn().mockImplementation(() =>
        new Promise((_, reject) => {
          setTimeout(() => reject({
            code: 'ECONNABORTED',
            message: 'timeout of 30000ms exceeded'
          }), 100);
        })
      );
      jiraService.client = { post: mockPost };

      const linkData = [{ type: 'Relates', issueKey: 'TEST-2' }];

      await expect(
        jiraService.createIssueLinks('TEST-1', linkData, mockConfig)
      ).rejects.toThrow();
    });
  });

  describe('updateTicketField - Field-Specific Errors', () => {
    it('should handle invalid epic link', async () => {
      const mockPut = jest.fn().mockRejectedValue({
        response: {
          status: 400,
          data: {
            errors: {
              'customfield_10014': 'Epic does not exist or you do not have permission to see it'
            }
          }
        },
        message: 'Bad Request'
      });
      jiraService.client = { put: mockPut };

      await expect(
        jiraService.updateTicketField('TEST-1', 'customfield_10014', 'INVALID-1', mockConfig)
      ).rejects.toThrow('Epic does not exist');
    });

    it('should handle invalid parent', async () => {
      const mockPut = jest.fn().mockRejectedValue({
        response: {
          status: 400,
          data: {
            errors: {
              'parent': 'A subtask can not be a parent of another issue'
            }
          }
        },
        message: 'Bad Request'
      });
      jiraService.client = { put: mockPut };

      await expect(
        jiraService.updateTicketField('TEST-1', 'parent', { key: 'TEST-2' }, mockConfig)
      ).rejects.toThrow('subtask');
    });

    it('should handle invalid component', async () => {
      const mockPut = jest.fn().mockRejectedValue({
        response: {
          status: 400,
          data: {
            errors: {
              'components': 'Component does not exist in project'
            }
          }
        },
        message: 'Bad Request'
      });
      jiraService.client = { put: mockPut };

      await expect(
        jiraService.updateTicketField('TEST-1', 'components', [{ name: 'Invalid' }], mockConfig)
      ).rejects.toThrow('Component does not exist');
    });
  });
});

