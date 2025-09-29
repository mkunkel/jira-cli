# Jira Ticket CLI

A command-line interface for creating Jira tickets with interactive prompts that follows the exact specifications provided.

## Features

✅ **All Required Features Implemented:**
- Interactive prompts for all ticket fields in the specified order
- Menu-based selection using arrow keys for known options
- Configuration file support (`.jirarc`)
- Preview mode with optional submit (`--dry-run` and `--dryrun`)
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

# Preview and optionally create a ticket
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
    "pageSize": 10,
    "listPageSize": 25
  },
  "api": {
    "assigneePageSize": 1000
  },
  "componentTracking": {
    "recentDays": 30,
    "enabled": true
  },
  "componentUsage": {},
  "statusTracking": {
    "recentDays": 30,
    "enabled": true
  },
  "statusUsage": {},
  "assigneeTracking": {
    "recentDays": 30,
    "enabled": true
  },
  "assigneeUsage": {},
  "ticketTracking": {
    "enabled": true,
    "trackingDays": 90,
    "doneStatusTrackingDays": 14,
    "allowedStatuses": ["To Do", "In Progress", "In Review", "Ready for Testing", "Done"]
  },
  "trackedTickets": {}
}
```

## Command Line Options

```bash
./bin/jira-ticket.js --dry-run        # Preview ticket details and optionally create
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

### Create Tickets (Default Command)
```bash
./bin/jira-ticket.js         # Create a new ticket
jira create                  # If globally installed
```

### Manage Existing Tickets
```bash
./bin/jira-ticket.js move [TICKET-KEY]    # Transition tickets or manage tracking
jira move                                 # Show interactive ticket selection
jira move PROJ-123                       # Direct transition for specific ticket
jira move 123                            # Direct transition (uses your project key)
```

The `move` command provides:
- **Smart Ticket Selection**: Shows both locally tracked tickets and tickets assigned to you
- **Status Transitions**: Change ticket status using configurable allowed statuses
- **Local Tracking Management**: Remove tickets from local tracking
- **Sorting**: Tickets are sorted by status priority (configurable), then by ticket number

### List All Tickets
```bash
./bin/jira-ticket.js list               # List all user tickets grouped by status
jira list                               # If globally installed
```

The `list` command provides:
- **Comprehensive View**: Shows both CLI tracked tickets and all Jira assigned tickets
- **Status Grouping**: Groups tickets by their current status with counts
- **Smart Ordering**: Status groups ordered by your `allowedStatuses` configuration
- **Smart Filtering**: Automatically excludes done tickets older than `doneStatusTrackingDays`
- **Scrollable Interface**: Navigate with arrow keys, no wrap-around navigation
- **Interactive Selection**: Click any ticket to view Jira link and optionally manage it
- **Configurable Size**: Set `ui.listPageSize` to control visible items (default: 25)
- **Visual Indicators**: Color coding for done/active statuses, source indicators
- **Summary Statistics**: Total ticket counts and legend

### Edit Ticket Fields
```bash
./bin/jira-ticket.js edit [TICKET-KEY]  # Edit fields of an existing ticket
jira edit                               # Show ticket selection menu
jira edit PROJ-123                     # Direct edit for specific ticket
jira edit 123                          # Direct edit (uses your project key)
```

The `edit` command provides:
- **Smart Field Ordering**: CLI creation fields shown first (Work Type, Summary, Description, etc.), then alphabetical
- **Current Value Display**: Shows existing field values before editing
- **Type-Aware Editing**: Different input methods for strings, options, arrays, users
- **Field Filtering**: Automatically excludes non-updatable fields (e.g., Software Capitalization Project)
- **Back-Out Option**: Cancel field edits without updating
- **Immediate Updates**: Ticket updated after each successful field change
- **Continuous Editing**: Return to field list after each edit for multiple changes
- **No Wrapping Navigation**: Clean scrolling through field lists
- **Visual Feedback**: Clear success/failure messages and Jira links

