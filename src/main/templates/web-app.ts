import {
  BASE_AGENT_MD,
  BASE_CONFIG_JSON,
  BASE_GITIGNORE,
  BASE_README_MD,
  type TemplateDefinition
} from './common';

const webApp: TemplateDefinition = {
  meta: {
    id: 'web-app',
    label: 'Web App',
    description: 'Project scaffold with src/ and docs/ directories for a web application.'
  },
  files: {
    'AGENT.md': BASE_AGENT_MD,
    'README.md': BASE_README_MD,
    '.gitignore': BASE_GITIGNORE,
    '.agent/config.json': BASE_CONFIG_JSON,
    '.agent/tasks/.gitkeep': '',
    '.agent/memories/.gitkeep': '',
    'src/.gitkeep': '',
    'docs/.gitkeep': ''
  }
};

export default webApp;
