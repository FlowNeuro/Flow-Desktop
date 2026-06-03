# SABR module attribution

This module is a clean-room Rust implementation of YouTube's SABR (Server
Adaptive Bit Rate) streaming protocol for Flow Desktop (GPL-3.0-only).

It was written by consulting the following references. No source files were
copied verbatim; protobuf field numbers, UMP part-type IDs, and the UMP varint
algorithm are facts about YouTube's wire protocol, derived from these works:

- **sabr-rs** (MIT) — <https://github.com/mthwJsmith/sabr-rs>
  The UMP varint codec and streaming-parser structure in `ump.rs` follow this
  implementation closely; its test vectors were adapted. The `.proto` field
  numbers used by `messages.rs` were read from this project's `proto/` tree.

- **sabr** / **sabr-rs (luanrt-style)**  used to cross-check UMP part-type IDs and the `VideoPlaybackAbrRequest` shape.

- **Flow for Android** SABR implementation (`FlowApp_mobile/.../player/sabr/`) —
  used to cross-check protobuf field numbers, the request builder, and the
  stream controller's part-dispatch logic.

- **YouTube.js / @luanrt/googlevideo** documentation — referenced for the
  `SabrStream` / `SabrUmpProcessor` responsibilities.

Both MIT and GPL-3.0 reference works are license-compatible with this GPL-3.0
application. The protobuf wire codec (`pb.rs`) is original and avoids any
dependency on `protoc` / `prost-build`, keeping the build hermetic.
