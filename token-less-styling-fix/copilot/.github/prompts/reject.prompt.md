---
agent: orchestrator
description: Reject the current gate and say what is wrong
---
Gate rejected: ${input:details:details}
Fix this, re-run everything that depends on it, then stop at the same gate again.
