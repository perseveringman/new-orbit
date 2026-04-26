---
scenario_id: L02
title: "Agent asks user a clarifying question"
acceptance:
  task_state_sequence: [todo, doing, doing]
  agent_session_state_sequence: [idle, launching, running, awaiting_user]
  user_actions:
    - at_event: agent_awaiting_user
      action: send_message_in_chat
      payload: "Use the smallest behavior-preserving implementation."
  final_task_state: doing
  max_total_runtime_minutes: 15
  budget_max_usd: 2
---

Start an underspecified task that requires one clear user decision before implementation can continue.
