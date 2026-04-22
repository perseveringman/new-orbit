import {
  BASE_AGENT_MD,
  BASE_CONFIG_JSON,
  BASE_GITIGNORE,
  BASE_README_MD,
  type TemplateDefinition
} from './common';

const writing: TemplateDefinition = {
  meta: {
    id: 'writing',
    label: 'Writing',
    description: 'Writing project scaffold with drafts/ and final/ directories.'
  },
  files: {
    'AGENT.md': BASE_AGENT_MD,
    'README.md': BASE_README_MD,
    '.gitignore': BASE_GITIGNORE,
    '.agent/config.json': BASE_CONFIG_JSON,
    '.agent/tasks/.gitkeep': '',
    '.agent/memories/.gitkeep': '',
    'drafts/.gitkeep': '',
    'final/.gitkeep': ''
  }
};

export default writing;
