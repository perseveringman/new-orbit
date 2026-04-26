---
scenario_id: L15
title: "Budget cap creates terminal session failure"
acceptance:
  task_state_sequence: [todo, doing, doing]
  agent_session_state_sequence: [idle, running, failed_terminal]
  final_task_state: doing
  max_total_runtime_minutes: 20
  budget_max_usd: 1
---

Trigger a budget cap and verify the task remains doing while the agent session is failed_terminal with an Inbox C2 event.
