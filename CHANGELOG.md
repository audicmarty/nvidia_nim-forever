## [0.3.56] - 2026-04-23

### Fixed
- **GLM Proxy ETIMEDOUT**: Fixed a bug where a long reasoning model response would drop due to a connection timeout without automatically recovering. The stream will now keep the connection alive via SSE retries even on a network hang.
- **GLM Proxy UI Corruption**: Removed noisy proxy logs that were interfering and visually breaking the `opencode` animated TUI layout.
- **GLM Proxy Stall Detection**: Added a 120s idle timeout to automatically detect and transparently retry if NVIDIA's API hangs on the first chunk or mid-stream.
