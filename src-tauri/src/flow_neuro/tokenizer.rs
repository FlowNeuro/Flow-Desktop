use std::collections::HashSet;
use std::sync::OnceLock;

use rust_stemmers::{Algorithm, Stemmer};
use whatlang::{Lang, detect};

const GENERIC_TOKEN_WEIGHT: f64 = 0.18;

pub fn normalize_lemma(word: &str) -> String {
    let normalized = normalize_surface_token(word);
    if normalized.is_empty() {
        return normalized;
    }

    stem_token(&normalized, Lang::Eng)
}

pub fn strip_domain_tag(topic: &str) -> String {
    match topic.find(':') {
        Some(index) if index > 0 => topic[..index].to_string(),
        _ => topic.to_string(),
    }
}

fn detected_language(text: &str) -> Lang {
    detect(text).map(|info| info.lang()).unwrap_or(Lang::Eng)
}

fn stemmer_algorithm(lang: Lang) -> Option<Algorithm> {
    match lang {
        Lang::Ara => Some(Algorithm::Arabic),
        Lang::Dan => Some(Algorithm::Danish),
        Lang::Nld => Some(Algorithm::Dutch),
        Lang::Eng => Some(Algorithm::English),
        Lang::Fin => Some(Algorithm::Finnish),
        Lang::Fra => Some(Algorithm::French),
        Lang::Deu => Some(Algorithm::German),
        Lang::Ell => Some(Algorithm::Greek),
        Lang::Hun => Some(Algorithm::Hungarian),
        Lang::Ita => Some(Algorithm::Italian),
        Lang::Nob => Some(Algorithm::Norwegian),
        Lang::Por => Some(Algorithm::Portuguese),
        Lang::Ron => Some(Algorithm::Romanian),
        Lang::Rus => Some(Algorithm::Russian),
        Lang::Spa => Some(Algorithm::Spanish),
        Lang::Swe => Some(Algorithm::Swedish),
        Lang::Tam => Some(Algorithm::Tamil),
        Lang::Tur => Some(Algorithm::Turkish),
        _ => None,
    }
}

fn stop_word_language_code(lang: Lang) -> Option<&'static str> {
    match lang {
        Lang::Afr => Some("af"),
        Lang::Ara => Some("ar"),
        Lang::Ben => Some("bn"),
        Lang::Bul => Some("bg"),
        Lang::Cat => Some("ca"),
        Lang::Ces => Some("cs"),
        Lang::Cmn => Some("zh"),
        Lang::Dan => Some("da"),
        Lang::Deu => Some("de"),
        Lang::Ell => Some("el"),
        Lang::Eng => Some("en"),
        Lang::Epo => Some("eo"),
        Lang::Est => Some("et"),
        Lang::Fin => Some("fi"),
        Lang::Fra => Some("fr"),
        Lang::Heb => Some("he"),
        Lang::Hin => Some("hi"),
        Lang::Hrv => Some("hr"),
        Lang::Hun => Some("hu"),
        Lang::Hye => Some("hy"),
        Lang::Ind => Some("id"),
        Lang::Ita => Some("it"),
        Lang::Jpn => Some("ja"),
        Lang::Kor => Some("ko"),
        Lang::Lat => Some("la"),
        Lang::Lav => Some("lv"),
        Lang::Lit => Some("lt"),
        Lang::Mar => Some("mr"),
        Lang::Nld => Some("nl"),
        Lang::Nob => Some("no"),
        Lang::Pol => Some("pl"),
        Lang::Por => Some("pt"),
        Lang::Ron => Some("ro"),
        Lang::Rus => Some("ru"),
        Lang::Slk => Some("sk"),
        Lang::Slv => Some("sl"),
        Lang::Spa => Some("es"),
        Lang::Swe => Some("sv"),
        Lang::Tgl => Some("tl"),
        Lang::Tha => Some("th"),
        Lang::Tur => Some("tr"),
        Lang::Ukr => Some("uk"),
        Lang::Urd => Some("ur"),
        Lang::Vie => Some("vi"),
        Lang::Zul => Some("zu"),
        _ => None,
    }
}

fn language_stop_words(lang: Lang) -> HashSet<String> {
    match stop_word_language_code(lang) {
        Some(code) => stop_words::get(code)
            .into_iter()
            .map(|word| normalize_surface_token(&word))
            .filter(|word| !word.is_empty())
            .collect(),
        None => HashSet::new(),
    }
}

