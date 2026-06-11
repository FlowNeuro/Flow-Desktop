//! Continuation token extraction — both the old (`nextContinuationData`) and
//! new (`continuationItemRenderer`/`continuationCommand`) formats, in one place.

use serde_json::Value;

/// Old-format token from a `continuations` array (also handles the radio +
/// reload variants).
#[must_use]
pub fn from_continuations(node: &Value) -> Option<String> {
    let arr = node["continuations"].as_array()?;
    for c in arr {
        if let Some(t) = c["nextContinuationData"]["continuation"].as_str() {
            return Some(t.to_string());
        }
        if let Some(t) = c["nextRadioContinuationData"]["continuation"].as_str() {
            return Some(t.to_string());
        }
        if let Some(t) = c["reloadContinuationData"]["continuation"].as_str() {
            return Some(t.to_string());
        }
    }
    None
}

/// New-format token: a trailing `continuationItemRenderer` inside an items array.
#[must_use]
pub fn from_items(items: &Value) -> Option<String> {
    items.as_array()?.iter().rev().find_map(|it| {
        it["continuationItemRenderer"]["continuationEndpoint"]["continuationCommand"]["token"]
            .as_str()
            .map(ToOwned::to_owned)
    })
}

/// Best-effort token from either format on a shelf/section node.
#[must_use]
pub fn any(node: &Value, items: &Value) -> Option<String> {
    from_continuations(node).or_else(|| from_items(items))
}
