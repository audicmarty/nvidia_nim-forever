## [0.3.58] - 2026-04-23

### Fixed
- **Bulletproof Proxy Integrity**: Hardened the proxy streaming logic to 1000000% prevent hanging streams. If the client disconnects or network interrupts unexpectedly, dangling promises are explicitly resolved to prevent infinite unhandled rejections or silent hangs.
- **Unified Timeout Error Boundary**: Cleaned up the timeout error logic to uniformly trigger the proxy's central error handler. This resolves potential race conditions where a timeout could double-reject or loop over a completed network drop.
