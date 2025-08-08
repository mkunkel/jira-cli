# Jira Ticket CLI

A command-line interface for creating Jira tickets with interactive prompts that follows the exact specifications provided.

## Features

✅ **All Required Features Implemented:**
- Interactive prompts for all ticket fields in the specified order
- Menu-based selection using arrow keys for known options
- Configuration file support (`.jirarc`)
- Dry run mode (`--dry-run` and `--dryrun`)
- Multi-line description support
- Component selection (multiple)
- Custom field mapping for ticket classification and software capitalization
- Direct link to created ticket in output
- Connection testing

## Quick Start

```bash
# Install dependencies
npm install

# Make executable
chmod +x bin/jira-ticket.js

# Test the CLI
./bin/jira-ticket.js --help

# Test connection (after setup)
./bin/jira-ticket.js --test-connection

# Create a ticket (dry run)
./bin/jira-ticket.js --dry-run
```

## Prompt Order (As Specified)

The CLI prompts for information in this exact order:

1. **Work type** (default: Task)
   - Task, Bug, Epic, Incident, Story, Initiative, Deployment Task, Feature
   - Uses arrow key selection

2. **Summary**
   - Free text input for ticket title

3. **Description**
   - Multi-line text input (opens default editor)

4. **Components**
   - Multi-select from predefined components
   - Arrow key navigation with spacebar to select

5. **Priority** (default: Medium)
   - Lowest, Low, Medium, High, Highest, Blocker
   - Uses arrow key selection

6. **Ticket Classification** (default: Feature/Enhancement)
   - Bug, Feature/Enhancement, Operations, R&D, Risk, Tech Debt
   - Uses arrow key selection

7. **Software Capitalization Project** (default: "Lonely Planet Website")
   - Free text input

## Configuration

### Configuration File (`.jirarc`)

The CLI looks for configuration in this order:
1. Current working directory
2. User's home directory
3. CLI installation directory

```json
{
  "projectKey": "YOUR_PROJECT_KEY",
  "jiraUrl": "https://yourcompany.atlassian.net",
  "auth": {
    "email": "your.email@company.com",
    "apiToken": "your_api_token"
  },
  "defaults": {
    "workType": "Task",
    "priority": "Medium",
    "ticketClassification": "Feature/Enhancement",
    "softwareCapitalizationProject": "Lonely Planet Website"
  }
}
```

## Usage

### Standard Usage
```bash
./bin/jira-ticket.js
```

### Dry Run Mode
Preview what would be executed without creating a ticket:
```bash
./bin/jira-ticket.js --dry-run
# or
./bin/jira-ticket.js --dryrun
```

### Test Connection
```bash
./bin/jira-ticket.js --test-connection
```

### Help
```bash
./bin/jira-ticket.js --help
```

## Output Example

After successful ticket creation:
```
✅ Ticket Created:
Key: DEMO-123
ID: 10001
Link: https://yourcompany.atlassian.net/browse/DEMO-123
```

## Dry Run Example

```bash
🔍 DRY RUN MODE - No ticket will be created

Ticket Data:
{
  "workType": "Bug",
  "summary": "Login issue",
  "description": "Users cannot log in",
  "components": ["Frontend", "Backend"],
  "priority": "High",
  "ticketClassification": "Bug",
  "softwareCapitalizationProject": "Lonely Planet Website"
}

Jira API Call that would be made:
POST https://yourcompany.atlassian.net/rest/api/3/issue
Headers:
  Authorization: Basic [REDACTED]
  Content-Type: application/json
Payload:
{
  "fields": {
    "project": { "key": "DEMO" },
    "summary": "Login issue",
    "description": { ... },
    "issuetype": { "name": "Bug" },
    "priority": { "name": "High" },
    "components": [
      { "name": "Frontend" },
      { "name": "Backend" }
    ]
  }
}
```

## Installation Options

### Local Installation
```bash
npm install
chmod +x bin/jira-ticket.js
```

### Global Installation
```bash
npm link
jira-ticket --help
```

## Dependencies

- `inquirer` (v8.x) - Interactive command line prompts
- `axios` - HTTP client for Jira API
- `commander` - Command line parsing
- `chalk` - Terminal styling
- `ora` - Terminal spinners
- `fs-extra` - Enhanced file system methods

## API Integration

The CLI uses the Jira REST API v3 and supports:
- Basic authentication with email + API token
- Issue creation with all standard fields
- Custom field mapping (requires configuration)
- Error handling with detailed messages

## Customization

### Custom Fields
To map the "Ticket Classification" and "Software Capitalization Project" to your Jira custom fields, update `src/jira-service.js`:

```javascript
// Find your custom field IDs in Jira admin
payload.fields.customfield_10001 = ticketData.ticketClassification;
payload.fields.customfield_10002 = ticketData.softwareCapitalizationProject;
```

### Components
Update the components list in `src/jira-cli.js` to match your project's components.

## Troubleshooting

See [SETUP.md](SETUP.md) for detailed setup instructions and troubleshooting guide.

## License

MIT