### Show Ticket Details
```bash
./bin/jira-ticket.js show TICKET-KEY   # Display comprehensive ticket information
jira show PROJ-123                     # If globally installed
jira show 123                          # Using just number (uses your project key)
```

> **💡 Tip**: For commands that take ticket keys (`move`, `edit`, `show`), you can use just the ticket number (e.g., `123`) instead of the full key (e.g., `PROJ-123`). The CLI will automatically prepend your configured project key.

The `show` command provides:
- **Comprehensive Display**: Shows all populated ticket fields in organized sections
- **Smart Formatting**: Color-coded priorities, relative timestamps, proper field formatting
- **Clean Layout**: Core fields first (Status, Work Type, Priority, etc.), then custom fields
- **Intelligent Filtering**: Automatically hides empty fields, complex objects, and system metadata
- **Rich Text Support**: Converts ADF descriptions to readable text with proper wrapping
- **Date Recognition**: Automatically formats date/time fields with relative timestamps
- **Object Handling**: Extracts meaningful values from complex objects, skips problematic fields
- **Direct Link**: Includes clickable Jira URL for quick browser access
- **Custom Field Support**: Shows all meaningful custom fields with proper names and values

### Preview Mode with Optional Submit
Preview the ticket details, API calls, and configuration changes, then optionally create the ticket:
```bash
./bin/jira-ticket.js --dry-run
# or
./bin/jira-ticket.js --dryrun
```

**New Interactive Flow:**
1. **Collect all ticket data** (same as normal mode)
2. **Show complete preview** including:
   - Ticket summary with all fields
   - Jira API calls that would be made
   - Configuration changes to `.jirarc`
3. **Prompt for confirmation**: `Would you like to create this ticket? (y/N)`
   - **Yes**: Creates the ticket immediately
   - **No**: Exits without creating anything

This gives you the safety of a preview with the convenience of one-step creation.

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

### Ticket Tracking and Management

The CLI automatically tracks tickets you create and provides tools to manage them:

#### Local Ticket Tracking
- **Auto-tracking**: All tickets created through the CLI are automatically tracked locally
- **Configurable duration**: Set `ticketTracking.trackingDays` (default: 90 days)
- **Done status tracking**: Separate duration for completed tickets via `doneStatusTrackingDays` (default: 14 days)
- **Auto-cleanup**: Old tickets are automatically removed based on configured timeframes
- **List filtering**: The `jira list` command automatically excludes done tickets older than `doneStatusTrackingDays`

#### Status Management
- **Allowed Statuses**: Configure `allowedStatuses` to limit transition options and control ticket sorting
- **Smart Sorting**: Tickets with allowed statuses appear first, sorted by status priority, then ticket number
- **Fallback Sorting**: Tickets with non-allowed statuses appear below, sorted alphabetically
- **Filtering**: Only allowed status transitions are shown in the move command

#### Configuration
```json
{
  "ticketTracking": {
    "enabled": true,
    "trackingDays": 90,
    "doneStatusTrackingDays": 14,
    "allowedStatuses": ["To Do", "In Progress", "In Review", "Ready for Testing", "Done"]
  }
}
```

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
The `ui` settings in `.jirarc` control how many items are displayed in different interface contexts:

#### Selection Menus (`pageSize`)
- **Purpose**: Controls items shown in interactive selection menus (components, statuses, etc.)
- **Default**: 10 items
- **Range**: 1-50 items (recommended: 5-15)
- **Behavior**: If more items exist than the pageSize, you'll need to scroll to see them
- **Tip**: Use a smaller pageSize (5-7) to reduce wrap-around effect in component selection

#### Ticket List View (`listPageSize`)
- **Purpose**: Controls how many items are visible when browsing with `jira list`
- **Default**: 25 items
- **Range**: 10-100 items (recommended: 20-50)
- **Behavior**: Larger values show more tickets at once, smaller values require more scrolling
- **No wrap**: List navigation stops at top/bottom (no wrap-around)

Example configurations:
```json
"ui": {
  "pageSize": 5,      // Show 5 items in selection menus
  "listPageSize": 30  // Show 30 items in ticket list view
}

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
