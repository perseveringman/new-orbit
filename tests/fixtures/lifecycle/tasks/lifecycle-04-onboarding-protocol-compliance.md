---
scenario_id: L04
title: "Onboarding protocol compliance"
acceptance:
  task_state_sequence: [todo, doing, done]
  agent_session_state_sequence: [idle, launching, running, completed]
  final_task_state: done
  max_total_runtime_minutes: 10
  budget_max_usd: 1
---

Verify the first agent response includes the required "我已了解：" acknowledgement and emits the onboarding check event.