fn normalize_surface_token(token: &str) -> String {
    token
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

fn normalize_text_to_words(text: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();

    for c in text.to_lowercase().chars() {
        if c.is_alphanumeric() {
            current.push(c);
        } else if !current.is_empty() {
            words.push(std::mem::take(&mut current));
        }
    }

    if !current.is_empty() {
        words.push(current);
    }

    words
}

fn stem_token(token: &str, lang: Lang) -> String {
    match stemmer_algorithm(lang) {
        Some(algorithm) => Stemmer::create(algorithm).stem(token).into_owned(),
        None => token.to_string(),
    }
}

pub fn get_youtube_stop_words() -> &'static HashSet<&'static str> {
    static INSTANCE: OnceLock<HashSet<&'static str>> = OnceLock::new();
    INSTANCE.get_or_init(|| {
        [
            "official",
            "channel",
            "video",
            "videos",
            "tutorial",
            "tutorials",
            "full",
            "episode",
            "part",
            "update",
            "hdr",
            "uhd",
            "fps",
            "live",
            "stream",
            "watch",
            "subscribe",
            "like",
            "comment",
            "share",
            "click",
            "link",
            "description",
            "below",
            "check",
            "dont",
            "miss",
            "must",
            "now",
            "1080p",
            "720p",
            "480p",
            "360p",
            "240p",
            "144p",
            "compilation",
            "montage",
            "reupload",
            "reup",
            "reuploaded",
            "tricks",
            "hack",
            "hacks",
            "lesson",
            "course",
            "class",
            "session",
            "step",
            "steps",
            "ways",
            "things",
            "stuff",
            "beginner",
            "beginners",
            "advanced",
            "intermediate",
            "basic",
            "basics",
            "introduction",
            "intro",
            "everything",
            "anything",
            "nothing",
            "something",
            "complete",
            "ultimate",
            "definitive",
            "easy",
            "simple",
            "hard",
            "difficult",
            "free",
            "paid",
            "cheap",
            "expensive",
            "first",
            "last",
            "next",
            "previous",
            "prompt",
            "prompts",
            "prompting",
            "amazing",
            "insane",
            "crazy",
            "incredible",
            "unbelievable",
            "shocking",
            "exposed",
            "revealed",
            "secret",
            "secrets",
            "honest",
            "truth",
            "proof",
            "finally",
            "use",
            "used",
            "using",
            "need",
            "want",
            "know",
            "help",
            "find",
            "look",
            "looking",
            "get",
            "got",
            "getting",
            "give",
            "gave",
            "keep",
            "kept",
            "tell",
            "told",
            "say",
            "said",
            "start",
            "stop",
            "try",
            "take",
            "took",
            "really",
            "actually",
            "literally",
            "basically",
            "ever",
            "never",
            "always",
            "every",
            "still",
            "also",
            "too",
            "very",
            "only",
            "then",
            "than",
            "well",
            "even",
        ]
        .iter()
        .cloned()
        .collect()
    })
}

pub fn get_generic_words() -> &'static HashSet<String> {
    static INSTANCE: OnceLock<HashSet<String>> = OnceLock::new();
    INSTANCE.get_or_init(|| {
        let words = [
            "day",
            "video",
            "new",
            "best",
            "top",
            "latest",
            "music",
            "song",
            "build",
            "make",
            "game",
            "science",
            "technology",
            "tech",
            "sport",
            "food",
            "news",
            "show",
            "thing",
            "stuff",
            "way",
            "part",
            "level",
            "review",
            "reaction",
            "guide",
        ];

        words
            .iter()
            .flat_map(|word| tokenize_unigrams_with_lang(word, Lang::Eng))
            .collect()
    })
}

#[allow(dead_code)]
pub fn get_stop_words() -> &'static HashSet<&'static str> {
    get_youtube_stop_words()
}

pub fn get_priority_bigrams() -> &'static HashSet<String> {
    static INSTANCE: OnceLock<HashSet<String>> = OnceLock::new();
    INSTANCE.get_or_init(|| {
        let phrases = [
            "leg day",
            "roblox thief",
            "train model",
            "train ai",
            "machine learn",
            "deep learn",
            "neural network",
            "train data",
            "fine tune",
            "train network",
            "train system",
            "build model",
            "build ai",
            "build network",
            "react native",
            "react component",
            "react hook",
            "react app",
            "react tutorial",
            "react project",
            "build system",
            "build tool",
            "build project",
            "run test",
            "run code",
            "run server",
            "run script",
            "design pattern",
            "design system",
            "web design",
            "game design",
            "sound design",
            "power plant",
            "plant base",
            "plant based",
            "spring boot",
            "spring framework",
            "stream deck",
            "stream setup",
            "film make",
            "film edit",
            "film score",
            "scale model",
            "block chain",
            "host server",
            "web development",
            "web app",
            "web site",
            "bass guitar",
            "bass drop",
            "sound track",
            "race track",
            "speed run",
            "play through",
            "build guide",
            "build order",
            "craft recipe",
            "mine craft",
        ];

        phrases
            .iter()
            .filter_map(|phrase| {
                let words = tokenize_unigrams_with_lang(phrase, Lang::Eng);
                (words.len() == 2).then(|| format!("{} {}", words[0], words[1]))
            })
            .collect()
    })
}

