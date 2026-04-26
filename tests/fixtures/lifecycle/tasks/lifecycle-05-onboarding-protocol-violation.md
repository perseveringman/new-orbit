---
scenario_id: L05
title: "Onboarding protocol violation is non-blocking"
acceptance:
  task_state_sequence: [todo, doing, done]
  agent_session_state_sequence: [idle, launching, running, completed]
  final_task_state: done
  max_total_runtime_minutes: 10
  budget_max_usd: 1
---

Force the first agent response to omit the onboarding acknowledgement and verify Orbit records a warning without stopping execution.
