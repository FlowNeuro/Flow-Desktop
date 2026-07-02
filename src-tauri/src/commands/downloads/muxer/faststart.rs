//! MP4 "faststart" post-process.

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::Path;

/// A parsed top-level box: its four-character type and byte extents in the file.
struct TopBox {
    fourcc: [u8; 4],
    start: u64,
    total: u64,
}

pub fn faststart_in_place(path: &Path) -> Result<(), String> {
    let boxes = read_top_level_boxes(path)?;

    let first = boxes.first().ok_or_else(|| "empty MP4".to_string())?;
    if &first.fourcc != b"ftyp" {
        return Err("MP4 does not start with ftyp".to_string());
    }
    let moov = boxes
        .iter()
        .find(|b| &b.fourcc == b"moov")
        .ok_or_else(|| "MP4 has no moov box".to_string())?;
    let mdat = boxes
        .iter()
        .find(|b| &b.fourcc == b"mdat")
        .ok_or_else(|| "MP4 has no mdat box".to_string())?;

    if moov.start < mdat.start {
        return Ok(());
    }

    let mut file = File::open(path).map_err(|e| format!("Could not reopen MP4: {e}"))?;
    let moov_len = usize::try_from(moov.total).map_err(|_| "moov box too large".to_string())?;
    let mut moov_buf = vec![0_u8; moov_len];
    file.seek(SeekFrom::Start(moov.start))
        .map_err(|e| format!("Could not seek to moov: {e}"))?;
    file.read_exact(&mut moov_buf)
        .map_err(|e| format!("Could not read moov: {e}"))?;
    drop(file);

    patch_chunk_offsets(&mut moov_buf, moov.total)?;

    let tmp_path = path.with_extension("faststart.tmp");
    let write_result = (|| -> std::io::Result<()> {
        let mut src = BufReader::new(File::open(path)?);
        let mut out = BufWriter::new(File::create(&tmp_path)?);

        copy_range(&mut src, &mut out, first.start, first.total)?; 
        out.write_all(&moov_buf)?; 
        for b in &boxes {
            if &b.fourcc == b"ftyp" || &b.fourcc == b"moov" {
                continue;
            }
            copy_range(&mut src, &mut out, b.start, b.total)?; 
        }
        out.flush()?;
        Ok(())
    })();

    if let Err(e) = write_result {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("Could not write faststart MP4: {e}"));
    }

    std::fs::rename(&tmp_path, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("Could not replace MP4 with faststart copy: {e}")
    })
}

fn read_top_level_boxes(path: &Path) -> Result<Vec<TopBox>, String> {
    let mut file = File::open(path).map_err(|e| format!("Could not open MP4: {e}"))?;
    let file_len = file
        .seek(SeekFrom::End(0))
        .map_err(|e| format!("Could not size MP4: {e}"))?;

    let mut boxes = Vec::new();
    let mut pos = 0_u64;
    while pos + 8 <= file_len {
        file.seek(SeekFrom::Start(pos))
            .map_err(|e| format!("Could not seek MP4: {e}"))?;
        let mut header = [0_u8; 8];
        file.read_exact(&mut header)
            .map_err(|e| format!("Could not read MP4 box header: {e}"))?;
        let size32 = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
        let fourcc = [header[4], header[5], header[6], header[7]];
        let total = match size32 {
            1 => {
                let mut large = [0_u8; 8];
                file.read_exact(&mut large)
                    .map_err(|e| format!("Could not read MP4 extended size: {e}"))?;
                u64::from_be_bytes(large)
            }
            0 => file_len - pos,
            n => u64::from(n),
        };
        if total < 8 || pos + total > file_len {
            return Err("malformed MP4 box chain".to_string());
        }
        boxes.push(TopBox {
            fourcc,
            start: pos,
            total,
        });
        pos += total;
    }
    Ok(boxes)
}

fn copy_range<R: Read + Seek, W: Write>(
    src: &mut R,
    out: &mut W,
    start: u64,
    len: u64,
) -> std::io::Result<()> {
    src.seek(SeekFrom::Start(start))?;
    let mut remaining = len;
    let mut buf = vec![0_u8; 256 * 1024];
    while remaining > 0 {
        let want = remaining.min(buf.len() as u64) as usize;
        src.read_exact(&mut buf[..want])?;
        out.write_all(&buf[..want])?;
        remaining -= want as u64;
    }
    Ok(())
}

