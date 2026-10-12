# Traffic Monitor

Real-time traffic jam monitor for Malaysia that also tries to tell you **why** a road is jammed.
Covers Klang Valley, Penang, Johor Bahru, Ipoh, Melaka, Kuching and Kota Kinabalu. Free to run: no paid APIs, no npm dependencies.

- Live traffic flow on a map (green → red), with a city picker
- Jams and incidents sorted by delay, each with a likely cause: accident, breakdown, roadworks, closure, weather, hazard, event, rush hour or unknown
- Weather warnings from MET Malaysia
- Traffic headlines from Malaysian news (last 3 hours)
- History per city (24 h / 7 days / 30 days): incidents over time, the worst hours of the day, causes, and the most affected roads

## How causes are found

1. **TomTom** already labels many incidents (accident, roadworks, road closed, flooding, broken-down vehicle…). Those are used as-is.
2. Plain "jam" incidents have no cause, so Traffic Monitor looks for one:
   - a news headline from the last 3 hours that names the same road (`E11` also matches "LDP", `FT2` matches "Federal Highway", …) and describes an accident, closure, flood, etc. The headline is linked as the source.
   - an active MET Malaysia rain or thunderstorm warning for that city's state
   - weekday rush hours (07:00–10:00, 17:00–20:00 Malaysia time)
   - otherwise **unknown**. It never makes up a cause.
3. **Optional AI**: point it at any OpenAI-compatible endpoint and the jams still marked "rush hour" or "unknown" get a second look. The AI can only cite links from the news it was given, and anything it can't back up is marked low confidence.

Every cause shows where it came from (TomTom, news, MET Malaysia, rules or AI) and a confidence level.

## Run it

Needs Node.js 22.13 or newer.

```bash
git clone https://github.com/Etherious0712/traffic-monitor.git
cd traffic-monitor
cp .env.example .env     # then add your TomTom key
npm start                # http://localhost:3000
```

Get a free TomTom key at [developer.tomtom.com](https://developer.tomtom.com). No credit card is needed. If you go over the free quota, requests are refused, not billed. Without a key the app still shows news and weather warnings.

### Cities

Set `REGIONS` in `.env` to watch only some cities, for example `REGIONS=klang-valley,penang`. Leave it empty to watch all seven:
`klang-valley`, `penang`, `johor-bahru`, `ipoh`, `melaka`, `kuching`, `kota-kinabalu`.

Each city costs one TomTom call per poll. All seven every 5 minutes is about 2,000 calls a day, inside TomTom's free 2,500. If you add cities or poll more often, raise `POLL_MINUTES`.

### History

Every poll is saved to `data/history.db`, a SQLite file. SQLite is built into Node, so there's nothing to install. Data older than `HISTORY_DAYS` (default 90) is deleted automatically. The file stays on your machine and is never committed.

### Free AI options (optional)

| Provider | `AI_BASE_URL` | Notes |
|---|---|---|
| Ollama (on your machine) | `http://localhost:11434/v1` | Fully free and private; e.g. `AI_MODEL=qwen2.5:7b` |
| Groq | `https://api.groq.com/openai/v1` | Free tier with rate limits |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | Free tier; Google may use free-tier data to improve its products |
| OpenRouter | `https://openrouter.ai/api/v1` | Pick a model ending in `:free` |

`AI_MAX_CALLS_PER_DAY` (default 200) keeps you inside free limits. Each incident is only analysed once.

## Data sources

| Data | Source | Cost |
|---|---|---|
| Traffic flow tiles, incidents | [TomTom Traffic API](https://developer.tomtom.com) | Free tier |
| Weather warnings | [data.gov.my](https://developer.data.gov.my/realtime-api/weather) (MET Malaysia) | Free |
| News headlines | RSS from NST, FMT, Malay Mail, Bernama, Harian Metro, Berita Harian, Sinar Harian | Free (titles and links only) |
| Base map | [OpenFreeMap](https://openfreemap.org) / OpenStreetMap | Free |

TomTom data isn't stored or redistributed. Each person runs the app with their own key.

## Project layout

```
server.js          polling, cause rules, optional AI, API, tile proxy, static files
history.js         SQLite history (snapshots per poll, incidents)
public/index.html  the map page and charts
check.js           self-checks (npm test)
```

- `GET /api/state`: everything the live page shows
- `GET /api/history?region=penang&days=7`: hourly series, delay by hour of day, causes, top roads

## Limits

- City areas are fixed boxes around each city. Add or resize them in `ALL_REGIONS` in `server.js` (TomTom allows up to 10,000 km² per box).
- Weather warnings are matched by state, so a warning for one district counts for the whole state.
- History only records while the app is running.
- Each map view uses TomTom's daily tile quota. That's fine for personal use, but add a tile cache before sharing the app publicly.

## Versioning

[Semantic Versioning](https://semver.org). Changes are listed in [CHANGELOG.md](CHANGELOG.md), and every change lands through a pull request.

## License

[AGPL-3.0](LICENSE). If you run a modified version as a public service, you must share your changes.
