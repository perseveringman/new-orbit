---
scenario_id: L13
title: "Five concurrent lifecycle runs"
acceptance:
  task_state_sequence: [todo, doing, done]
  agent_session_state_sequence: [idle, launching, running, completed]
  final_task_state: done
  max_total_runtime_minutes: 30
  budget_max_usd: 5
---

Run five independent tasks concurrently and verify state/event streams do not cross-contaminate.
