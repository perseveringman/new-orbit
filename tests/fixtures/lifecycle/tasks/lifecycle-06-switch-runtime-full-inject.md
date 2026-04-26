---
scenario_id: L06
title: "Switch runtime with full transcript injection"
acceptance:
  task_state_sequence: [todo, doing, doing, done]
  agent_session_state_sequence: [idle, running, failed_retryable, launching, running, completed]
  user_actions:
    - at_event: runtime_failed_retryable
      action: switch_runtime
      payload: "codex"
  final_task_state: done
  max_total_runtime_minutes: 20
  budget_max_usd: 3
---

Create a short transcript, switch to another runtime, and verify the continuation prompt receives the full transcript.
