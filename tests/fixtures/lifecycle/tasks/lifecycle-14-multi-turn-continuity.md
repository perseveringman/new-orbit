---
scenario_id: L14
title: "Multi-turn continuity across session transcript"
acceptance:
  task_state_sequence: [todo, doing, doing, done]
  agent_session_state_sequence: [idle, running, awaiting_user, running, completed]
  user_actions:
    - at_event: agent_awaiting_user
      action: send_message_in_chat
      payload: "The earlier constraint still applies."
  final_task_state: done
  max_total_runtime_minutes: 20
  budget_max_usd: 3
---

Exercise a multi-turn task and verify the continuation keeps prior constraints visible.