fn patch_chunk_offsets(moov: &mut [u8], delta: u64) -> Result<(), String> {
    patch_boxes(moov, delta)
}

fn patch_boxes(data: &mut [u8], delta: u64) -> Result<(), String> {
    let mut pos = 0_usize;
    while pos + 8 <= data.len() {
        let size32 = u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]);
        let fourcc = [data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]];
        let (header_len, total) = match size32 {
            1 => {
                if pos + 16 > data.len() {
                    return Err("truncated 64-bit box in moov".to_string());
                }
                let large = u64::from_be_bytes([
                    data[pos + 8],
                    data[pos + 9],
                    data[pos + 10],
                    data[pos + 11],
                    data[pos + 12],
                    data[pos + 13],
                    data[pos + 14],
                    data[pos + 15],
                ]);
                (16_usize, large as usize)
            }
            0 => (8_usize, data.len() - pos),
            n => (8_usize, n as usize),
        };
        if total < header_len || pos + total > data.len() {
            return Err("truncated box in moov".to_string());
        }
        let payload = &mut data[pos + header_len..pos + total];
        match &fourcc {
            b"stco" => patch_stco(payload, delta)?,
            b"co64" => patch_co64(payload, delta)?,
            // Container boxes on the path to (and around) the sample tables.
            b"trak" | b"mdia" | b"minf" | b"stbl" | b"edts" | b"udta" | b"mvex" => {
                patch_boxes(payload, delta)?;
            }
            _ => {}
        }
        pos += total;
    }
    Ok(())
}

/// Patches a 32-bit chunk-offset table (`stco`). Fails (so the caller keeps the
/// original file) if any shifted offset would overflow 32 bits.
fn patch_stco(payload: &mut [u8], delta: u64) -> Result<(), String> {
    if payload.len() < 8 {
        return Err("stco box too short".to_string());
    }
    let count = u32::from_be_bytes([payload[4], payload[5], payload[6], payload[7]]) as usize;
    let mut off = 8_usize;
    for _ in 0..count {
        let end = off + 4;
        if end > payload.len() {
            return Err("stco table truncated".to_string());
        }
        let value = u32::from_be_bytes([
            payload[off],
            payload[off + 1],
            payload[off + 2],
            payload[off + 3],
        ]);
        let shifted = u64::from(value) + delta;
        let shifted = u32::try_from(shifted)
            .map_err(|_| "chunk offset overflows 32-bit stco; needs co64".to_string())?;
        payload[off..end].copy_from_slice(&shifted.to_be_bytes());
        off = end;
    }
    Ok(())
}