pub fn get_polysemous_words() -> &'static HashSet<&'static str> {
    static INSTANCE: OnceLock<HashSet<&'static str>> = OnceLock::new();
    INSTANCE.get_or_init(|| {
        [
            "train", "model", "build", "plant", "stream", "react", "design", "film", "run", "play",
            "cook", "fire", "spring", "match", "cell", "power", "drive", "board", "frame", "scale",
            "lead", "light", "block", "drop", "track", "craft", "host", "mine", "pitch", "wave",
            "bass", "bow", "clip", "dart", "fan", "gear", "jam", "kit", "lab", "log", "net", "pad",
            "port", "rig", "set", "tap", "tip", "web", "metal", "rock", "bar",
        ]
        .iter()
        .cloned()
        .collect()
    })
}

/// High-value short topic tokens that survive the minimum-length filter.
/// These are real interests (acronyms, formats) the default `len > 2` rule would drop.
fn short_topic_allowlist() -> &'static HashSet<&'static str> {
    static INSTANCE: OnceLock<HashSet<&'static str>> = OnceLock::new();
    INSTANCE.get_or_init(|| {
        ["ai", "ml", "ar", "vr", "ui", "ux", "dj", "f1", "3d", "4k", "8k", "dc", "ev", "nft"]
            .into_iter()
            .collect()
    })
}

/// Hyphen/symbol compounds collapsed into single tokens before whitespace splitting,
/// so genre/brand terms ("lo-fi", "k-pop", "r&b") are not shredded into sub-2-char fragments.
const COMPOUND_REPLACEMENTS: &[(&str, &str)] = &[
    ("lo-fi", "lofi"),
    ("lo fi", "lofi"),
    ("hip-hop", "hiphop"),
    ("hip hop", "hiphop"),
    ("k-pop", "kpop"),
    ("k pop", "kpop"),
    ("j-pop", "jpop"),
    ("sci-fi", "scifi"),
    ("sci fi", "scifi"),
    ("r&b", "rnb"),
];

fn normalize_compounds(text: &str) -> String {
    let mut lowered = text.to_lowercase();
    for (pattern, replacement) in COMPOUND_REPLACEMENTS {
        if lowered.contains(pattern) {
            lowered = lowered.replace(pattern, replacement);
        }
    }
    lowered
}

fn is_year_token(word: &str) -> bool {
    word.len() == 4 && word.starts_with("20") && word.chars().all(|c| c.is_ascii_digit())
}

fn is_segmentable_cjk(c: char) -> bool {
    matches!(c as u32,
        0x3040..=0x30FF   // Hiragana + Katakana
        | 0x3400..=0x4DBF // CJK Extension A
        | 0x4E00..=0x9FFF // CJK Unified Ideographs (Han)
        | 0x0E00..=0x0E7F // Thai
    )
}

fn contains_segmentable_cjk(word: &str) -> bool {
    word.chars().any(is_segmentable_cjk)
}

/// Overlapping character bigrams: the standard dependency-free segmentation for no-space scripts
/// (Chinese/Japanese/Thai), where whitespace splitting yields one useless mega-token. A lone
/// character degrades to a unigram. Korean is space-delimited, so it keeps the normal word path.
fn cjk_character_bigrams(word: &str) -> Vec<String> {
    let chars: Vec<char> = word.chars().collect();
    if chars.len() <= 1 {
        return chars.iter().map(|c| c.to_string()).collect();
    }
    chars.windows(2).map(|pair| pair.iter().collect()).collect()
}

pub fn is_generic_word(token: &str) -> bool {
    !token.contains('_') && !token.contains(' ') && get_generic_words().contains(token)
}

pub fn unigram_weight_multiplier(token: &str) -> f64 {
    if is_generic_word(token) {
        GENERIC_TOKEN_WEIGHT
    } else {
        1.0
    }
}

