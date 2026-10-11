# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-11

### Added
- Live map of the Klang Valley with TomTom traffic flow tiles (proxied so the API key stays on the server).
- Jams and incidents from TomTom, sorted by delay, each with a likely cause, its source and a confidence level.
- Rule-based cause detection: TomTom categories, matching Malaysian news headlines (English and Malay), MET Malaysia weather warnings, and weekday rush hours.
- Optional AI cause analysis through any OpenAI-compatible endpoint (Ollama, Groq, Gemini, OpenRouter), with a daily call cap and validated output.
- Weather warning banner (data.gov.my) and a traffic news panel (last 3 hours).
- `GET /api/state` JSON endpoint, version shown in the page footer.
- Self-checks via `npm test`.

[0.1.0]: https://github.com/Etherious0712/traffic-monitor/releases/tag/v0.1.0
