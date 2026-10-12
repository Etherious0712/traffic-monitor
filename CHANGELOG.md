# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [0.2.1] - 2026-10-12

### Fixed
- Weather warnings are matched by district, not just by state. A thunderstorm in Kerian or Hulu Perak no longer explains a jam in Ipoh (Kinta), and "Johor (Segamat)" no longer counts for Johor Bahru.
- Federal routes, which TomTom sends as bare numbers ("2"), now get their names (FT2 Federal Highway). A number in a headline ("2 killed") is no longer taken to mean that route.
- Asian Highway numbers (AH2) are hidden when a local route number is also given.

### Changed
- The incident list uses the same readable road names as history.

## [0.2.0] - 2026-10-12

### Added
- Six more cities: Penang, Johor Bahru, Ipoh, Melaka, Kuching and Kota Kinabalu, with a city picker. Choose which ones to watch with `REGIONS`.
- History saved to a local SQLite file (built into Node, no new dependencies), with `HISTORY_DAYS` retention.
- History panel per city: incidents over time, typical delay by hour of day, causes and most affected roads, for 24 hours, 7 days or 30 days.
- `GET /api/history` endpoint.
- Route names for Penang Bridge, BKE, BORR, the Second Link, EDL, SILK, LEKAS, SKVE and DASH.

### Changed
- Weather warnings are matched to the city they cover, so a storm in Penang no longer explains a jam in KL.
- Each city is fetched separately: one failing city keeps its last data instead of blanking all of them.
- Repeated TomTom errors are shown once.
- Requires Node.js 22.13 or newer.

### Fixed
- Corrected route numbers: LKSA is E13, SKVE is E26 and DASH is E31. The wrong mappings for E36 and E37 were removed.

## [0.1.0] - 2026-10-11

### Added
- Live map of the Klang Valley with TomTom traffic flow tiles (proxied so the API key stays on the server).
- Jams and incidents from TomTom, sorted by delay, each with a likely cause, its source and a confidence level.
- Rule-based cause detection: TomTom categories, matching Malaysian news headlines (English and Malay), MET Malaysia weather warnings, and weekday rush hours.
- Optional AI cause analysis through any OpenAI-compatible endpoint (Ollama, Groq, Gemini, OpenRouter), with a daily call cap and validated output.
- Weather warning banner (data.gov.my) and a traffic news panel (last 3 hours).
- `GET /api/state` JSON endpoint, version shown in the page footer.
- Self-checks via `npm test`.

[0.2.1]: https://github.com/Etherious0712/traffic-monitor/releases/tag/v0.2.1
[0.2.0]: https://github.com/Etherious0712/traffic-monitor/releases/tag/v0.2.0
[0.1.0]: https://github.com/Etherious0712/traffic-monitor/releases/tag/v0.1.0