/// Patches a 64-bit chunk-offset table (`co64`).
fn patch_co64(payload: &mut [u8], delta: u64) -> Result<(), String> {
    if payload.len() < 8 {
        return Err("co64 box too short".to_string());
    }
    let count = u32::from_be_bytes([payload[4], payload[5], payload[6], payload[7]]) as usize;
    let mut off = 8_usize;
    for _ in 0..count {
        let end = off + 8;
        if end > payload.len() {
            return Err("co64 table truncated".to_string());
        }
        let value = u64::from_be_bytes([
            payload[off],
            payload[off + 1],
            payload[off + 2],
            payload[off + 3],
            payload[off + 4],
            payload[off + 5],
            payload[off + 6],
            payload[off + 7],
        ]);
        let shifted = value
            .checked_add(delta)
            .ok_or_else(|| "chunk offset overflow".to_string())?;
        payload[off..end].copy_from_slice(&shifted.to_be_bytes());
        off = end;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mp4_box(kind: &[u8], payload: &[u8]) -> Vec<u8> {
        let total = u32::try_from(8 + payload.len()).expect("box fits in u32");
        let mut out = total.to_be_bytes().to_vec();
        out.extend_from_slice(kind);
        out.extend_from_slice(payload);
        out
    }

    /// stco payload: version+flags (4) + entry_count (4) + offsets.
    fn stco(offsets: &[u32]) -> Vec<u8> {
        let mut p = vec![0, 0, 0, 0];
        p.extend_from_slice(&u32::try_from(offsets.len()).unwrap().to_be_bytes());
        for o in offsets {
            p.extend_from_slice(&o.to_be_bytes());
        }
        mp4_box(b"stco", &p)
    }

    /// Scans `data` for the (single) `stco` box anywhere within it and returns its
    /// entries — simple enough for these tiny synthetic fixtures. Layout after the
    /// fourcc: version+flags(4) | entry_count(4) | offsets(4·n).
    fn find_stco_offsets(data: &[u8]) -> Vec<u32> {
        let Some(idx) = data.windows(4).position(|w| w == b"stco") else {
            return Vec::new();
        };
        let body = &data[idx + 4..];
        let count = u32::from_be_bytes([body[4], body[5], body[6], body[7]]) as usize;
        let mut out = Vec::new();
        let mut off = 8;
        for _ in 0..count {
            out.push(u32::from_be_bytes([
                body[off],
                body[off + 1],
                body[off + 2],
                body[off + 3],
            ]));
            off += 4;
        }
        out
    }

    #[test]
    fn patches_nested_stco_offsets() {
        // moov > trak > mdia > minf > stbl > stco
        let stbl = mp4_box(b"stbl", &stco(&[100, 2_000, 30_000]));
        let minf = mp4_box(b"minf", &stbl);
        let mdia = mp4_box(b"mdia", &minf);
        let trak = mp4_box(b"trak", &mdia);
        let mut moov = mp4_box(b"moov", &trak);

        let delta = 4_096_u64;
        patch_chunk_offsets(&mut moov, delta).expect("patch");

        assert_eq!(
            find_stco_offsets(&moov),
            vec![100 + 4_096, 2_000 + 4_096, 30_000 + 4_096]
        );
    }

    #[test]
    fn co64_offsets_shift() {
        let mut p = vec![0, 0, 0, 0];
        p.extend_from_slice(&1_u32.to_be_bytes());
        p.extend_from_slice(&(5_000_000_000_u64).to_be_bytes());
        let mut co64 = mp4_box(b"co64", &p);
        patch_co64(&mut co64[8..], 1_000).expect("patch");
        let body = &co64[8..];
        let value = u64::from_be_bytes([
            body[8], body[9], body[10], body[11], body[12], body[13], body[14], body[15],
        ]);
        assert_eq!(value, 5_000_001_000);
    }

    #[test]
    fn stco_overflow_is_rejected() {
        let mut boxed = stco(&[u32::MAX - 10]);
        let err = patch_stco(&mut boxed[8..], 100).unwrap_err();
        assert!(err.contains("overflow"), "unexpected error: {err}");
    }

    #[test]
    fn relocates_moov_ahead_of_mdat() {
        use std::io::Write as _;

        // Build ftyp | mdat | moov, where the single chunk offset points at the
        // first mdat payload byte (absolute file offset).
        let ftyp = mp4_box(b"ftyp", b"isom");
        let mdat_payload = vec![0xAB_u8; 32];
        let mdat = mp4_box(b"mdat", &mdat_payload);
        let mdat_data_start = (ftyp.len() + 8) as u32; // offset of mdat payload

        let stbl = mp4_box(b"stbl", &stco(&[mdat_data_start]));
        let minf = mp4_box(b"minf", &stbl);
        let mdia = mp4_box(b"mdia", &minf);
        let trak = mp4_box(b"trak", &mdia);
        let moov = mp4_box(b"moov", &trak);

        let dir = std::env::temp_dir().join(format!("flow-faststart-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sample.mp4");
        {
            let mut f = File::create(&path).unwrap();
            f.write_all(&ftyp).unwrap();
            f.write_all(&mdat).unwrap();
            f.write_all(&moov).unwrap();
        }

        faststart_in_place(&path).expect("faststart");

        // Order is now ftyp | moov | mdat, and the offset was shifted by moov.len().
        let out = std::fs::read(&path).unwrap();
        assert_eq!(&out[4..8], b"ftyp");
        let after_ftyp = ftyp.len();
        assert_eq!(&out[after_ftyp + 4..after_ftyp + 8], b"moov");

        let boxes = read_top_level_boxes(&path).unwrap();
        let moov_box = boxes.iter().find(|b| &b.fourcc == b"moov").unwrap();
        let mdat_box = boxes.iter().find(|b| &b.fourcc == b"mdat").unwrap();
        assert!(moov_box.start < mdat_box.start);

        // The relocated moov's chunk offset should equal the new mdat payload start.
        let new_mdat_data_start = mdat_box.start + 8;
        let moov_bytes = &out[moov_box.start as usize..(moov_box.start + moov_box.total) as usize];
        assert_eq!(
            find_stco_offsets(moov_bytes),
            vec![new_mdat_data_start as u32]
        );

        // Second run is a no-op (already faststart).
        faststart_in_place(&path).expect("idempotent faststart");

        std::fs::remove_dir_all(&dir).ok();
    }
}
