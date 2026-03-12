"""
Source Registry — defines every monitored source with its credibility weight.

Credibility scale:
  0.9–1.0  Tier-1 wire services (Reuters, AP, AFP)
  0.7–0.89 Major outlets (Al Jazeera, BBC, Guardian)
  0.5–0.69 Secondary outlets, verified social accounts
  0.3–0.49 Aggregators, Reddit (high-signal but unverified)
  0.1–0.29 Anonymous Telegram, unknown socials
"""

from dataclasses import dataclass, field
from enum import StrEnum


class SourceType(StrEnum):
    RSS        = "rss"
    PLAYWRIGHT = "playwright"
    REDDIT     = "reddit"
    TWITTER    = "twitter"
    TELEGRAM   = "telegram"


@dataclass(frozen=True)
class Source:
    id: str                         # unique slug, used as source_id in DB
    name: str                       # human-readable label
    source_type: SourceType
    credibility: float              # [0, 1]
    url: str = ""                   # RSS feed URL or base URL for scrapers
    extra: dict = field(default_factory=dict)  # source-specific config


# ─── RSS Sources ──────────────────────────────────────────────────────────
RSS_SOURCES: list[Source] = [
    # Tier-1 Wire Services
    # Note: feeds.reuters.com and feeds.apnews.com were discontinued ~2020.
    # Reuters/AP coverage now comes via aggregators below (Yahoo, ABC, NPR).
    Source("yahoo_world",     "Yahoo News World",    SourceType.RSS, 0.80, "https://news.yahoo.com/rss/world"),
    Source("abc_news_intl",   "ABC News Intl",       SourceType.RSS, 0.82, "https://abcnews.go.com/abcnews/internationalheadlines"),

    # Tier-2 Major Outlets
    Source("aljazeera",       "Al Jazeera",          SourceType.RSS, 0.82, "https://www.aljazeera.com/xml/rss/all.xml"),
    Source("bbc_world",       "BBC World",           SourceType.RSS, 0.88, "https://feeds.bbci.co.uk/news/world/rss.xml"),
    Source("guardian_world",  "The Guardian World",  SourceType.RSS, 0.83, "https://www.theguardian.com/world/rss"),
    Source("france24",        "France 24",           SourceType.RSS, 0.80, "https://www.france24.com/en/rss"),
    Source("dw_news",         "Deutsche Welle",      SourceType.RSS, 0.82, "https://rss.dw.com/xml/rss-en-world"),
    Source("sky_news",        "Sky News World",      SourceType.RSS, 0.80, "https://feeds.skynews.com/feeds/rss/world.xml"),
    Source("npr_world",       "NPR World",           SourceType.RSS, 0.84, "https://feeds.npr.org/1004/rss.xml"),

    # Middle East / Conflict Focused
    Source("times_of_israel", "Times of Israel",     SourceType.RSS, 0.78, "https://www.timesofisrael.com/feed/"),
    Source("iran_intl",       "Iran International",  SourceType.RSS, 0.76, "https://www.iranintl.com/en/rss.xml"),
    Source("middle_east_eye", "Middle East Eye",     SourceType.RSS, 0.74, "https://www.middleeasteye.net/rss"),
    # Russia / Eastern Europe
    Source("moscow_times",    "The Moscow Times",    SourceType.RSS, 0.74, "https://www.themoscowtimes.com/rss/news"),

    # Asia / Pacific
    Source("scmp_world",      "South China Morning Post", SourceType.RSS, 0.80, "https://www.scmp.com/rss/91/feed"),
    Source("nhk_world",       "NHK World Japan",     SourceType.RSS, 0.82, "https://www3.nhk.or.jp/rss/news/cat0.xml"),
    Source("cna_world",       "Channel NewsAsia",    SourceType.RSS, 0.78, "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511"),
    Source("abc_au",          "ABC Australia",       SourceType.RSS, 0.80, "https://www.abc.net.au/news/feed/51120/rss.xml"),

    # South Asia
    Source("dawn_pk",         "Dawn (Pakistan)",     SourceType.RSS, 0.72, "https://www.dawn.com/feed"),
    Source("the_hindu",       "The Hindu",           SourceType.RSS, 0.75, "https://www.thehindu.com/news/international/feeder/default.rss"),

    # Africa
    Source("allafrica",       "AllAfrica",           SourceType.RSS, 0.65, "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf"),
    Source("mail_guardian",   "Mail & Guardian",     SourceType.RSS, 0.72, "https://mg.co.za/feed/"),

    # Latin America
    Source("mercopress",      "MercoPress",          SourceType.RSS, 0.70, "https://en.mercopress.com/rss"),
    Source("rio_times",       "Rio Times Brazil",    SourceType.RSS, 0.65, "https://www.riotimesonline.com/feed/"),

    # Finance / Business
    Source("ft_world",        "Financial Times",     SourceType.RSS, 0.92, "https://www.ft.com/world?format=rss"),
    Source("wsj_world",       "Wall Street Journal", SourceType.RSS, 0.90, "https://feeds.a.dj.com/rss/RSSWorldNews.xml"),
    Source("bloomberg_intl",  "Bloomberg Markets",   SourceType.RSS, 0.91, "https://feeds.bloomberg.com/markets/news.rss"),
]

