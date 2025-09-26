const axios = require('axios');
const chalk = require('chalk');

class JiraService {
  constructor() {
    this.client = null;
  }

  initializeClient(config) {
    const auth = Buffer.from(`${config.auth.email}:${config.auth.apiToken}`).toString('base64');

    this.client = axios.create({
      baseURL: config.jiraUrl,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  // Helper function to parse markdown and create ADF content with links
  createDescriptionContent(description, config) {
    if (!description) {
      return [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: ""
            }
          ]
        }
      ];
    }

    // Split description into paragraphs (double newlines)
    const paragraphs = description.split(/\n\s*\n/).filter(p => p.trim());

    return paragraphs.map(paragraph => this.parseParagraph(paragraph.trim(), config));
  }

  // Parse a single paragraph with markdown and links
  parseParagraph(text, config) {
    // Create an array to store all matches with their positions and types
    const matches = [];

    // Find markdown patterns
    this.findMarkdownMatches(text, matches);

    // Find URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      // Check if this URL is not inside a markdown link
      if (!this.isInsideMarkdownLink(text, match.index)) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
          type: 'url',
          href: match[0]
        });
      }
    }

    // Find Jira ticket references
    const projectKey = config?.projectKey || '';
    if (projectKey) {
      const jiraTicketRegex = new RegExp(`\\b(${projectKey}-\\d+)\\b`, 'g');
      while ((match = jiraTicketRegex.exec(text)) !== null) {
        // Check if this ticket ref is not inside a markdown link
        if (!this.isInsideMarkdownLink(text, match.index)) {
          const ticketKey = match[0];
          const jiraUrl = `https://${config.jiraUrl.replace(/^https?:\/\//, '')}/browse/${ticketKey}`;
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: ticketKey,
            type: 'jira',
            href: jiraUrl
          });
        }
      }
    }

    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);

    // Build the content parts
    const parts = [];
    let lastIndex = 0;

    matches.forEach(match => {
      // Add text before the match
      if (match.start > lastIndex) {
        const beforeText = text.substring(lastIndex, match.start);
        this.addTextWithBasicMarkdown(beforeText, parts);
      }

      // Add the match based on its type
      if (match.type === 'bold') {
        this.addTextWithBasicMarkdown(match.innerText, parts, ['strong']);
      } else if (match.type === 'italic') {
        this.addTextWithBasicMarkdown(match.innerText, parts, ['em']);
      } else if (match.type === 'code') {
        parts.push({
          type: "text",
          text: match.innerText,
          marks: [{ type: "code" }]
        });
      } else if (match.type === 'link') {
        parts.push({
          type: "text",
          text: match.linkText,
          marks: [
            {
              type: "link",
              attrs: {
                href: match.href
              }
            }
          ]
        });
      } else if (match.type === 'url' || match.type === 'jira') {
        parts.push({
          type: "text",
          text: match.text,
          marks: [
            {
              type: "link",
              attrs: {
                href: match.href
              }
            }
          ]
        });
      }

      lastIndex = match.end;
    });

    // Add remaining text after the last match
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      this.addTextWithBasicMarkdown(remainingText, parts);
    }

    // If no matches found, parse the entire text for basic markdown
    if (parts.length === 0) {
      this.addTextWithBasicMarkdown(text, parts);
    }

    return {
      type: "paragraph",
      content: parts.length > 0 ? parts : [{ type: "text", text: text }]
    };
  }

  // Find markdown patterns in text
  findMarkdownMatches(text, matches) {
    // Bold text: **text** or __text__
    const boldRegex = /(\*\*|__)(.*?)\1/g;
    let match;
    while ((match = boldRegex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type: 'bold',
        innerText: match[2]
      });
    }

    // Italic text: *text* or _text_ (but not if it's part of bold)
    const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)/g;
    while ((match = italicRegex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type: 'italic',
        innerText: match[1] || match[2]
      });
    }

    // Inline code: `text`
    const codeRegex = /`([^`]+)`/g;
    while ((match = codeRegex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type: 'code',
        innerText: match[1]
      });
    }

    // Markdown links: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    while ((match = linkRegex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type: 'link',
        linkText: match[1],
        href: match[2]
      });
    }
  }

  // Check if a position is inside a markdown link
  isInsideMarkdownLink(text, position) {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      if (position >= match.index && position < match.index + match[0].length) {
        return true;
      }
    }
    return false;
  }

  // Add text with basic markdown parsing (for text segments between other matches)
  addTextWithBasicMarkdown(text, parts, existingMarks = []) {
    if (!text) return;

    // For simplicity in nested parsing, just add as plain text if we already have marks
    if (existingMarks.length > 0) {
      parts.push({
        type: "text",
        text: text,
        marks: existingMarks.map(mark => ({ type: mark }))
      });
      return;
    }

    // Split by any remaining markdown that wasn't caught in main parsing
    const segments = text.split(/(\*\*.*?\*\*|__.*?__|`.*?`)/);

    segments.forEach(segment => {
      if (!segment) return;

      if (segment.startsWith('**') && segment.endsWith('**')) {
        parts.push({
          type: "text",
          text: segment.slice(2, -2),
          marks: [{ type: "strong" }]
        });
      } else if (segment.startsWith('__') && segment.endsWith('__')) {
        parts.push({
          type: "text",
          text: segment.slice(2, -2),
          marks: [{ type: "strong" }]
        });
      } else if (segment.startsWith('`') && segment.endsWith('`')) {
        parts.push({
          type: "text",
          text: segment.slice(1, -1),
          marks: [{ type: "code" }]
        });
      } else {
        parts.push({
          type: "text",
          text: segment
        });
      }
    });
  }

  buildCreateTicketPayload(ticketData, config) {
    // Remove dry run simulation fields
    const { availableComponents, availableStatuses, availableAssignees, currentUser, ...cleanTicketData } = ticketData;
    const payload = {
      fields: {
        project: {
          key: config.projectKey
        },
        summary: cleanTicketData.summary,
        description: {
          type: "doc",
          version: 1,
          content: this.createDescriptionContent(cleanTicketData.description, config)
        },
        issuetype: {
          name: cleanTicketData.workType
        },
        priority: {
          name: cleanTicketData.priority
        }
      }
    };

    // Add components if selected
    if (cleanTicketData.components && cleanTicketData.components.length > 0) {
      payload.fields.components = cleanTicketData.components.map(component => ({
        name: component
      }));
    }

    // Add assignee if provided
    if (cleanTicketData.assignee) {
      payload.fields.assignee = {
        accountId: cleanTicketData.assignee.accountId
      };
    }

    // Add custom fields based on configuration
    if (config.customFields?.ticketClassification && cleanTicketData.ticketClassification) {
      // Jira custom select fields can expect different formats - try the most common one
      const fieldValue = cleanTicketData.ticketClassification;

      // Try different formats based on field configuration or use default
      if (config.customFields.ticketClassificationFormat === 'string') {
        payload.fields[config.customFields.ticketClassification] = fieldValue;
      } else if (config.customFields.ticketClassificationFormat === 'id') {
        payload.fields[config.customFields.ticketClassification] = { id: fieldValue };
      } else if (config.customFields.ticketClassificationFormat === 'name') {
        payload.fields[config.customFields.ticketClassification] = { name: fieldValue };
      } else {
        // Default: try 'value' format (most common for select fields)
        payload.fields[config.customFields.ticketClassification] = { value: fieldValue };
      }
    } else if (cleanTicketData.ticketClassification && !config.customFields?.ticketClassification) {
      console.log(chalk.yellow('\n⚠️  Warning: Ticket classification selected but no custom field configured.'));
      console.log(chalk.white('   To enable ticket classification, add the field ID to your .jirarc:'));
      console.log(chalk.white('   "customFields": { "ticketClassification": "customfield_XXXXX" }'));
      console.log(chalk.white('   Use --list-fields to find your field ID.\n'));
    }

    return payload;
  }

  async createTicket(ticketData, config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    const payload = this.buildCreateTicketPayload(ticketData, config);

    try {
      const response = await this.client.post('/rest/api/3/issue', payload);
      return response.data;
    } catch (error) {
      if (error.response) {
        const errorMessage = error.response.data.errors
          ? Object.values(error.response.data.errors).join(', ')
          : error.response.data.errorMessages?.join(', ') || 'Unknown API error';
        throw new Error(`Jira API Error: ${errorMessage}`);
      } else if (error.request) {
        throw new Error('Network error: Unable to reach Jira API');
      } else {
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  async transitionTicket(issueKey, targetStatusName, config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      // First, get available transitions for this specific issue
      const transitionsResponse = await this.client.get(`/rest/api/3/issue/${issueKey}/transitions`);

      // Find the transition that leads to our target status
      const targetTransition = transitionsResponse.data.transitions.find(
        transition => transition.to.name === targetStatusName
      );

      if (!targetTransition) {
        throw new Error(`No transition available to status "${targetStatusName}". Available transitions: ${transitionsResponse.data.transitions.map(t => `"${t.to.name}"`).join(', ')}`);
      }

      const payload = {
        transition: {
          id: targetTransition.id.toString()
        }
      };

      await this.client.post(`/rest/api/3/issue/${issueKey}/transitions`, payload);

    } catch (error) {
      if (error.response) {
        const errorMessage = error.response.data.errors
          ? Object.values(error.response.data.errors).join(', ')
          : error.response.data.errorMessages?.join(', ') || 'Unknown API error';
        throw new Error(`Status transition failed: ${errorMessage}`);
      } else if (error.request) {
        throw new Error('Network error: Unable to reach Jira API for status transition');
      } else {
        throw new Error(`Status transition error: ${error.message}`);
      }
    }
  }

  async testConnection(config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const response = await this.client.get('/rest/api/3/myself');
      return response.data;
    } catch (error) {
      throw new Error('Failed to connect to Jira. Please check your credentials and URL.');
    }
  }

  async getProjectComponents(config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const response = await this.client.get(`/rest/api/3/project/${config.projectKey}/components`);
      const componentNames = response.data.map(component => component.name);

      // Remove duplicates and sort
      const uniqueComponents = [...new Set(componentNames)].sort();

      return uniqueComponents;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Project '${config.projectKey}' not found. Please check your project key in .jirarc`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access denied to project '${config.projectKey}'. Please check your permissions.`);
      } else if (error.response?.status === 401) {
        throw new Error('API token is invalid or expired. Please update your token in .jirarc');
      } else {
        throw new Error(`Failed to fetch components from project '${config.projectKey}': ${error.message}`);
      }
    }
  }

  async getProjectStatuses(config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const response = await this.client.get(`/rest/api/3/project/${config.projectKey}/statuses`);

      // Extract statuses from all issue types and deduplicate
      const allStatuses = [];
      const statusMap = new Map(); // Use Map to better track duplicates

      response.data.forEach(issueType => {
        issueType.statuses.forEach(status => {
          const key = `${status.id}-${status.name}`;
          if (!statusMap.has(key)) {
            statusMap.set(key, {
              id: status.id,
              name: status.name
            });
            allStatuses.push({
              id: status.id,
              name: status.name
            });
          }
        });
      });

      return allStatuses;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Project '${config.projectKey}' not found. Please check your project key in .jirarc`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access denied to project '${config.projectKey}'. Please check your permissions`);
      } else if (error.response?.status === 401) {
        throw new Error('Invalid API token. Please check your authentication in .jirarc');
      } else {
        throw new Error(`Failed to fetch project statuses: ${error.message}`);
      }
    }
  }

  async getProjectAssignees(config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      // Get all assignable users (handle pagination)
      let allUsers = [];
      let startAt = 0;
      // Jira API supports up to 1000 results per page for most endpoints
      // Make this configurable via config if needed
      const maxResults = config.api?.assigneePageSize || 1000;

      while (true) {
        const response = await this.client.get(`/rest/api/3/user/assignable/search`, {
          params: {
            project: config.projectKey,
            maxResults: maxResults,
            startAt: startAt
          }
        });

        allUsers = allUsers.concat(response.data);

        // Show progress for large user bases
        if (startAt > 0) {
          process.stdout.write(`\r   Fetched ${allUsers.length} users (${response.data.length} in this batch)...`);
        }

        // Break if we got less than maxResults (last page)
        if (response.data.length < maxResults) {
          if (startAt > 0) {
            console.log(`\r   ✓ Fetched ${allUsers.length} total assignable users`);
          }
          break;
        }

        startAt += maxResults;

        // Safety check to prevent infinite loops (increased since we're fetching larger pages)
        if (startAt > 50000) {
          console.log(chalk.yellow(`\nWarning: Stopped fetching assignees at ${allUsers.length} users (safety limit)`));
          break;
        }
      }
            return allUsers
        .filter(user =>
          user &&
          user.accountId &&
          user.displayName &&
          user.displayName !== 'undefined' &&
          typeof user.displayName === 'string' &&
          user.displayName.trim().length > 0
        ) // Filter out invalid users
        .map(user => ({
          accountId: user.accountId,
          displayName: user.displayName.trim(),
          emailAddress: user.emailAddress || ''
        }));
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Project '${config.projectKey}' not found. Please check your project key in .jirarc`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access denied to project '${config.projectKey}'. Please check your permissions`);
      } else if (error.response?.status === 401) {
        throw new Error('Invalid API token. Please check your authentication in .jirarc');
      } else {
        throw new Error(`Failed to fetch project assignees: ${error.message}`);
      }
    }
  }

  async getCurrentUser(config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const response = await this.client.get('/rest/api/3/myself');
      return {
        accountId: response.data.accountId,
        displayName: response.data.displayName,
        emailAddress: response.data.emailAddress
      };
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Invalid API token. Please check your authentication in .jirarc');
      } else {
        throw new Error(`Failed to fetch current user: ${error.message}`);
      }
    }
  }

  async getAllFields(config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const response = await this.client.get('/rest/api/3/field');
      const fields = response.data;

      // Filter to only custom fields and return useful information
      const customFields = fields
        .filter(field => field.schema && field.schema.custom)
        .map(field => ({
          id: field.id,
          name: field.name,
          description: field.description || '',
          type: field.schema.type
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return customFields;
    } catch (error) {
      throw new Error('Failed to fetch custom fields from Jira. Please check your permissions.');
    }
  }

  async getFieldOptions(fieldId) {
    if (!this.client) {
      this.initializeClient();
    }

    try {
      // Get field information from the fields endpoint we know works
      const fieldsResponse = await this.client.get('/rest/api/3/field');
      const field = fieldsResponse.data.find(f => f.id === fieldId);

      if (!field) {
        throw new Error(`Field ${fieldId} not found in your Jira instance.`);
      }

      console.log(`Field "${field.name}" (${field.id}):`);
      console.log(`  Type: ${field.schema?.type || 'unknown'}`);
      console.log(`  Custom: ${field.schema?.custom || 'false'}`);
      if (field.schema?.system) {
        console.log(`  System: ${field.schema.system}`);
      }

      // Try the options endpoint first
      try {
        const response = await this.client.get(`/rest/api/3/field/${fieldId}/option`);
        return response.data.values || [];
      } catch (optionError) {
        console.log(`  Options endpoint failed: ${optionError.response?.status || optionError.message}`);
      }

      // Check if field has allowed values in schema
      if (field.schema && field.schema.allowedValues) {
        console.log(`  Found allowedValues in schema`);
        return field.schema.allowedValues;
      }

      // For select fields, try the context endpoint
      if (field.schema && (field.schema.type === 'option' || field.schema.type === 'array')) {
        try {
          const contextResponse = await this.client.get(`/rest/api/3/field/${fieldId}/context`);
          console.log(`  Found ${contextResponse.data.values?.length || 0} contexts`);

          if (contextResponse.data.values && contextResponse.data.values.length > 0) {
            const contextId = contextResponse.data.values[0].id;
            const optionsResponse = await this.client.get(`/rest/api/3/field/${fieldId}/context/${contextId}/option`);
            return optionsResponse.data.values || [];
          }
        } catch (contextError) {
          console.log(`  Context endpoint failed: ${contextError.response?.status || contextError.message}`);
        }
      }

      // Try different variations of endpoints that might work
      const endpointsToTry = [
        `/rest/api/3/customFields/${fieldId}/options`,
        `/rest/api/3/customfield/${fieldId}/option`,
        `/rest/api/3/customfield/${fieldId}/options`
      ];

      for (const endpoint of endpointsToTry) {
        try {
          console.log(`  Trying endpoint: ${endpoint}`);
          const response = await this.client.get(endpoint);
          if (response.data && (response.data.values || response.data.options)) {
            return response.data.values || response.data.options || [];
          }
        } catch (endpointError) {
          console.log(`    Failed: ${endpointError.response?.status || endpointError.message}`);
        }
      }

      return [];
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Field ${fieldId} not found. Please check the field ID.`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access denied to field ${fieldId}. You may not have permission to view this field.`);
      } else {
        throw new Error(`Failed to fetch field information: ${error.response?.data?.errorMessages?.[0] || error.message}`);
      }
    }
  }

  async getAssignedTickets(config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const currentUser = await this.getCurrentUser(config);

      // JQL to get tickets assigned to current user that are not in done statuses
      const jql = `assignee = "${currentUser.emailAddress}" AND status NOT IN (Done, Closed, Resolved, Complete, Completed) ORDER BY updated DESC`;

      const response = await this.client.post('/rest/api/3/search/jql', {
        jql: jql,
        fields: ['key', 'summary', 'status', 'assignee', 'issuetype', 'updated'],
        maxResults: 50 // Limit to recent tickets
      });

      return response.data.issues.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        statusId: issue.fields.status.id,
        workType: issue.fields.issuetype.name,
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        updated: issue.fields.updated,
        source: 'jira'
      }));
    } catch (error) {
      if (error.response?.status === 400) {
        throw new Error(`Invalid JQL query: ${error.response?.data?.errorMessages?.[0] || error.message}`);
      } else {
        throw new Error(`Failed to fetch assigned tickets: ${error.response?.data?.errorMessages?.[0] || error.message}`);
      }
    }
  }

  async getAllAssignedTickets(config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const currentUser = await this.getCurrentUser(config);

      // JQL to get ALL tickets assigned to current user (including completed ones)
      const jql = `assignee = "${currentUser.emailAddress}" ORDER BY updated DESC`;

      const response = await this.client.post('/rest/api/3/search/jql', {
        jql: jql,
        fields: ['key', 'summary', 'status', 'assignee', 'issuetype', 'updated'],
        maxResults: 100 // Get more for comprehensive list
      });

      return response.data.issues.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        statusId: issue.fields.status.id,
        workType: issue.fields.issuetype.name,
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        updated: issue.fields.updated,
        source: 'jira'
      }));
    } catch (error) {
      if (error.response?.status === 400) {
        throw new Error(`Invalid JQL query: ${error.response?.data?.errorMessages?.[0] || error.message}`);
      } else {
        throw new Error(`Failed to fetch all assigned tickets: ${error.response?.data?.errorMessages?.[0] || error.message}`);
      }
    }
  }

  async getTicketDetails(ticketKey, config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const response = await this.client.get(`/rest/api/3/issue/${ticketKey}`, {
        params: {
          fields: 'key,summary,status,assignee,issuetype,updated,description,components,priority'
        }
      });

      const issue = response.data;
      return {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        statusId: issue.fields.status.id,
        workType: issue.fields.issuetype.name,
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        updated: issue.fields.updated,
        description: issue.fields.description,
        components: issue.fields.components || [],
        priority: issue.fields.priority ? issue.fields.priority.name : 'None',
        source: 'jira',
        fullFields: issue.fields // Store all fields for editing
      };
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Ticket ${ticketKey} not found`);
      } else {
        throw new Error(`Failed to fetch ticket details: ${error.response?.data?.errorMessages?.[0] || error.message}`);
      }
    }
  }

  async getAvailableTransitions(issueKey, config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const response = await this.client.get(`/rest/api/3/issue/${issueKey}/transitions`);

      return response.data.transitions.map(transition => ({
        id: transition.id,
        name: transition.to.name,
        description: transition.to.description || '',
        statusCategory: transition.to.statusCategory?.name || ''
      }));
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Ticket ${issueKey} not found`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access denied to ticket ${issueKey}. You may not have permission to view transitions.`);
      } else {
        throw new Error(`Failed to fetch transitions: ${error.response?.data?.errorMessages?.[0] || error.message}`);
      }
    }
  }

  async getEditableFields(issueKey, config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const response = await this.client.get(`/rest/api/3/issue/${issueKey}/editmeta`);

      return response.data.fields;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Ticket ${issueKey} not found`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access denied to ticket ${issueKey}. You may not have permission to edit this ticket.`);
      } else {
        throw new Error(`Failed to fetch editable fields: ${error.response?.data?.errorMessages?.[0] || error.message}`);
      }
    }
  }

  async updateTicketField(issueKey, fieldKey, fieldValue, config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const updatePayload = {
        fields: {
          [fieldKey]: fieldValue
        }
      };

      await this.client.put(`/rest/api/3/issue/${issueKey}`, updatePayload);

      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Ticket ${issueKey} not found`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access denied to ticket ${issueKey}. You may not have permission to edit this ticket.`);
      } else if (error.response?.status === 400) {
        throw new Error(`Invalid field value: ${error.response?.data?.errorMessages?.[0] || error.message}`);
      } else {
        throw new Error(`Failed to update ticket: ${error.response?.data?.errorMessages?.[0] || error.message}`);
      }
    }
  }
}

module.exports = JiraService;
