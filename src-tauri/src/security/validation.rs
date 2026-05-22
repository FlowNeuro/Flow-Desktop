use crate::errors::{AppError, AppResult};

pub fn validate_search_query(query: &str) -> AppResult<()> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return Err(AppError::Validation("Search query cannot be empty".into()));
    }

    if trimmed.chars().count() > 200 {
        return Err(AppError::Validation(
            "Search query cannot exceed 200 characters".into(),
        ));
    }

    Ok(())
}

pub fn validate_video_id(video_id: &str) -> AppResult<()> {
    let trimmed = video_id.trim();

    if trimmed.len() != 11 {
        return Err(AppError::Validation("Invalid YouTube video ID".into()));
    }

    let is_valid = trimmed
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '-');

    if !is_valid {
        return Err(AppError::Validation("Invalid YouTube video ID".into()));
    }

    Ok(())
}

pub fn validate_channel_id(channel_id: &str) -> AppResult<()> {
    let trimmed = channel_id.trim();

    if trimmed.is_empty() {
        return Err(AppError::Validation("Channel ID cannot be empty".into()));
    }

    if trimmed.chars().count() > 100 {
        return Err(AppError::Validation("Channel ID cannot exceed 100 characters".into()));
    }

    Ok(())
}

pub fn validate_page_token(page_token: &str) -> AppResult<()> {
    let trimmed = page_token.trim();

    if trimmed.is_empty() {
        return Err(AppError::Validation("Page token cannot be empty".into()));
    }

    if trimmed.chars().count() > 16384 {
        return Err(AppError::Validation("Page token cannot exceed 16384 characters".into()));
    }

    Ok(())
}

pub fn validate_browse_id(id: &str) -> AppResult<()> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("ID parameter cannot be empty".into()));
    }
    // Check against path traversal or malicious characters
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('.') || trimmed.contains(':') {
        return Err(AppError::Validation("Malformed ID format detected".into()));
    }
    // Verify prefix structure or alphanumeric + underscore/dash characters
    if trimmed.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == '%') {
        Ok(())
    } else {
        Err(AppError::Validation("Invalid character set in ID parameter".into()))
    }
}

