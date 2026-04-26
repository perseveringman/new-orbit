---
uid: task_scenario_08
scenario_id: scenario-08
title: Budget limit
status: todo
acceptance:
  expected_event_kinds:
    - thinking
    - cost
    - budget_warning
    - budget_stop
  final_status: budget_stop
  max_cost_usd: 20
  max_duration_s: 90
---

Stop the run when the configured budget limit is reached.
