---
uid: task_scenario_09
scenario_id: scenario-09
title: Event replay trace
status: todo
acceptance:
  expected_event_kinds:
    - thinking
    - tool_use
    - tool_result
    - message
    - replay_marker
    - done
  final_status: done
  max_cost_usd: 0.10
  max_duration_s: 90
---

Produce a traceable run that can be replayed in Developer Console.
