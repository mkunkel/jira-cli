const axios = require('axios');

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

  buildCreateTicketPayload(ticketData, config) {
    const payload = {
      fields: {
        project: {
          key: config.projectKey
        },
        summary: ticketData.summary,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: ticketData.description
                }
              ]
            }
          ]
        },
        issuetype: {
          name: ticketData.workType
        },
        priority: {
          name: ticketData.priority
        }
      }
    };

    // Add components if selected
    if (ticketData.components && ticketData.components.length > 0) {
      payload.fields.components = ticketData.components.map(component => ({
        name: component
      }));
    }

    // Add custom fields for ticket classification and software capitalization project
    // Note: These field IDs would need to be configured based on your Jira instance
    // payload.fields.customfield_xxxxx = ticketData.ticketClassification;
    // payload.fields.customfield_yyyyy = ticketData.softwareCapitalizationProject;

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
}

module.exports = JiraService;
