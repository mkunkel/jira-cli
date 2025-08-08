# Setup Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Make CLI executable:**
   ```bash
   chmod +x bin/jira-ticket.js
   ```

3. **Test the CLI:**
   ```bash
   ./bin/jira-ticket.js --help
   ```

## Configuration Setup

### Method 1: Interactive Setup
Run the CLI for the first time and it will guide you through creating a configuration file:
```bash
./bin/jira-ticket.js
```

### Method 2: Manual Configuration
Create a `.jirarc` file in your home directory or project root:

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

### Getting Your Jira API Token

1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a label (e.g., "Jira CLI")
4. Copy the generated token
5. Use this token in your configuration file

## Testing Your Setup

### Test Connection
```bash
./bin/jira-ticket.js --test-connection
```

### Test Dry Run
```bash
./bin/jira-ticket.js --dry-run
```

This will walk you through all the prompts and show you exactly what API call would be made without actually creating a ticket.

## Usage Examples

### Create a Bug Ticket
```bash
./bin/jira-ticket.js
```
Then select:
- Work type: Bug
- Summary: "Login button not working"
- Description: "Users report clicking login button does nothing"
- Components: Frontend
- Priority: High
- Classification: Bug

### Create a Feature Request
```bash
./bin/jira-ticket.js
```
Then select:
- Work type: Feature
- Summary: "Add dark mode support"
- Description: "Users want ability to switch to dark theme"
- Components: Frontend, Backend
- Priority: Medium
- Classification: Feature/Enhancement

## Global Installation (Optional)

To use the CLI from anywhere:
```bash
npm link
```

Then you can run:
```bash
jira-ticket --help
```

## Troubleshooting

### Common Issues

1. **Permission denied when running CLI:**
   ```bash
   chmod +x bin/jira-ticket.js
   ```

2. **Authentication errors:**
   - Verify your email and API token are correct
   - Test connection: `./bin/jira-ticket.js --test-connection`

3. **Project not found:**
   - Verify your project key is correct
   - Make sure you have permission to create tickets in that project

4. **Custom fields not working:**
   - The CLI includes placeholders for custom fields
   - You'll need to find your specific field IDs in Jira and update `src/jira-service.js`

### Getting Custom Field IDs

To find custom field IDs for your Jira instance:
1. Go to Jira Settings → Issues → Custom fields
2. Find your fields and note their IDs (usually like `customfield_10001`)
3. Update the `buildCreateTicketPayload` method in `src/jira-service.js`

Example:
```javascript
// Add these lines in buildCreateTicketPayload method
payload.fields.customfield_10001 = ticketData.ticketClassification;
payload.fields.customfield_10002 = ticketData.softwareCapitalizationProject;
```
