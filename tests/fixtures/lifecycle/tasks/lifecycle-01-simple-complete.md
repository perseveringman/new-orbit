---
scenario_id: L01
title: "Simple task completes"
acceptance:
  task_state_sequence: [todo, doing, done]
  agent_session_state_sequence: [idle, launching, running, completed]
  final_task_state: done
  max_total_runtime_minutes: 10
  budget_max_usd: 1
---

Implement a small deterministic code change and complete the review path without asking the user for extra input.
