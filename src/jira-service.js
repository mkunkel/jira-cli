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

  async getProjectComponents(config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      const response = await this.client.get(`/rest/api/3/project/${config.projectKey}/components`);
      return response.data.map(component => component.name).sort();
    } catch (error) {
      console.warn('Warning: Could not fetch components from Jira, using default list');
      // Return default components if API call fails
      return [
        'Frontend',
        'Backend',
        'API',
        'Database',
        'Infrastructure',
        'Documentation',
        'Testing',
        'Security',
        'Mobile',
        'DevOps'
      ];
    }
  }

  async getSoftwareCapitalizationProjects(config) {
    if (!this.client) {
      this.initializeClient(config);
    }

    try {
      // If the user has specified a custom field ID in config, use that directly
      if (config.customFields && config.customFields.softwareCapitalizationProject) {
        try {
          const fieldId = config.customFields.softwareCapitalizationProject;
          const fieldOptionsResponse = await this.client.get(`/rest/api/3/field/${fieldId}/option`);

          if (fieldOptionsResponse.data && fieldOptionsResponse.data.values) {
            const options = fieldOptionsResponse.data.values.map(option => option.value).sort();
            if (options.length > 0) {
              return options;
            }
          }
        } catch (error) {
          console.warn(`Could not fetch options for custom field ${config.customFields.softwareCapitalizationProject}`);
        }
      }

      // First, try to get the field configuration for the project
      // This will help us find custom fields and their options
      const fieldsResponse = await this.client.get(`/rest/api/3/field`);
      const fields = fieldsResponse.data;

      // Look for software capitalization related fields
      const capitalizationField = fields.find(field =>
        field.name && (
          field.name.toLowerCase().includes('software') ||
          field.name.toLowerCase().includes('capitalization') ||
          field.name.toLowerCase().includes('project') ||
          field.name.toLowerCase().includes('capitalize')
        )
      );

      if (capitalizationField && capitalizationField.schema && capitalizationField.schema.custom) {
        // Try to get the field's allowed values
        try {
          const fieldId = capitalizationField.id;
          const fieldOptionsResponse = await this.client.get(`/rest/api/3/field/${fieldId}/option`);

          if (fieldOptionsResponse.data && fieldOptionsResponse.data.values) {
            const options = fieldOptionsResponse.data.values.map(option => option.value).sort();
            if (options.length > 0) {
              console.log(`Found software capitalization field: ${capitalizationField.name} (${fieldId})`);
              return options;
            }
          }
        } catch (optionError) {
          console.warn('Could not fetch field options, trying alternative approach');
        }
      }

      // Alternative approach: try to get issue types and their field configurations
      try {
        const issueTypesResponse = await this.client.get(`/rest/api/3/project/${config.projectKey}`);
        const project = issueTypesResponse.data;

        if (project && project.issueTypes) {
          // Try to get field configuration for the first issue type
          const issueType = project.issueTypes[0];
          if (issueType) {
            const createMetaResponse = await this.client.get(
              `/rest/api/3/issue/createmeta?projectKeys=${config.projectKey}&issuetypeIds=${issueType.id}&expand=projects.issuetypes.fields`
            );

            if (createMetaResponse.data && createMetaResponse.data.projects) {
              const projectMeta = createMetaResponse.data.projects[0];
              if (projectMeta && projectMeta.issuetypes) {
                const issueTypeMeta = projectMeta.issuetypes[0];
                if (issueTypeMeta && issueTypeMeta.fields) {
                  // Look for software capitalization field in the create metadata
                  for (const [fieldId, fieldConfig] of Object.entries(issueTypeMeta.fields)) {
                    if (fieldConfig.name && (
                      fieldConfig.name.toLowerCase().includes('software') ||
                      fieldConfig.name.toLowerCase().includes('capitalization') ||
                      fieldConfig.name.toLowerCase().includes('capitalize')
                    )) {
                      if (fieldConfig.allowedValues) {
                        const options = fieldConfig.allowedValues.map(option => option.value || option.name).sort();
                        if (options.length > 0) {
                          console.log(`Found software capitalization field: ${fieldConfig.name} (${fieldId})`);
                          return options;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (metaError) {
        console.warn('Could not fetch create metadata');
      }

      // If all else fails, fall back to defaults
      return this.getDefaultCapitalizationProjects();
    } catch (error) {
      console.warn('Warning: Could not fetch software capitalization projects from Jira, using default list');
      return this.getDefaultCapitalizationProjects();
    }
  }

  getDefaultCapitalizationProjects() {
    return [
      'Lonely Planet Website',
      'Mobile App',
      'API Platform',
      'Content Management System',
      'Analytics Platform',
      'Marketing Tools',
      'Internal Tools',
      'Infrastructure',
      'Data Platform',
      'Customer Support Tools'
    ];
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
}

module.exports = JiraService;