fn tokenize_unigrams_with_lang(text: &str, lang: Lang) -> Vec<String> {
    let grammatical_stop_words = language_stop_words(lang);

    normalize_text_to_words(&normalize_compounds(text))
        .into_iter()
        .flat_map(|word| {
            // No-space scripts arrive as one run; index them as overlapping character bigrams
            // instead of a single useless mega-token.
            if contains_segmentable_cjk(&word) {
                return cjk_character_bigrams(&word);
            }
            // Allowlisted short topics are authoritative: kept verbatim, never stemmed or filtered.
            if short_topic_allowlist().contains(word.as_str()) {
                return vec![word];
            }
            if word.chars().count() <= 2
                || is_year_token(&word)
                || grammatical_stop_words.contains(word.as_str())
                || get_youtube_stop_words().contains(word.as_str())
            {
                return Vec::new();
            }
            let stemmed = stem_token(&word, lang);
            if stemmed.is_empty() {
                Vec::new()
            } else {
                vec![stemmed]
            }
        })
        .collect()
}

pub fn tokenize_unigrams(text: &str) -> Vec<String> {
    tokenize_unigrams_with_lang(text, detected_language(text))
}

pub fn tokenize(text: &str) -> Vec<String> {
    let unigrams = tokenize_unigrams(text);
    let mut tokens = unigrams.clone();

    for window in unigrams.windows(2) {
        let left = &window[0];
        let right = &window[1];
        if left.is_empty() || right.is_empty() {
            continue;
        }
        tokens.push(format!("{}_{}", left, right));
    }

    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_contextual_bigrams() {
        assert_eq!(
            tokenize("Leg Day"),
            vec!["leg".to_string(), "day".to_string(), "leg_day".to_string()]
        );
    }

    #[test]
    fn dampens_generic_unigrams_only() {
        assert!(unigram_weight_multiplier("day") < 0.25);
        assert_eq!(unigram_weight_multiplier("leg_day"), 1.0);
    }

    #[test]
    fn filters_stop_words_before_stemming() {
        let tokens = tokenize("Running coded official tutorial 1080p");

        assert!(tokens.contains(&"run".to_string()));
        assert!(tokens.contains(&"code".to_string()));
        assert!(tokens.contains(&"run_code".to_string()));
        assert!(!tokens.iter().any(|token| token.contains("official")));
        assert!(!tokens.iter().any(|token| token.contains("tutorial")));
        assert!(!tokens.iter().any(|token| token.contains("1080p")));
    }

    #[test]
    fn applies_language_specific_stop_words_and_stemming() {
        let tokens = tokenize_unigrams_with_lang("el corriendo comidas", Lang::Spa);

        assert!(!tokens.contains(&"el".to_string()));
        assert!(!tokens.contains(&"corriendo".to_string()));
        assert!(!tokens.contains(&"comidas".to_string()));
        assert!(tokens.len() >= 2);
    }

    #[test]
    fn keeps_high_value_short_tokens() {
        let tokens = tokenize_unigrams("AI and ML for 3D art");
        assert!(tokens.contains(&"ai".to_string()));
        assert!(tokens.contains(&"ml".to_string()));
        assert!(tokens.contains(&"3d".to_string()));
    }

    #[test]
    fn collapses_genre_compounds_into_single_tokens() {
        let tokens = tokenize_unigrams("Lo-Fi and K-Pop and R&B mix");
        assert!(tokens.contains(&"lofi".to_string()));
        assert!(tokens.contains(&"kpop".to_string()));
        assert!(tokens.contains(&"rnb".to_string()));
    }

    #[test]
    fn forms_priority_bigram_with_short_topic() {
        assert!(tokenize("train ai").contains(&"train_ai".to_string()));
    }

    #[test]
    fn segments_no_space_cjk_into_character_bigrams() {
        let tokens = tokenize_unigrams("机器学习");
        assert!(tokens.contains(&"机器".to_string()));
        assert!(tokens.contains(&"学习".to_string()));
        assert!(tokens.len() >= 3);
    }

    #[test]
    fn unsupported_stop_word_languages_do_not_panic() {
        let shona_tokens = tokenize_unigrams_with_lang("zviri official", Lang::Sna);
        let azeri_tokens = tokenize_unigrams_with_lang("salam official", Lang::Aze);

        assert_eq!(shona_tokens, vec!["zviri".to_string()]);
        assert_eq!(azeri_tokens, vec!["salam".to_string()]);
    }
}
