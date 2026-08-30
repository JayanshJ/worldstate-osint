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
    Source("bbc_africa",       "BBC Africa",          SourceType.RSS, 0.85, "https://feeds.bbci.co.uk/news/world/africa/rss.xml"),
    Source("quartz_africa",    "Quartz Africa",       SourceType.RSS, 0.75, "https://qz.com/africa/feed/"),

    # Latin America
    Source("mercopress",      "MercoPress",          SourceType.RSS, 0.70, "https://en.mercopress.com/rss"),
    Source("rio_times",       "Rio Times Brazil",    SourceType.RSS, 0.65, "https://www.riotimesonline.com/feed/"),
    Source("bbc_mundo",       "BBC Mundo",           SourceType.RSS, 0.85, "https://feeds.bbci.co.uk/spanish/news/rss.xml"),
    Source("elpais_en",       "El País (English)",   SourceType.RSS, 0.83, "https://english.elpais.com/rss/"),
    Source("batimes",         "Buenos Aires Times",  SourceType.RSS, 0.68, "https://www.batimes.com.ar/feed/"),

    # Think Tanks & Policy Analysis
    Source("csis",           "CSIS",                SourceType.RSS, 0.88, "https://www.csis.org/rss"),
    Source("rand",           "RAND Corporation",    SourceType.RSS, 0.88, "https://www.rand.org/rss"),
    Source("foreign_policy", "Foreign Policy",      SourceType.RSS, 0.85, "https://foreignpolicy.com/feed/"),
    Source("the_diplomat",   "The Diplomat",        SourceType.RSS, 0.82, "https://thediplomat.com/feed/"),
    Source("war_rocks",      "War on the Rocks",    SourceType.RSS, 0.80, "https://warontherocks.com/feed/"),
    Source("lowy",           "Lowy Institute",      SourceType.RSS, 0.84, "https://www.lowyinstitute.org/rss"),
    Source("brookings",      "Brookings",           SourceType.RSS, 0.88, "https://www.brookings.edu/feed/"),
    Source("carnegie",       "Carnegie Endowment",  SourceType.RSS, 0.87, "https://carnegieendowment.org/rss"),
    Source("iiss",           "IISS",                SourceType.RSS, 0.84, "https://www.iiss.org/rss"),

    # Government & Central Banks
    Source("whitehouse",     "White House",         SourceType.RSS, 0.95, "https://www.whitehouse.gov/feed/"),
    Source("state_dept",     "US State Department", SourceType.RSS, 0.93, "https://www.state.gov/rss-feeds/"),
    Source("us_treasury",    "US Treasury",         SourceType.RSS, 0.95, "https://home.treasury.gov/rss/press-releases"),
    Source("ecb",            "European Central Bank",SourceType.RSS, 0.93, "https://www.ecb.europa.eu/rss/pressbox.html"),
    Source("boe",            "Bank of England",     SourceType.RSS, 0.93, "https://www.bankofengland.co.uk/news/rss"),
    Source("boj",            "Bank of Japan",       SourceType.RSS, 0.92, "https://www.boj.or.jp/en/rss/index.htm"),
    Source("fomc",           "FOMC Statements",     SourceType.RSS, 0.96, "https://www.federalreserve.gov/feeds/monetary_policy.rss"),
    Source("bls",            "Bureau of Labor Stats",SourceType.RSS, 0.94, "https://www.bls.gov/feed/"),
    Source("bis",            "BIS",                 SourceType.RSS, 0.93, "https://www.bis.org/list/press/index.rss"),

    # Defense / Military
    Source("uk_mod",         "UK MoD",              SourceType.RSS, 0.92, "https://www.gov.uk/government/organisations/ministry-of-defence.atom"),
    Source("dod",            "US DoD",              SourceType.RSS, 0.93, "https://www.defense.gov/rss/"),
    Source("nato",           "NATO",                SourceType.RSS, 0.94, "https://www.nato.int/cps/en/natohq/news.rss"),

    # Commodities & Energy
    Source("oilprice",       "OilPrice.com",        SourceType.RSS, 0.75, "https://oilprice.com/rss"),
    Source("rigzone",        "Rigzone",             SourceType.RSS, 0.76, "https://www.rigzone.com/news/rss/"),
    Source("spglobal_energy", "S&P Global Energy",  SourceType.RSS, 0.85, "https://www.spglobal.com/commodityinsights/en/rss"),

    # SEC EDGAR Filings
    Source("sec_8k",         "SEC 8-K Filings",     SourceType.RSS, 0.97, "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom"),
    Source("sec_13d",        "SEC 13D Filings",     SourceType.RSS, 0.95, "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=SC+13D&output=atom"),

    # Newsletters / Independent Analysis
    Source("stratechery",    "Stratechery",         SourceType.RSS, 0.82, "https://stratechery.com/feed/"),
    Source("semafor",        "Semafor",             SourceType.RSS, 0.80, "https://www.semafor.com/feed"),
    Source("punchbowl",      "Punchbowl News",      SourceType.RSS, 0.82, "https://punchbowl.news/feed/"),
    Source("axios",          "Axios",               SourceType.RSS, 0.80, "https://api.axios.com/feed/"),

    # Southeast Asia
    Source("nikkei_asia",     "Nikkei Asia",         SourceType.RSS, 0.84, "https://asia.nikkei.com/rss/feed/nar"),
    Source("straits_times",   "Straits Times",       SourceType.RSS, 0.78, "https://www.straitstimes.com/news/world/rss"),
    Source("jakarta_post",    "Jakarta Post",        SourceType.RSS, 0.72, "https://www.thejakartapost.com/rss"),

    # Europe (non-English / English editions)
    Source("politico_eu",     "Politico Europe",     SourceType.RSS, 0.83, "https://www.politico.eu/rss/"),
    Source("euronews",        "Euronews",            SourceType.RSS, 0.78, "https://www.euronews.com/rss"),
    Source("lemonde_en",      "Le Monde (English)",  SourceType.RSS, 0.82, "https://www.lemonde.fr/rss/en/"),
    Source("spiegel_intl",    "Der Spiegel (Intl)",  SourceType.RSS, 0.82, "https://www.spiegel.de/international/index.rss"),

    # Finance / Business / Markets
    Source("ft_world",        "Financial Times",         SourceType.RSS, 0.92, "https://www.ft.com/world?format=rss"),
    Source("ft_markets",      "FT Markets",              SourceType.RSS, 0.92, "https://www.ft.com/markets?format=rss"),
    Source("wsj_world",       "Wall Street Journal",     SourceType.RSS, 0.90, "https://feeds.a.dj.com/rss/RSSWorldNews.xml"),
    Source("wsj_markets",     "WSJ Markets",             SourceType.RSS, 0.90, "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"),
    Source("wsj_business",    "WSJ Business",            SourceType.RSS, 0.90, "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml"),
    Source("bloomberg_intl",  "Bloomberg Markets",       SourceType.RSS, 0.91, "https://feeds.bloomberg.com/markets/news.rss"),
    Source("bloomberg_tech",  "Bloomberg Technology",    SourceType.RSS, 0.91, "https://feeds.bloomberg.com/technology/news.rss"),
    Source("bloomberg_biz",   "Bloomberg Business",      SourceType.RSS, 0.91, "https://feeds.bloomberg.com/businessweek/news.rss"),
    Source("reuters_biz",     "Reuters Business",        SourceType.RSS, 0.93, "https://feeds.reuters.com/reuters/businessNews"),
    Source("reuters_tech",    "Reuters Technology",      SourceType.RSS, 0.93, "https://feeds.reuters.com/reuters/technologyNews"),
    Source("reuters_mkts",    "Reuters Markets",         SourceType.RSS, 0.93, "https://feeds.reuters.com/reuters/companyNews"),
    Source("cnbc_top",        "CNBC Top News",           SourceType.RSS, 0.86, "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
    Source("cnbc_finance",    "CNBC Finance",            SourceType.RSS, 0.86, "https://www.cnbc.com/id/10000664/device/rss/rss.html"),
    Source("cnbc_tech",       "CNBC Technology",         SourceType.RSS, 0.86, "https://www.cnbc.com/id/19854910/device/rss/rss.html"),
    Source("marketwatch",     "MarketWatch",             SourceType.RSS, 0.84, "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines"),
    Source("seekingalpha",    "Seeking Alpha",           SourceType.RSS, 0.72, "https://seekingalpha.com/market_currents.xml"),
    Source("investopedia",    "Investopedia",            SourceType.RSS, 0.70, "https://www.investopedia.com/feedbuilder/feed/getfeed?feedName=rss_headline"),
    Source("fortune",         "Fortune",                 SourceType.RSS, 0.82, "https://fortune.com/feed/"),
    Source("business_insider","Business Insider",        SourceType.RSS, 0.76, "https://feeds.businessinsider.com/custom/all"),
    Source("yahoo_finance",   "Yahoo Finance",           SourceType.RSS, 0.78, "https://finance.yahoo.com/news/rssindex"),
    Source("economist",       "The Economist",           SourceType.RSS, 0.90, "https://www.economist.com/finance-and-economics/rss.xml"),

    # Forex / Macro / Rates
    Source("fxstreet",        "FX Street",               SourceType.RSS, 0.74, "https://www.fxstreet.com/rss"),
    Source("forexlive",       "Forex Live",              SourceType.RSS, 0.72, "https://www.forexlive.com/feed/news"),
    Source("federalreserve",  "Federal Reserve",         SourceType.RSS, 0.95, "https://www.federalreserve.gov/feeds/press_all.xml"),
    Source("imf_news",        "IMF News",                SourceType.RSS, 0.92, "https://www.imf.org/en/News/rss?language=eng"),
    Source("wsj_economy",     "WSJ Economy",             SourceType.RSS, 0.90, "https://feeds.a.dj.com/rss/RSSEconomy.xml"),

    # Technology — Core publications
    Source("techcrunch",      "TechCrunch",              SourceType.RSS, 0.82, "https://techcrunch.com/feed/"),
    Source("theverge",        "The Verge",               SourceType.RSS, 0.81, "https://www.theverge.com/rss/index.xml"),
    Source("arstechnica",     "Ars Technica",            SourceType.RSS, 0.83, "https://feeds.arstechnica.com/arstechnica/index"),
    Source("wired",           "Wired",                   SourceType.RSS, 0.82, "https://www.wired.com/feed/rss"),
    Source("hackernews",      "Hacker News (Top)",       SourceType.RSS, 0.68, "https://hnrss.org/frontpage"),
    Source("mit_tech",        "MIT Tech Review",         SourceType.RSS, 0.86, "https://www.technologyreview.com/feed/"),
    Source("venturebeat",     "VentureBeat",             SourceType.RSS, 0.76, "https://venturebeat.com/feed/"),
    Source("zdnet",           "ZDNet",                   SourceType.RSS, 0.75, "https://www.zdnet.com/news/rss.xml"),
    Source("infoq",           "InfoQ",                   SourceType.RSS, 0.74, "https://feed.infoq.com/"),

    # Technology — Extended SV / Tech publications
    Source("engadget",        "Engadget",                SourceType.RSS, 0.78, "https://www.engadget.com/rss.xml"),
    Source("gizmodo",         "Gizmodo",                 SourceType.RSS, 0.72, "https://gizmodo.com/rss"),
    Source("fast_company",    "Fast Company",            SourceType.RSS, 0.78, "https://www.fastcompany.com/rss"),
    Source("inc_magazine",    "Inc. Magazine",           SourceType.RSS, 0.76, "https://www.inc.com/rss"),
    Source("the_information",  "The Information",         SourceType.RSS, 0.85, "https://www.theinformation.com/feed"),
    Source("platformer",      "Platformer (Casey Newton)",SourceType.RSS, 0.80, "https://www.platformer.news/feed"),
    Source("stratechery_blog","Stratechery Blog",        SourceType.RSS, 0.82, "https://stratechery.com/feed/"),
    Source("dkb_report",      "DKB Report",               SourceType.RSS, 0.74, "https://dkb.io/feed"),
    Source("six_colors",      "Six Colors",               SourceType.RSS, 0.72, "https://sixcolors.com/feed/"),
    Source("macrumors",       "MacRumors",               SourceType.RSS, 0.68, "https://www.macrumors.com/macrumors.xml"),
    Source("9to5mac",         "9to5Mac",                  SourceType.RSS, 0.70, "https://9to5mac.com/feed/"),
    Source("9to5google",      "9to5Google",               SourceType.RSS, 0.70, "https://9to5google.com/feed/"),
    Source("android_authority","Android Authority",       SourceType.RSS, 0.68, "https://www.androidauthority.com/feed/"),
    Source("xda_developers",  "XDA Developers",           SourceType.RSS, 0.66, "https://www.xda-developers.com/feed/"),

    # Technology — AI / ML focused
    Source("the_decoder",     "The Decoder (AI)",         SourceType.RSS, 0.74, "https://the-decoder.com/feed/"),
    Source("import_ai",      "Import AI",                SourceType.RSS, 0.76, "https://importai.substack.com/feed"),
    Source("synced_review",  "Synced Review (AI)",       SourceType.RSS, 0.72, "https://syncedreview.com/feed/"),
    Source("ai_news",        "AI News",                  SourceType.RSS, 0.68, "https://artificialintelligence-news.com/feed/"),
    Source("unite_ai",       "Unite.ai",                 SourceType.RSS, 0.70, "https://unite.ai/feed/"),

    # Technology — Semiconductor / Hardware
    Source("tomshardware",    "Tom's Hardware",           SourceType.RSS, 0.74, "https://www.tomshardware.com/feeds/all"),
    Source("anandtech",       "AnandTech",                SourceType.RSS, 0.78, "https://www.anandtech.com/rss/"),
    Source("semiconductor_eng","SemiEngineering",         SourceType.RSS, 0.80, "https://semiengineering.com/feed/"),
    Source("ee_times",       "EE Times",                 SourceType.RSS, 0.78, "https://www.eetimes.com/feed/"),

    # Technology — Dev / Engineering / Open Source
    Source("dev_class",      "DevClass",                  SourceType.RSS, 0.72, "https://devclass.com/feed/"),
    Source("theregister",    "The Register",              SourceType.RSS, 0.78, "https://www.theregister.com/headlines.atom"),
    Source("sdtimes",        "SD Times",                 SourceType.RSS, 0.72, "https://sdtimes.com/feed/"),
    Source("jaxenter",       "JAXenter",                  SourceType.RSS, 0.70, "https://jaxenter.com/feed"),

    # Technology — Startup / VC / Deals
    Source("crunchbase_news", "Crunchbase News",          SourceType.RSS, 0.78, "https://news.crunchbase.com/feed/"),
    Source("tech_eu",        "TechEU",                   SourceType.RSS, 0.74, "https://tech.eu/feed/"),
    Source("sifted",         "Sifted",                   SourceType.RSS, 0.76, "https://sifted.eu/feed/"),
    Source("pitchbook",      "Pitchbook News",           SourceType.RSS, 0.80, "https://pitchbook.com/news/rss"),
    Source("axios_pro",      "Axios Pro (Tech)",         SourceType.RSS, 0.78, "https://api.axios.com/feed/?tag=technology"),

    # Technology — China Tech / Asia Tech
    Source("techinasia",     "Tech in Asia",              SourceType.RSS, 0.76, "https://www.techinasia.com/feed"),
    Source("pandaily",       "Pandaily",                 SourceType.RSS, 0.70, "https://pandaily.com/feed/"),
    Source("shenwan",        "ShenWan (China Tech)",      SourceType.RSS, 0.68, "https://en.shenwan.com/feed/"),

    # Crypto / Web3
    Source("coindesk",        "CoinDesk",                SourceType.RSS, 0.78, "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    Source("cointelegraph",   "CoinTelegraph",           SourceType.RSS, 0.74, "https://cointelegraph.com/rss"),
    Source("decrypt",         "Decrypt",                 SourceType.RSS, 0.72, "https://decrypt.co/feed"),
    Source("theblock",        "The Block",               SourceType.RSS, 0.76, "https://www.theblock.co/rss.xml"),
    Source("blockworks",      "Blockworks",              SourceType.RSS, 0.74, "https://blockworks.co/feed"),
    Source("bitcoinmagazine", "Bitcoin Magazine",        SourceType.RSS, 0.70, "https://bitcoinmagazine.com/.rss/full/"),
    Source("cryptoslate",     "CryptoSlate",             SourceType.RSS, 0.68, "https://cryptoslate.com/feed/"),
    Source("cryptonews",      "CryptoNews",              SourceType.RSS, 0.66, "https://cryptonews.com/news/feed/"),
    Source("dlnews",          "DL News",                 SourceType.RSS, 0.73, "https://www.dlnews.com/arc/outboundfeeds/rss/"),
]

# ─── Reddit Sources ───────────────────────────────────────────────────────
REDDIT_SOURCES: list[Source] = [
    # Global / Breaking
    Source("reddit_worldnews",  "r/worldnews",         SourceType.REDDIT, 0.40, extra={"subreddit": "worldnews",        "limit": 25}),
    Source("reddit_breaking",   "r/breakingnews",      SourceType.REDDIT, 0.35, extra={"subreddit": "breakingnews",     "limit": 15}),
    Source("reddit_geopolit",   "r/geopolitics",       SourceType.REDDIT, 0.45, extra={"subreddit": "geopolitics",      "limit": 20}),
    # Middle East
    Source("reddit_iran",       "r/iran",              SourceType.REDDIT, 0.38, extra={"subreddit": "iran",             "limit": 15}),
    Source("reddit_middleeast", "r/MiddleEastNews",    SourceType.REDDIT, 0.40, extra={"subreddit": "MiddleEastNews",   "limit": 20}),
    # Europe / Russia
    Source("reddit_ukrnews",    "r/ukraine",           SourceType.REDDIT, 0.38, extra={"subreddit": "ukraine",          "limit": 15}),
    Source("reddit_europe",     "r/europe",            SourceType.REDDIT, 0.38, extra={"subreddit": "europe",           "limit": 15}),
    # Asia
    Source("reddit_china",      "r/China",             SourceType.REDDIT, 0.37, extra={"subreddit": "China",            "limit": 15}),
    Source("reddit_india",      "r/india",             SourceType.REDDIT, 0.37, extra={"subreddit": "india",            "limit": 15}),
    # Americas / Africa
    Source("reddit_latam",      "r/LatinAmerica",      SourceType.REDDIT, 0.37, extra={"subreddit": "LatinAmerica",     "limit": 15}),
    Source("reddit_africa",     "r/Africa",            SourceType.REDDIT, 0.37, extra={"subreddit": "Africa",           "limit": 15}),

    # Finance / Investing
    Source("reddit_investing",  "r/investing",         SourceType.REDDIT, 0.48, extra={"subreddit": "investing",        "limit": 25}),
    Source("reddit_stocks",     "r/stocks",            SourceType.REDDIT, 0.46, extra={"subreddit": "stocks",           "limit": 25}),
    Source("reddit_finance",    "r/finance",           SourceType.REDDIT, 0.47, extra={"subreddit": "finance",          "limit": 20}),
    Source("reddit_economics",  "r/economics",         SourceType.REDDIT, 0.50, extra={"subreddit": "economics",        "limit": 20}),
    Source("reddit_wsb",        "r/wallstreetbets",    SourceType.REDDIT, 0.38, extra={"subreddit": "wallstreetbets",   "limit": 15}),
    Source("reddit_secanalysis","r/SecurityAnalysis",  SourceType.REDDIT, 0.52, extra={"subreddit": "SecurityAnalysis", "limit": 15}),
    Source("reddit_valueinvest","r/ValueInvesting",    SourceType.REDDIT, 0.50, extra={"subreddit": "ValueInvesting",   "limit": 15}),
    Source("reddit_personalfin","r/personalfinance",   SourceType.REDDIT, 0.44, extra={"subreddit": "personalfinance",  "limit": 15}),
    Source("reddit_forex",      "r/Forex",             SourceType.REDDIT, 0.48, extra={"subreddit": "Forex",             "limit": 25}),
    Source("reddit_algotrading","r/algotrading",       SourceType.REDDIT, 0.52, extra={"subreddit": "algotrading",       "limit": 20}),
    Source("reddit_bonds",      "r/bonds",             SourceType.REDDIT, 0.48, extra={"subreddit": "bonds",             "limit": 15}),
    Source("reddit_options",    "r/options",           SourceType.REDDIT, 0.46, extra={"subreddit": "options",           "limit": 20}),
    Source("reddit_futures",    "r/Futures",           SourceType.REDDIT, 0.46, extra={"subreddit": "Futures",           "limit": 15}),

    # Technology
    Source("reddit_technology", "r/technology",        SourceType.REDDIT, 0.46, extra={"subreddit": "technology",       "limit": 25}),
    Source("reddit_tech",       "r/tech",              SourceType.REDDIT, 0.43, extra={"subreddit": "tech",             "limit": 20}),
    Source("reddit_programming","r/programming",       SourceType.REDDIT, 0.48, extra={"subreddit": "programming",      "limit": 20}),
    Source("reddit_ai",         "r/artificial",        SourceType.REDDIT, 0.46, extra={"subreddit": "artificial",       "limit": 20}),
    Source("reddit_machlearn",  "r/MachineLearning",   SourceType.REDDIT, 0.52, extra={"subreddit": "MachineLearning",  "limit": 15}),
    Source("reddit_cybersec",   "r/cybersecurity",     SourceType.REDDIT, 0.48, extra={"subreddit": "cybersecurity",    "limit": 15}),
    Source("reddit_netsec",     "r/netsec",            SourceType.REDDIT, 0.50, extra={"subreddit": "netsec",           "limit": 15}),

    # Business
    Source("reddit_business",   "r/business",          SourceType.REDDIT, 0.45, extra={"subreddit": "business",         "limit": 20}),
    Source("reddit_entrepreneur","r/Entrepreneur",     SourceType.REDDIT, 0.42, extra={"subreddit": "Entrepreneur",     "limit": 15}),
    Source("reddit_startups",   "r/startups",          SourceType.REDDIT, 0.44, extra={"subreddit": "startups",         "limit": 15}),

    # Crypto / Web3
    Source("reddit_bitcoin",    "r/Bitcoin",           SourceType.REDDIT, 0.45, extra={"subreddit": "Bitcoin",          "limit": 25}),
    Source("reddit_ethereum",   "r/ethereum",          SourceType.REDDIT, 0.44, extra={"subreddit": "ethereum",         "limit": 20}),
    Source("reddit_crypto",     "r/CryptoCurrency",    SourceType.REDDIT, 0.42, extra={"subreddit": "CryptoCurrency",   "limit": 25}),
    Source("reddit_defi",       "r/defi",              SourceType.REDDIT, 0.42, extra={"subreddit": "defi",             "limit": 15}),
    Source("reddit_cryptomkts", "r/CryptoMarkets",     SourceType.REDDIT, 0.40, extra={"subreddit": "CryptoMarkets",    "limit": 15}),
    Source("reddit_solana",     "r/solana",            SourceType.REDDIT, 0.40, extra={"subreddit": "solana",           "limit": 15}),
    Source("reddit_web3",       "r/web3",              SourceType.REDDIT, 0.40, extra={"subreddit": "web3",             "limit": 15}),
]

# ─── Twitter/X Alpha Accounts ─────────────────────────────────────────────
# Tier-1: Wire services & official breaking news
TWITTER_SOURCES: list[Source] = [
    Source("tw_reutersalerts", "Reuters Breaking",      SourceType.TWITTER, 0.95, extra={"user_id": "1652541"}),
    Source("tw_ap",            "AP Breaking News",      SourceType.TWITTER, 0.93, extra={"user_id": "14208058"}),
    Source("tw_bbreaking",     "BBC Breaking News",     SourceType.TWITTER, 0.90, extra={"user_id": "5402612"}),
    Source("tw_nytimes",       "NYT Breaking",          SourceType.TWITTER, 0.85, extra={"user_id": "807095"}),
    Source("tw_guardian",      "The Guardian",          SourceType.TWITTER, 0.83, extra={"user_id": "87818409"}),
    Source("tw_wsj",           "WSJ Breaking",          SourceType.TWITTER, 0.90, extra={"user_id": "3108351"}),
    Source("tw_ft",            "Financial Times",       SourceType.TWITTER, 0.90, extra={"user_id": "18949452"}),
    Source("tw_bloomberg",     "Bloomberg Markets",     SourceType.TWITTER, 0.91, extra={"user_id": "372377800"}),
    Source("tw_cnbc",          "CNBC Now",              SourceType.TWITTER, 0.85, extra={"user_id": "20402945"}),
    Source("tw_reuters_biz",   "Reuters Business",      SourceType.TWITTER, 0.93, extra={"user_id": "19505502"}),

    # Finance alpha — macro traders & analysts
    Source("tw_zerohedge",     "ZeroHedge",             SourceType.TWITTER, 0.60, extra={"user_id": "125164203"}),
    Source("tw_raoul_pal",     "Raoul Pal (RealVision)", SourceType.TWITTER, 0.72, extra={"user_id": "277513636"}),
    Source("tw_elerianm",      "Mohamed El-Erian",      SourceType.TWITTER, 0.82, extra={"user_id": "50323071"}),
    Source("tw_nfergus",       "Niall Ferguson",        SourceType.TWITTER, 0.78, extra={"user_id": "26733484"}),
    Source("tw_abnormalret",   "Abnormal Returns",      SourceType.TWITTER, 0.70, extra={"user_id": "14244871"}),
    Source("tw_jesse_livermore","Jesse Livermore",      SourceType.TWITTER, 0.68, extra={"user_id": "387498928"}),
    Source("tw_markets_live",  "Bloomberg Live Blog",   SourceType.TWITTER, 0.88, extra={"user_id": "31049364"}),
    Source("tw_lisaabramowicz", "Lisa Abramowicz",      SourceType.TWITTER, 0.82, extra={"user_id": "84245501"}),
    Source("tw_tracyalloway",  "Tracy Alloway",         SourceType.TWITTER, 0.82, extra={"user_id": "87867532"}),

    # Crypto / Web3 alpha
    Source("tw_coindesk",      "CoinDesk",              SourceType.TWITTER, 0.76, extra={"user_id": "1333467482"}),
    Source("tw_cointelegraph", "CoinTelegraph",         SourceType.TWITTER, 0.72, extra={"user_id": "528874339"}),
    Source("tw_theblock",      "The Block",             SourceType.TWITTER, 0.74, extra={"user_id": "1005131649148067840"}),
    Source("tw_vitalik",       "Vitalik Buterin",       SourceType.TWITTER, 0.80, extra={"user_id": "295218901"}),
    Source("tw_saylor",        "Michael Saylor",        SourceType.TWITTER, 0.70, extra={"user_id": "244647486"}),
    Source("tw_cz_binance",    "CZ Binance",            SourceType.TWITTER, 0.68, extra={"user_id": "902926941413453824"}),
    Source("tw_aantonop",      "Andreas Antonopoulos",  SourceType.TWITTER, 0.74, extra={"user_id": "16921209"}),
    Source("tw_wuBlockchain",  "Wu Blockchain",         SourceType.TWITTER, 0.70, extra={"user_id": "1114529388808736768"}),
    Source("tw_tier10k",       "Tier10k (DeFi)",        SourceType.TWITTER, 0.65, extra={"user_id": "1222970799764684801"}),
    Source("tw_pentosh1",      "Pentoshi",              SourceType.TWITTER, 0.63, extra={"user_id": "1012779291916689408"}),

    # Tech alpha — founders, operators, journalists
    Source("tw_sama",          "Sam Altman (OpenAI)",   SourceType.TWITTER, 0.80, extra={"user_id": "188191815"}),
    Source("tw_ylecun",        "Yann LeCun (Meta AI)",  SourceType.TWITTER, 0.82, extra={"user_id": "1139786297"}),
    Source("tw_karpathy",      "Andrej Karpathy",       SourceType.TWITTER, 0.80, extra={"user_id": "33836629"}),
    Source("tw_elonmusk",      "Elon Musk",             SourceType.TWITTER, 0.70, extra={"user_id": "44196397"}),
    Source("tw_paulg",         "Paul Graham (YC)",      SourceType.TWITTER, 0.76, extra={"user_id": "20171516"}),
    Source("tw_benedictevans", "Benedict Evans",        SourceType.TWITTER, 0.78, extra={"user_id": "15143391"}),
    Source("tw_stratechery",   "Ben Thompson (Strat.)", SourceType.TWITTER, 0.80, extra={"user_id": "27186785"}),
    Source("tw_avc",           "Fred Wilson (AVC/USV)", SourceType.TWITTER, 0.74, extra={"user_id": "1393628"}),
    Source("tw_techcrunch",    "TechCrunch",            SourceType.TWITTER, 0.80, extra={"user_id": "816653"}),
    Source("tw_verge",         "The Verge",             SourceType.TWITTER, 0.79, extra={"user_id": "430000804"}),
]

# ─── All sources combined ─────────────────────────────────────────────────
ALL_SOURCES: list[Source] = RSS_SOURCES + REDDIT_SOURCES + TWITTER_SOURCES

SOURCE_MAP: dict[str, Source] = {s.id: s for s in ALL_SOURCES}


def get_credibility(source_id: str) -> float:
    """Return credibility weight for a given source_id, defaulting to 0.3."""
    return SOURCE_MAP.get(source_id, Source("unknown", "Unknown", SourceType.RSS, 0.3)).credibility
