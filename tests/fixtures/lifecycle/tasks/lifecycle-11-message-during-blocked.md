---
scenario_id: L11
title: "Message while task is dependency-blocked"
acceptance:
  task_state_sequence: [blocked, blocked, todo]
  agent_session_state_sequence: [idle]
  user_actions:
    - at_event: task_blocked
      action: send_message_in_chat
      payload: "Additional context for later."
  final_task_state: todo
  max_total_runtime_minutes: 15
  budget_max_usd: 2
---

Send a user message while a task is dependency-blocked and verify the message does not change blocked semantics.
