---
scenario_id: L08
title: "Automatic fallback selects another runtime"
acceptance:
  task_state_sequence: [todo, doing, doing, done]
  agent_session_state_sequence: [idle, running, failed_retryable, launching, running, completed]
  final_task_state: done
  max_total_runtime_minutes: 30
  budget_max_usd: 5
---

Trigger a retryable runtime failure and verify ADR-014 fallback picks the next healthy runtime.
