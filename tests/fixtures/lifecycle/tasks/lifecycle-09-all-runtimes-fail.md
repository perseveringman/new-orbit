---
scenario_id: L09
title: "All runtimes fail terminally"
acceptance:
  task_state_sequence: [todo, doing, doing]
  agent_session_state_sequence: [idle, running, failed_terminal]
  final_task_state: doing
  max_total_runtime_minutes: 30
  budget_max_usd: 5
---

Make every available runtime fail and verify the task remains doing while the final session is failed_terminal with an Inbox event.
