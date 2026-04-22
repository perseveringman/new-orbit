import {
  BASE_AGENT_MD,
  BASE_CONFIG_JSON,
  BASE_GITIGNORE,
  BASE_README_MD,
  type TemplateDefinition
} from './common';

const blank: TemplateDefinition = {
  meta: {
    id: 'blank',
    label: 'Blank',
    description: 'Minimal project scaffold with .agent/, AGENT.md, README.md and .gitignore.'
  },
  files: {
    'AGENT.md': BASE_AGENT_MD,
    'README.md': BASE_README_MD,
    '.gitignore': BASE_GITIGNORE,
    '.agent/config.json': BASE_CONFIG_JSON,
    '.agent/tasks/.gitkeep': '',
    '.agent/memories/.gitkeep': ''
  }
};

export default blank;
