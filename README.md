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
- Custom field mapping for ticket classification
- Component usage tracking (recently used components appear first)
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

## Global Installation

To make this CLI available globally as the `jira` command:

### Option 1: Using npm link (Recommended)
```bash
# From the project directory
npm link

# Now you can use 'jira' from anywhere
jira --help
jira --dry-run
```

**Note**: The `package.json` bin field is configured to create the `jira` command.

### Option 2: Manual symlink
```bash
# Create a symlink in your PATH (adjust paths as needed)
sudo ln -s /path/to/this/project/bin/jira-ticket.js /usr/local/bin/jira

# Make sure it's executable
chmod +x /usr/local/bin/jira

# Now you can use 'jira' from anywhere
jira --help
```

### Option 3: Add to PATH
```bash
# Add the bin directory to your PATH in ~/.bashrc or ~/.zshrc
export PATH="$PATH:/path/to/this/project/bin"

# Reload your shell or source the file
source ~/.bashrc

# Create an alias for the shorter command name
alias jira='/path/to/this/project/bin/jira-ticket.js'
```

**Note**: After global installation, you can use `jira` instead of `./bin/jira-ticket.js` from any directory.

## Prompt Order (As Specified)

The CLI prompts for information in this exact order:

1. **Work type** (default: Task)
   - Configurable list via `workTypes` in `.jirarc`
   - Default options: Task, Bug, Epic, Incident, Story, Initiative, Deployment Task, Feature
   - Uses arrow key selection

2. **Summary**
   - Free text input for ticket title

3. **Description**
   - Multi-line text input (opens default editor)

4. **Components**
   - Multi-select from components defined in your Jira project
   - Automatically fetched from Jira API at startup
   - Type to filter components by name
   - Recently used components (within 30 days) appear at the top
   - Usage tracking automatically updates after ticket creation
   - Note: Arrow key navigation may wrap around in long lists

5. **Priority** (default: Medium)
   - Lowest, Low, Medium, High, Highest, Blocker
   - Uses arrow key selection

6. **Ticket Classification** (default: Feature/Enhancement)
   - Bug, Feature/Enhancement, Operations, R&D, Risk, Tech Debt
   - Uses arrow key selection

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
    "ticketClassification": "Feature/Enhancement"
  },
  "workTypes": [
    "Task",
    "Bug",
    "Epic",
    "Incident",
    "Story",
    "Initiative",
    "Deployment Task",
    "Feature"
  ],
  "customFields": {
    "ticketClassification": "customfield_10002",
    "ticketClassificationFormat": "value"
  },
  "editor": {
    "command": null
  },
  "ui": {
    "pageSize": 10
  },
  "api": {
    "assigneePageSize": 1000
  },
  "componentTracking": {
    "recentDays": 30,
    "enabled": true
  },
  "componentUsage": {}
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

📝 Manual Step Required:
Please manually update the "Software Capitalization Project" field in the Jira UI.
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
  "ticketClassification": "Bug"
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

📝 Manual Step Required:
Please manually update the "Software Capitalization Project" field in the Jira UI.
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
To map the "Ticket Classification" to your Jira custom fields, you can either:

#### Option 1: Manual Configuration
Add the custom field IDs to your `.jirarc` file:
```json
{
  "customFields": {
    "ticketClassification": "customfield_10002"
  }
}
```

To find your custom field IDs:
1. Use `./bin/jira-ticket.js --list-fields` to see all available fields
2. Use `./bin/jira-ticket.js --field-options <fieldId>` to see field options
3. Or go to Jira Settings → Issues → Custom fields

#### Custom Field Formats
Different Jira custom fields may require different value formats. If you get API errors, try different formats:

```json
"customFields": {
  "ticketClassification": "customfield_10002",
  "ticketClassificationFormat": "value"    // Default: { "value": "Bug" }
}
```

Available formats:
- `"value"` (default): `{ "value": "Bug" }` - Most common for select fields
- `"string"`: `"Bug"` - Simple string value for text fields
- `"id"`: `{ "id": "12345" }` - For fields that expect option IDs
- `"name"`: `{ "name": "Bug" }` - Alternative for select fields

