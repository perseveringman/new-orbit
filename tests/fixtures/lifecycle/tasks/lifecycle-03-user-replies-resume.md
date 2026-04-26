---
scenario_id: L03
title: "User reply resumes paused run"
acceptance:
  task_state_sequence: [todo, doing, doing, done]
  agent_session_state_sequence: [idle, running, awaiting_user, running, completed]
  user_actions:
    - at_event: agent_awaiting_user
      action: send_message_in_chat
      payload: "Proceed with option A."
  final_task_state: done
  max_total_runtime_minutes: 20
  budget_max_usd: 2
---

Trigger an awaiting-user state, inject a reply, and verify the same task continues to a terminal success.
