---
scenario_id: L07
title: "Switch runtime with compressed transcript injection"
acceptance:
  task_state_sequence: [todo, doing, doing, done]
  agent_session_state_sequence: [idle, running, failed_retryable, launching, running, completed]
  user_actions:
    - at_event: runtime_failed_retryable
      action: switch_runtime
      payload: "copilot"
  final_task_state: done
  max_total_runtime_minutes: 30
  budget_max_usd: 5
---

Generate a long transcript, switch runtime, and verify Orbit injects a compressed progress summary rather than the full transcript.
