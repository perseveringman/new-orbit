import {
  BASE_AGENT_MD,
  BASE_CONFIG_JSON,
  BASE_GITIGNORE,
  BASE_README_MD,
  type TemplateDefinition
} from './common';

const research: TemplateDefinition = {
  meta: {
    id: 'research',
    label: 'Research',
    description: 'Research project scaffold with docs/ and notes/ directories.'
  },
  files: {
    'AGENT.md': BASE_AGENT_MD,
    'README.md': BASE_README_MD,
    '.gitignore': BASE_GITIGNORE,
    '.orbit/config.json': BASE_CONFIG_JSON,
    '.orbit/agent/tasks/.gitkeep': '',
    '.orbit/agent/memories/.gitkeep': '',
    'docs/.gitkeep': '',
    'notes/.gitkeep': ''
  }
};

export default research;