### Components
Components are automatically fetched from your Jira project using the `/rest/api/3/project/{projectKey}/components` endpoint. The CLI validates project access at startup and will exit with an error if components cannot be fetched.

#### Component Usage Tracking
The CLI tracks which components you use and when:
- **Recently Used**: Components used within the configurable timeframe (default: 30 days) appear at the top
- **Alphabetical Sorting**: Recently used and other components are sorted alphabetically within each group
- **Visual Layout**: Recently used components appear first, followed by "--- Other Components ---" separator
- **Automatic Cleanup**: Removes non-existent components and old usage data automatically
- **Configurable**: Set `componentTracking.recentDays` to change the recent timeframe
- **Persistent Storage**: Usage data is stored in your `.jirarc` file after successful ticket creation
- **Privacy**: Usage tracking is local only - no data is sent to external services

Example component selection layout:
```
--- Finish selecting components ---
API                    (recently used)
Frontend              (recently used)
--- Other Components ---
Backend
Database
Infrastructure
```

### UI Configuration
The `ui.pageSize` setting in `.jirarc` controls how many items are displayed in selection menus:
- **Default**: 10 items
- **Range**: 1-50 items (recommended: 5-15)
- **Behavior**: If more items exist than the pageSize, you'll need to scroll to see them
- **Tip**: Use a smaller pageSize (5-7) to reduce wrap-around effect in component selection

Example configurations:
```json
"ui": {
  "pageSize": 5    // Show 5 items, reduces wrap-around effect
}
```
```json
"ui": {
  "pageSize": 15   // Show 15 items at once
}
```

### API Configuration
The `api` section in `.jirarc` controls API performance settings:

#### Assignee Page Size
The `api.assigneePageSize` setting controls how many assignees are fetched per API call:
- **Default**: 1000 users per request (increased from 100)
- **Range**: 1-1000 (Jira API limit)
- **Benefit**: Larger page sizes reduce the number of API calls for organizations with many users
- **Performance**: For organizations with 5000+ users, this reduces API calls from 50+ to 5+

```json
"api": {
  "assigneePageSize": 1000   // Fetch 1000 users per API call
}
```

For smaller organizations (< 500 users), you might prefer a smaller page size:
```json
"api": {
  "assigneePageSize": 500    // Fetch 500 users per API call
}
```

### Editor Configuration
The `editor.command` setting controls which editor opens for ticket descriptions:
- **Default**: Uses `$EDITOR` environment variable when `command` is `null`
- **Behavior**: Opens when you reach the description step (step 3)
- **Format**: Command that waits for file completion (e.g., "code --wait", "vim")
- **If not configured**: Automatically uses `$EDITOR` or system default editor

Example configurations:
```json
"editor": {
  "command": "code --wait"    // VS Code (waits for file to close)
}
```
```json
"editor": {
  "command": "vim"           // Vim editor
}
```
```json
"editor": {
  "command": null            // Use $EDITOR or system default
}
```

### Work Type Configuration
The `workTypes` setting controls which issue types are available in the work type selection:
- **Default**: Standard Jira issue types (Task, Bug, Epic, etc.)
- **Customizable**: Add or remove options to match your Jira project setup
- **Validation**: The `defaults.workType` must be one of the options in `workTypes`

Example configurations:
```json
"workTypes": [
  "Task",
  "Bug",
  "Story",
  "Epic"
]
```
```json
"workTypes": [
  "Feature Request",
  "Bug Report",
  "Technical Debt",
  "Documentation"
]
```

### Component Tracking Configuration
The `componentTracking` setting controls component usage tracking behavior:
- **enabled**: Enable/disable usage tracking (default: `true`)
- **recentDays**: How many days to consider "recently used" (default: `30`)

Example configurations:
```json
"componentTracking": {
  "enabled": true,
  "recentDays": 14    // Show components used in last 2 weeks
}
```
```json
"componentTracking": {
  "enabled": false     // Disable usage tracking entirely
}
```

## Troubleshooting

See [SETUP.md](SETUP.md) for detailed setup instructions and troubleshooting guide.

## License

MIT
