---
uid: task_scenario_06
scenario_id: scenario-06
title: Runtime fallback
status: todo
acceptance:
  expected_event_kinds:
    - thinking
    - error
    - fallback
    - message
    - done
  final_status: done
  max_cost_usd: 0.10
  max_duration_s: 90
---

Simulate a retryable runtime failure and verify fallback selection.
