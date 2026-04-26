---
scenario_id: L10
title: "Dependency flow restores blocked semantics"
acceptance:
  task_state_sequence: [blocked, todo, doing, done]
  agent_session_state_sequence: [idle, launching, running, completed]
  final_task_state: done
  max_total_runtime_minutes: 10
  budget_max_usd: 1
---

Create a task blocked by dependencies, complete the dependency, and verify only dependency state controls blocked.
