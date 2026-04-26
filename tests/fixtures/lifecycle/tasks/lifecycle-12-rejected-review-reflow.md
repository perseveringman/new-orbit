---
scenario_id: L12
title: "Rejected review returns work to doing"
acceptance:
  task_state_sequence: [todo, doing, done, doing, done]
  agent_session_state_sequence: [idle, running, completed, launching, running, completed]
  user_actions:
    - at_event: review_status_reached
      action: reject_review
      payload: "Please address the missed edge case."
  final_task_state: done
  max_total_runtime_minutes: 20
  budget_max_usd: 3
---

Let a run reach review/completion, reject it, resume work, and complete it again.
