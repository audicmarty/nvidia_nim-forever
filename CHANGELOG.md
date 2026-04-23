## [0.3.57] - 2026-04-23

### Fixed
- **GLM Proxy / Subagent Disconnects**: Fixed subagents getting marked as `interrupted` during long GLM reasoning periods. The proxy now sends a dedicated SSE keepalive (`: keepalive\n\n`) every 15 seconds to prevent OpenCode's client from dropping the connection.
- **Deep-Thinking Timeout**: Reverted the hard stall timeout from 120s up to 5 minutes, ensuring that legitimate massive-context requests (which take several minutes to process) aren't prematurely killed.
- **Duplicate Text Loop**: Fixed the proxy's retry mechanism gracefully completing the stream when a timeout drops the connection *after* the model has already started answering, preventing duplicate text generation loops.
