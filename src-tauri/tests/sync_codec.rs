//! Wire-envelope regression tests. These lock the 10-byte cleartext
//! header `ver(1) ∥ frame_type(1) ∥ seq(8 BE)` so the Android-interop bug (a missing `ver` byte,
//! which shifted every following byte and made the peer's AEAD-open fail) can never come back.

use flow_desktop_lib::sync::PROTOCOL_VERSION;
use flow_desktop_lib::sync::codec::{HEADER_LEN, decode_message, encode_message};
use flow_desktop_lib::sync::crypto::{
    Role, SessionCipher, generate_master_secret, generate_session_id,
};
use flow_desktop_lib::sync::frames::FrameType;

fn host_client() -> (SessionCipher, SessionCipher) {
    let master = generate_master_secret();
    let sid = generate_session_id();
    (
        SessionCipher::new(&master, sid, Role::Host),
        SessionCipher::new(&master, sid, Role::Client),
    )
}

#[test]
fn wire_header_is_ver_then_type_then_seq() {
    assert_eq!(HEADER_LEN, 10, "ver(1)+type(1)+seq(8)");
    let (host, _client) = host_client();
    let ft = FrameType::Hello.to_u8();
    let seq = 0x0102_0304_0506_0708u64;
    let wire = encode_message(&host, ft, seq, b"{}").unwrap();

    assert_eq!(
        wire[0], PROTOCOL_VERSION,
        "byte 0 must be the protocol version"
    );
    assert_eq!(wire[1], ft, "byte 1 must be the frame type");
    assert_eq!(
        &wire[2..10],
        &seq.to_be_bytes(),
        "bytes 2..10 are the big-endian seq"
    );
}

#[test]
fn encode_decode_roundtrips_across_roles() {
    let (host, client) = host_client();
    let ft = FrameType::Capabilities.to_u8();
    let wire = encode_message(&host, ft, 5, b"hello payload").unwrap();
    let (got_ft, got_seq, plaintext) = decode_message(&client, &wire).unwrap();
    assert_eq!(got_ft, ft);
    assert_eq!(got_seq, 5);
    assert_eq!(plaintext, b"hello payload");
}

#[test]
fn a_wrong_version_byte_is_rejected_before_aead() {
    let (host, client) = host_client();
    let mut wire = encode_message(&host, FrameType::Hello.to_u8(), 0, b"{}").unwrap();
    wire[0] = 0x02; // bump the version byte
    let err = decode_message(&client, &wire).unwrap_err();
    assert!(
        err.to_string().contains("unsupported frame version"),
        "got: {err}"
    );
}
