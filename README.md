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
   - Multi-select from components defined in your Jira project
   - Automatically fetched from Jira API
   - Falls back to default list if API call fails
   - Arrow key navigation with spacebar to select

5. **Priority** (default: Medium)
   - Lowest, Low, Medium, High, Highest, Blocker
   - Uses arrow key selection

6. **Ticket Classification** (default: Feature/Enhancement)
   - Bug, Feature/Enhancement, Operations, R&D, Risk, Tech Debt
   - Uses arrow key selection

7. **Software Capitalization Project**
   - Interactive selection from a predefined list in your configuration
   - Type to filter, arrow keys to navigate
   - Option to add new projects that get saved to your configuration
   - Projects are managed locally in your `.jirarc` file

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
    "softwareCapitalizationProjects": [
      "Lonely Planet Website",
      "Mobile App - iOS",
      "Mobile App - Android",
      "Backend Services",
      "Data Platform"
    ]
  },
  "customFields": {
    "softwareCapitalizationProject": "customfield_10001",
    "ticketClassification": "customfield_10002"
  },
  "ui": {
    "pageSize": 10
  }
}
```

## Command Line Options

```bash
./bin/jira-ticket.js --dry-run        # Preview ticket creation without creating
./bin/jira-ticket.js --dryrun         # Alias for --dry-run
./bin/jira-ticket.js --test-connection # Test Jira API connection
./bin/jira-ticket.js --list-fields    # List all Jira custom fields with IDs
./bin/jira-ticket.js --field-options <fieldId>  # Show options for a specific custom field
./bin/jira-ticket.js --help           # Show help information
```

## Managing Software Capitalization Projects

Software capitalization projects are managed through your `.jirarc` configuration file as a list. You can:

### View Current Projects
Your projects are listed in the `defaults.softwareCapitalizationProjects` array in `.jirarc`.

### Add Projects Interactively
When prompted to select a software capitalization project:
1. Type to filter existing projects OR
2. Select "+ Add new software capitalization project..."
3. Enter the new project name
4. The new project is automatically added to your `.jirarc` file

### Add Projects Manually
Edit your `.jirarc` file directly:
```json
{
  "defaults": {
    "softwareCapitalizationProjects": [
      "Lonely Planet Website",
      "Mobile App - iOS",
      "Mobile App - Android",
      "Backend Services",
      "Your New Project Name"
    ]
  }
}
```

## Finding Custom Field IDs

If you need to find custom field IDs for configuration:

```bash
# List all custom fields in your Jira instance
./bin/jira-ticket.js --list-fields

# Get options for a specific field (if it's a select field)
./bin/jira-ticket.js --field-options customfield_10001
```

The `--list-fields` command will show you:
- Field ID (e.g., `customfield_10238`)
- Field name (e.g., "Ticket Classification")
- Field type and other metadata

### Usage

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
  "softwareCapitalizationProject": "Backend Services"
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
### Custom Fields
To map the "Ticket Classification" and "Software Capitalization Project" to your Jira custom fields, you can either:

#### Option 1: Automatic Detection
The CLI will automatically try to find custom fields with names containing:
- "software", "capitalization", "capitalize" for Software Capitalization Project
- The field options will be automatically fetched

#### Option 2: Manual Configuration
Add the custom field IDs to your `.jirarc` file:
```json
{
  "customFields": {
    "softwareCapitalizationProject": "customfield_10001",
    "ticketClassification": "customfield_10002"
  }
}
```

To find your custom field IDs:
1. Go to Jira Settings → Issues → Custom fields
2. Find your fields and note their IDs (usually like `customfield_10001`)
3. Or use the test connection to see what fields are found automatically

#### Option 3: Code Update
Update the `buildCreateTicketPayload` method in `src/jira-service.js`:
```javascript
// Add these lines in buildCreateTicketPayload method
payload.fields.customfield_10001 = ticketData.ticketClassification;
payload.fields.customfield_10002 = ticketData.softwareCapitalizationProject;
```
```

### Components
Components are now automatically fetched from your Jira project using the `/rest/api/3/project/{projectKey}/components` endpoint. If the API call fails (due to permissions or network issues), the CLI will fall back to a default list of common components.

The components are sorted alphabetically for easier selection.

### UI Configuration
The `ui.pageSize` setting in `.jirarc` controls how many items are displayed in selection menus:
- **Default**: 10 items
- **Range**: 1-50 items (recommended: 5-15)
- **Behavior**: If more items exist than the pageSize, you'll need to scroll to see them

Example configurations:
```json
"ui": {
  "pageSize": 5    // Show 5 items, scroll for more
}
```
```json
"ui": {
  "pageSize": 15   // Show 15 items at once
}
```

## Troubleshooting

See [SETUP.md](SETUP.md) for detailed setup instructions and troubleshooting guide.

## License

MIT
