# Verification

Verified on 7 October 2026 with Node.js 24.18.0.

Passed:

- JavaScript syntax checks for server, market data module, and browser app.
- HTTP page response and demo-state API.
- Creation of an empty portfolio.
- Saving fractional share quantities and optional average cost.
- Returning sample quotes for held stocks.
- Portfolio-only news, including exclusion after holding removal.
- Invalid quantities and unknown symbols rejected.
- Live mode without an API key rejected with an actionable message.
- Requests from unrelated web origins rejected.
- Private files not served by the HTTP server.
- Duplicate story merging and event-based importance ranking.
- Holdings persisted across a real server restart.

Checks used a separate database under the workspace's work directory, leaving the starter portfolio intact.

Not verified:

- Browser rendering and interactive UI checks: the tool-launched server could be reached during its launch command, but subsequent browser connections failed in this environment.
- Live Finnhub responses: the requested mode is demo and no personal API key was supplied.
- Optional WebMCP registration: no supported page context was available.

Start the app directly with start.cmd and visit http://localhost:4317 to review the interface.
