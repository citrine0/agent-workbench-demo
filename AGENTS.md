# Agent Workbench Demo Notes

This is a standalone demo. Keep it independent from `agent-collaboration-demo`.

Project layout:

- `web/`: Next.js frontend.
- root Python files plus `agents/`, `prompts/`, `skills/`, `data/`, `output/`: selected harness/backend assets from the old demo.

Design principles:

- Do not add a chat-first interface.
- Keep Mission Board as overview and Mission Detail as depth.
- Show Header Agent as the collaboration interface between user, Task Room, and other users' Header Agents.
- Keep eval as structured decision validation, not long-form text judging.
- Do not add a standalone cost dashboard; budget belongs to Header Gate and runtime policy.
