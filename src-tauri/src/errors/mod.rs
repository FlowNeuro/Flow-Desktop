use serde::Serialize;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Extractor error: {0}")]
    Extractor(String),

    #[error("Age-restricted content: {0}")]
    AgeRestricted(String),

    #[error("Private content: {0}")]
    PrivateContent(String),

    #[error("Paid content: {0}")]
    PaidContent(String),

    #[error("Geographic restriction: {0}")]
    GeographicRestriction(String),

    #[error("YouTube Music Premium content: {0}")]
    MusicPremium(String),

    #[error("Bot check required: {0}")]
    BotCheckRequired(String),

    #[error("Account terminated: {0}")]
    AccountTerminated(String),

    #[error("Content not available: {0}")]
    ContentNotAvailable(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Streaming error: {0}")]
    Streaming(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    pub message: String,
    pub kind: String,
}

impl From<AppError> for ErrorResponse {
    fn from(error: AppError) -> Self {
        let kind = match error {
            AppError::Validation(_) => "validation",
            AppError::Extractor(_) => "extractor",
            AppError::AgeRestricted(_) => "ageRestricted",
            AppError::PrivateContent(_) => "privateContent",
            AppError::PaidContent(_) => "paidContent",
            AppError::GeographicRestriction(_) => "geographicRestriction",
            AppError::MusicPremium(_) => "musicPremium",
            AppError::BotCheckRequired(_) => "botCheckRequired",
            AppError::AccountTerminated(_) => "accountTerminated",
            AppError::ContentNotAvailable(_) => "contentNotAvailable",
            AppError::Database(_) => "database",
            AppError::Streaming(_) => "streaming",
            AppError::Internal(_) => "internal",
        };

        Self {
            message: error.to_string(),
            kind: kind.to_string(),
        }
    }
}
