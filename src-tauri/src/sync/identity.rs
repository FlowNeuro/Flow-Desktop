//! Device identity and the Hybrid Logical Clock (HLC) for Flow Local Sync.
//!
//! Each install has a stable `device_id` (UUID v4, persisted under the settings key
//! `sync_device_id`) and a human-readable `device_name`. Every mutation that participates in a
//! last-write-wins or observed-remove merge is stamped with an [`Hlc`] produced by [`HlcClock`].
//!
//! The clock is wall-clock-driven but monotonic: it never goes backwards, and ties at the same
//! physical millisecond are disambiguated by an incrementing counter, then by `device_id` inside
//! [`Hlc`]'s total order. This is the documented fix for naive wall-clock LWW data loss.
//!
//! Persistence (reading/writing `sync_device_id`) and wall-clock reads are intentionally left to
//! the caller so this module stays pure and unit-testable in isolation. `HlcClock`
//! takes the wall time as a parameter for the same reason.

#![allow(clippy::must_use_candidate)]

use crate::sync::canonical::Hlc;

/// The settings key under which the stable device id is persisted.
pub const DEVICE_ID_SETTING_KEY: &str = "sync_device_id";

/// Generate a fresh, stable device id (UUID v4). Call once per install, then persist.
pub fn new_device_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// A friendly default device name, e.g. `"Flow Desktop (Windows)"`.
pub fn default_device_name() -> String {
    let os = match std::env::consts::OS {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        other => other,
    };
    format!("Flow Desktop ({os})")
}

/// A Hybrid Logical Clock. Holds the device id plus the last issued `(physical_ms, counter)`.
///
/// Wrap in a `Mutex` for shared use; the methods take `&mut self` and are cheap.
#[derive(Debug, Clone)]
pub struct HlcClock {
    device_id: String,
    last_physical_ms: u64,
    counter: u32,
}

impl HlcClock {
    pub fn new(device_id: impl Into<String>) -> Self {
        Self {
            device_id: device_id.into(),
            last_physical_ms: 0,
            counter: 0,
        }
    }

    /// Restore a clock from a previously-observed maximum stamp (e.g. on app start).
    pub fn restore(device_id: impl Into<String>, last_physical_ms: u64, counter: u32) -> Self {
        Self {
            device_id: device_id.into(),
            last_physical_ms,
            counter,
        }
    }

    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    /// Stamp a **local** event at the given wall-clock time (epoch ms).
    ///
    /// `l' = max(l, wall)`; counter increments on a tie, resets otherwise.
    pub fn tick(&mut self, wall_ms: u64) -> Hlc {
        let pt = self.last_physical_ms.max(wall_ms);
        if pt == self.last_physical_ms {
            self.counter = self.counter.wrapping_add(1);
        } else {
            self.last_physical_ms = pt;
            self.counter = 0;
        }
        self.stamp()
    }

    /// Stamp a **receive** event, merging a remote stamp (standard HLC receive rule).
    pub fn observe(&mut self, remote: &Hlc, wall_ms: u64) -> Hlc {
        let prev = self.last_physical_ms;
        let prev_c = self.counter;
        let pt = prev.max(remote.physical_ms).max(wall_ms);

        self.counter = if pt == prev && pt == remote.physical_ms {
            prev_c.max(remote.counter).wrapping_add(1)
        } else if pt == prev {
            prev_c.wrapping_add(1)
        } else if pt == remote.physical_ms {
            remote.counter.wrapping_add(1)
        } else {
            0
        };
        self.last_physical_ms = pt;
        self.stamp()
    }

    fn stamp(&self) -> Hlc {
        Hlc::new(self.last_physical_ms, self.counter, self.device_id.clone())
    }
}

// Tests for this module live in `tests/sync_phase1.rs` (integration test) — see the note in
// `canonical.rs` on why in-crate unit tests can't run on this Tauri crate.
