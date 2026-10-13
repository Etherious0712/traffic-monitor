# Traffic Monitor

Real-time traffic jam monitor for Malaysia that also tries to tell you **why** a road is jammed.
Covers 27 cities and towns. Free to run: no paid APIs, no npm dependencies.

- **Peninsular:** Klang Valley, Penang, Johor Bahru, Ipoh, Taiping, Melaka, Seremban, Alor Setar, Sungai Petani, Kangar, Kuantan, Kota Bharu, Kuala Terengganu
- **Sabah:** Kota Kinabalu, Sandakan, Tawau, Lahad Datu, Keningau
- **Sarawak:** Kuching, Sri Aman, Sarikei, Sibu, Kapit, Bintulu, Miri, Limbang, Lawas

- Live traffic flow on a map (green → red), with a city picker
- Jams and incidents sorted by delay, each with a likely cause: accident, breakdown, roadworks, closure, weather, hazard, event, rush hour or unknown
- Weather warnings from MET Malaysia
- Traffic headlines from Malaysian news (last 3 hours)
- History per city (24 h / 7 days / 30 days): incidents over time, the worst hours of the day, causes, and the most affected roads
- **Near me**: traffic around you, alerts for what's ahead, your trips, and a link to share your live location

## How causes are found

1. **TomTom** already labels many incidents (accident, roadworks, road closed, flooding, broken-down vehicle…). Those are used as-is.
2. Plain "jam" incidents have no cause, so Traffic Monitor looks for one:
   - a news headline from the last 3 hours that names the same road (`E11` also matches "LDP", `FT2` matches "Federal Highway", …) and describes an accident, closure, flood, etc. The headline is linked as the source.
   - an active MET Malaysia rain or thunderstorm warning that covers that city. Warnings are matched by district, and in Sabah and Sarawak by division: "Miri (Marudi)" doesn't cover Miri town, but "Limbang" on its own covers Limbang and Lawas.
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

### Cities and the free TomTom quota

Each city update is one TomTom call, and the free tier allows 2,500 a day, which isn't enough to update 27 cities every 5 minutes. So:

- the city you're looking at refreshes every 5 minutes (`POLL_MINUTES`)
- every other city refreshes every 3 hours (`SLOW_POLL_MINUTES`)
- after `TOMTOM_DAILY_LIMIT` calls (default 2,400) the app stops calling TomTom until the next UTC day

When you switch to a city that hasn't been updated recently, it refreshes within about 30 seconds. Use `REGIONS` in `.env` to include only some cities, e.g. `REGIONS=klang-valley,penang`.

### History

Every poll is saved to `data/history.db`, a SQLite file. SQLite is built into Node, so there's nothing to install. Data older than `HISTORY_DAYS` (default 90) is deleted automatically. The file stays on your machine and is never committed.

### Near me

Press **📍 Near me** to turn on location. While it's on:

- **The map follows you.** The list shows incidents within 20 km, nearest first. Inside a city, that city refreshes every 5 minutes. Between cities, the server also checks a 20 km box around you.
- **Alerts** for accidents, road closures, severe jams (10 min or more) and roadworks or hazards within 2 km **ahead** of you (±60° of your direction; all around you below 10 km/h).
  - Each incident alerts once, and again only if it gets worse: it becomes a closure, turns out to be an accident, or TomTom raises its severity.
  - Alerts come as a system notification, a sound, a vibration and a spoken message in English, Malay or Chinese.
- **Trips** are recorded automatically: a point every 100 m, and a trip ends after 10 minutes without moving. They're listed under **My trips**. Click one to see its route; ✕ deletes it.
- **Share my location** gives a link that shows only your position, for 15 min, 1 h, 8 h or until you stop. Turning Near me off ends it.

Everything is adjustable in **⚙ Settings**: alert methods, voice language, distances, which incidents alert, and trip recording.

Privacy:

- Your browser makes a random device id. Only that browser can see its trips and stop its shares; there are no accounts.
- Your live position is kept in memory only while Near me is on, and is never shown to other users unless you share it.
- Trips are saved in `data/history.db` until you delete them.

Browsers only allow location on `localhost` or HTTPS, and only while the page is open. Background location comes with the Android app.

### Free AI options (optional)

| Provider                 | `AI_BASE_URL`                                             | Notes                                                            |
| ------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------- |
| Ollama (on your machine) | `http://localhost:11434/v1`                               | Fully free and private; e.g. `AI_MODEL=qwen2.5:7b`               |
| Groq                     | `https://api.groq.com/openai/v1`                          | Free tier with rate limits                                       |
| Google Gemini            | `https://generativelanguage.googleapis.com/v1beta/openai` | Free tier; Google may use free-tier data to improve its products |
| OpenRouter               | `https://openrouter.ai/api/v1`                            | Pick a model ending in `:free`                                   |

`AI_MAX_CALLS_PER_DAY` (default 200) keeps you inside free limits. Each incident is only analysed once.

## Data sources

| Data                          | Source                                                                            | Cost                         |
| ----------------------------- | --------------------------------------------------------------------------------- | ---------------------------- |
| Traffic flow tiles, incidents | [TomTom Traffic API](https://developer.tomtom.com)                                | Free tier                    |
| Weather warnings              | [data.gov.my](https://developer.data.gov.my/realtime-api/weather) (MET Malaysia)  | Free                         |
| News headlines                | RSS from NST, FMT, Malay Mail, Bernama, Harian Metro, Berita Harian, Sinar Harian | Free (titles and links only) |
| Base map                      | [OpenFreeMap](https://openfreemap.org) / OpenStreetMap                            | Free                         |

TomTom data isn't stored or redistributed. Each person runs the app with their own key.

## Project layout

```
server.js          polling, cause rules, optional AI, API, tile proxy, serves public/
history.js         SQLite history (snapshots per poll, incidents)
check.js           self-checks (npm test)
tripstore.js       trip recording (SQLite, per device)
public/
  index.html       page structure, settings dialog
  style.css        styles (light and dark)
  app.js           entry point: state, polling, Near me, events
  map.js           map, traffic-flow layer, incidents, your position, trip routes
  panel.js         header and sidebar: picker, warnings, incident list, news
  charts.js        history charts
  location.js      GPS while Near me is on, reports your position
  alerts.js        which incidents to alert about, and how (notification, sound, vibration, voice)
  settings.js      settings dialog, saved in the browser
  share.js         share my location
  trips.js         My trips list
  share.html       the page people see when they open a shared link (viewer.js)
  geo.js           distances and directions (used by the server too)
  util.js          shared helpers: cause colours, HTML escaping, text formatting
```

`npm run format` formats everything with Prettier (run before committing).

- `GET /api/state`: everything the live page shows
- `GET /api/history?region=penang&days=7`: hourly series, delay by hour of day, causes, top roads
- `POST /api/location`, `DELETE /api/location`: Near me position updates / turned off
- `POST /api/share`, `GET|DELETE /api/share/<token>`: share links
- `GET /api/trips`, `GET|DELETE /api/trips/<id>`: My trips (all take `?device=`)

## Limits

- City areas are fixed boxes around each city. Add or resize them in `ALL_REGIONS` in `server.js` (TomTom allows up to 10,000 km² per box).
- History only records while the app is running, and cities nobody is watching are recorded every 3 hours.
- Each map view uses TomTom's daily tile quota. That's fine for personal use, but add a tile cache before sharing the app publicly.

## Versioning

[Semantic Versioning](https://semver.org). Changes are listed in [CHANGELOG.md](CHANGELOG.md), and every change lands through a pull request.

## License

[AGPL-3.0](LICENSE). If you run a modified version as a public service, you must share your changes.
