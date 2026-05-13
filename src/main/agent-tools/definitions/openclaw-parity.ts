import type { AgentToolRegistrationView } from '@shared/agent-tools';

export const OPENCLAW_PLANNED_TOOL_VIEWS: readonly AgentToolRegistrationView[] = [
  {
    name: 'orbit_task_plan_update',
    description: 'Update the visible agent task plan for long-running Ask Anywhere work.',
    family: 'orbit',
    risk: 'L0_observe',
    permissions: ['read'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'update_plan'
  },
  {
    name: 'orbit_session_send',
    description: 'Send a message to an existing Ask Anywhere/helper session.',
    family: 'subagent',
    risk: 'L2_reversible_draft',
    permissions: ['spawn_subagent'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'sessions_send'
  },
  {
    name: 'orbit_session_history',
    description: 'Read previous Ask Anywhere/helper session messages and tool results.',
    family: 'subagent',
    risk: 'L0_observe',
    permissions: ['read'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'sessions_history'
  },
  {
    name: 'orbit_agents_list',
    description: 'List available assistant/subagent profiles and their configured runtime capabilities.',
    family: 'subagent',
    risk: 'L0_observe',
    permissions: ['read'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'agents_list'
  },
  {
    name: 'orbit_session_status',
    description: 'Read detailed status for a specific Ask Anywhere/helper session.',
    family: 'subagent',
    risk: 'L0_observe',
    permissions: ['read'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'session_status'
  },
  {
    name: 'orbit_automation_schedule',
    description: 'Create or update recurring local automations with authority-aware approval.',
    family: 'automation',
    risk: 'L4_external_side_effect',
    permissions: ['external_submit'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'cron / heartbeat'
  },
  {
    name: 'orbit_user_message',
    description: 'Ask the user for clarification or send structured agent progress messages.',
    family: 'orbit',
    risk: 'L0_observe',
    permissions: ['read'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'message'
  },
  {
    name: 'orbit_gateway_call',
    description: 'Call configured external API gateways through policy-controlled connectors.',
    family: 'plugin',
    risk: 'L4_external_side_effect',
    permissions: ['external_submit', 'secrets'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'gateway'
  },
  {
    name: 'orbit_media_image',
    description: 'Inspect or generate images as managed media artifacts.',
    family: 'media',
    risk: 'L2_reversible_draft',
    permissions: ['write_sandbox'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'image / image_generate'
  },
  {
    name: 'orbit_media_audio_video',
    description: 'Generate or inspect audio/video artifacts through configured providers.',
    family: 'media',
    risk: 'L2_reversible_draft',
    permissions: ['write_sandbox'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'tts / music_generate / video_generate'
  },
  {
    name: 'orbit_pdf_read',
    description: 'Extract and summarize PDF documents with page-aware metadata.',
    family: 'media',
    risk: 'L0_observe',
    permissions: ['read'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'pdf'
  },
  {
    name: 'orbit_plugin_tool',
    description: 'Expose installed plugin tools through a unified, authority-aware registry.',
    family: 'plugin',
    risk: 'L3_layer1_direct_write',
    permissions: ['write_worktree', 'external_submit'],
    scopes: [],
    status: 'planned',
    source: 'openclaw-inspired',
    openClawEquivalent: 'plugin tools'
  }
];
