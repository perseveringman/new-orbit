---
uid: task_scenario_07
scenario_id: scenario-07
title: Stale runtime detection
status: todo
acceptance:
  expected_event_kinds:
    - thinking
    - heartbeat
    - fallback
    - done
  final_status: done
  max_cost_usd: 0.05
  max_duration_s: 120
---

Detect a stale run after heartbeat timeout and recover through fallback.
