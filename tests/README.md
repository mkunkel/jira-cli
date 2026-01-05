# Test Suite

Comprehensive test suite for the Jira Ticket CLI using Jest.

## Running Tests

```bash
# Run all tests
npm test

# Watch mode (auto-rerun on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Test Files

### `tests/jira-service.test.js`
Tests for the Jira API service layer:
- ✅ Client initialization
- ✅ Ticket creation with validation
- ✅ Issue linking (new feature)
- ✅ Field updates with timeouts
- ✅ Component & assignee fetching
- ✅ Status transitions
- ✅ Error handling (401, 403, 400, timeout)

### `tests/jira-cli.test.js`
Tests for the CLI interface layer:
- ✅ Ticket key normalization
- ✅ Field value extraction (issuelinks, parent, epic link)
- ✅ Field formatting for display
- ✅ Component organization (recent vs other)
- ✅ Ticket combining and filtering
- ✅ Component usage tracking
- ✅ Old ticket cleanup
- ✅ ADF text extraction

### `tests/integration.test.js`
Integration tests for new linking features:
- ✅ Issue filtering by type (Epics)
- ✅ Batch link creation
- ✅ Timeout handling
- ✅ ADF content creation from markdown
- ✅ Markdown link conversion
- ✅ Ticket reference linking
- ✅ HTTP error responses

## Key Testing Patterns

### Mocking Axios
```javascript
jest.mock('axios');
const mockPost = jest.fn().mockResolvedValue({ data: {} });
jiraService.client = { post: mockPost };
```

### Testing Error Handling
```javascript
mockPost.mockRejectedValue({
  response: { status: 400, data: { errors: {...} } },
  message: 'Bad Request'
});
```

### Testing Async Methods
```javascript
await expect(
  jiraService.updateTicketField('TEST-1', 'summary', '', config)
).rejects.toThrow('Summary cannot be empty');
```

## Coverage Goals

Current coverage focuses on:
- ✅ Core API interactions (ticket CRUD)
- ✅ New issue linking functionality
- ✅ Error handling paths
- ✅ Data transformation logic

Future improvements:
- [ ] Interactive prompt testing (inquirer)
- [ ] File I/O operations (fs-extra)
- [ ] CLI command integration tests
- [ ] End-to-end workflow tests

## Continuous Integration

Tests are designed to:
- Run without external dependencies (Jira API)
- Execute quickly (< 7 seconds)
- Be deterministic and repeatable
- Catch regressions in core functionality

