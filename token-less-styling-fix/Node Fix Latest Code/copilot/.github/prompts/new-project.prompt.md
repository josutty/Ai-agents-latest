---
agent: orchestrator
description: Build a new project from the files in inputs/ (stops at Gate 1)
---
Mode: new-project.
Inputs: inputs/fsd-spec.md, inputs/ux/**/*.html, inputs/api/backend-api.yaml (partial).
Branch name: feat/${input:details:branch name, e.g. shop-v1}
Run Phase 0 and Phase 1 only, then stop at Gate 1 and show me the coverage gaps first.