# ─── Reddit Sources ───────────────────────────────────────────────────────
REDDIT_SOURCES: list[Source] = [
    # Global / Breaking
    Source("reddit_worldnews",  "r/worldnews",       SourceType.REDDIT, 0.40, extra={"subreddit": "worldnews",     "limit": 25}),
    Source("reddit_breaking",   "r/breakingnews",    SourceType.REDDIT, 0.35, extra={"subreddit": "breakingnews",  "limit": 15}),
    Source("reddit_geopolit",   "r/geopolitics",     SourceType.REDDIT, 0.45, extra={"subreddit": "geopolitics",   "limit": 20}),
    # Middle East
    Source("reddit_iran",       "r/iran",            SourceType.REDDIT, 0.38, extra={"subreddit": "iran",          "limit": 15}),
    Source("reddit_middleeast", "r/MiddleEastNews",  SourceType.REDDIT, 0.40, extra={"subreddit": "MiddleEastNews","limit": 20}),
    # Europe / Russia
    Source("reddit_ukrnews",    "r/ukraine",         SourceType.REDDIT, 0.38, extra={"subreddit": "ukraine",       "limit": 15}),
    Source("reddit_europe",     "r/europe",          SourceType.REDDIT, 0.38, extra={"subreddit": "europe",        "limit": 15}),
    # Asia
    Source("reddit_china",      "r/China",           SourceType.REDDIT, 0.37, extra={"subreddit": "China",         "limit": 15}),
    Source("reddit_india",      "r/india",           SourceType.REDDIT, 0.37, extra={"subreddit": "india",         "limit": 15}),
    # Americas / Africa
    Source("reddit_latam",      "r/LatinAmerica",    SourceType.REDDIT, 0.37, extra={"subreddit": "LatinAmerica",  "limit": 15}),
    Source("reddit_africa",     "r/Africa",          SourceType.REDDIT, 0.37, extra={"subreddit": "Africa",        "limit": 15}),
]

# ─── Twitter/X Alpha Accounts ─────────────────────────────────────────────
# High-credibility verified journalists / agencies
TWITTER_SOURCES: list[Source] = [
    Source("tw_reutersalerts", "Reuters Breaking",  SourceType.TWITTER, 0.95, extra={"user_id": "1652541"}),
    Source("tw_ap",            "AP Breaking News",  SourceType.TWITTER, 0.93, extra={"user_id": "14208058"}),
    Source("tw_bbreaking",     "BBC Breaking News", SourceType.TWITTER, 0.90, extra={"user_id": "5402612"}),
    Source("tw_nytimes",       "NYT Breaking",      SourceType.TWITTER, 0.85, extra={"user_id": "807095"}),
    Source("tw_guardian",      "The Guardian",      SourceType.TWITTER, 0.83, extra={"user_id": "87818409"}),
]

# ─── All sources combined ─────────────────────────────────────────────────
ALL_SOURCES: list[Source] = RSS_SOURCES + REDDIT_SOURCES + TWITTER_SOURCES

SOURCE_MAP: dict[str, Source] = {s.id: s for s in ALL_SOURCES}


def get_credibility(source_id: str) -> float:
    """Return credibility weight for a given source_id, defaulting to 0.3."""
    return SOURCE_MAP.get(source_id, Source("unknown", "Unknown", SourceType.RSS, 0.3)).credibility
