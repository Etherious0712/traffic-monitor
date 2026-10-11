import assert from 'node:assert/strict';
import { causeOf, parseRss, isTrafficNews, isPeakHour, relevantWarnings, validateAi, safePath, mentions, roadTokens } from './server.js';

const SUNDAY_NOON = new Date('2026-10-11T04:00:00Z'); // 12:00 MYT
const MONDAY_8AM = new Date('2026-10-12T00:00:00Z'); // 08:00 MYT
const jam = { id: 'j1', iconCategory: 6, roadNumbers: ['E11'], from: 'Puchong (Jalan Puchong)', to: 'Sunway', delay: 600 };
const news = [
  { title: 'Kemalangan di LDP arah Puchong, lalu lintas sesak', link: 'https://x.my/1', time: 0 },
  { title: 'Haze: schools closed tomorrow', link: 'https://x.my/2', time: 0 },
];

// TomTom category wins
assert.equal(causeOf({ ...jam, iconCategory: 1 }, [], [], SUNDAY_NOON).cause, 'accident');
assert.equal(causeOf({ ...jam, iconCategory: 9 }, [], [], SUNDAY_NOON).source, 'TomTom');

// Jam + news mentioning the road (via route alias E11 -> LDP)
const viaNews = causeOf(jam, news, [], SUNDAY_NOON);
assert.equal(viaNews.cause, 'accident');
assert.deepEqual(viaNews.evidence, ['https://x.my/1']);

// News about another road doesn't count; then weather, then peak hour, then unknown
const other = { ...jam, roadNumbers: ['E5'], from: 'Klang', to: 'Shah Alam' };
assert.equal(causeOf(other, news, [], SUNDAY_NOON).cause, 'unknown');
assert.equal(causeOf(other, news, [], MONDAY_8AM).cause, 'peak_hour');
assert.equal(causeOf(other, news, [{ title: 'Thunderstorm Warning', text: '' }], MONDAY_8AM).cause, 'weather');

// "PLUS" only matches the highway name, not the English word
assert.ok(mentions('Crash on PLUS near Rawang', roadTokens({ roadNumbers: ['E1'] })));
assert.ok(!mentions('Budget plus incentives announced', roadTokens({ roadNumbers: ['E1'] })));

// News filter
assert.ok(isTrafficNews('Kemalangan di LDP'));
assert.ok(isTrafficNews('Massive traffic jam on Federal Highway'));
assert.ok(isTrafficNews('Jalan Klang Lama ditutup akibat banjir kilat'));
assert.ok(!isTrafficNews('Ringgit opens higher against US dollar'));
assert.ok(!isTrafficNews('Jerebu: Sekolah di Hulu Langat ditutup'));
assert.ok(!isTrafficNews('Danish apologises to rival Kelso after crash'));

// Peak hours are Malaysia time, weekdays only
assert.ok(isPeakHour(MONDAY_8AM));
assert.ok(!isPeakHour(SUNDAY_NOON));

// RSS parsing (CDATA + entities)
const items = parseRss(`<rss><channel><title>Feed</title><item><title><![CDATA[Jalan ditutup &amp; sesak]]></title>
  <link><![CDATA[https://a.my/x]]></link><pubDate>Sun, 11 Oct 2026 18:52:27 +0800</pubDate></item></channel></rss>`, 'a.my');
assert.deepEqual(items, [{ title: 'Jalan ditutup & sesak', link: 'https://a.my/x', time: Date.parse('2026-10-11T10:52:27Z'), source: 'a.my' }]);

// Weather: active, in region, not marine
const w = (title, text, from = '2026-10-11T00:00:00', to = '2026-10-11T23:00:00') =>
  ({ warning_issue: { title_en: title }, heading_en: title, text_en: text, valid_from: from, valid_to: to });
const warnings = relevantWarnings([
  w('Thunderstorms Warning', 'Thunderstorms over Selangor and Kuala Lumpur'),
  w('Strong Winds and Rough Seas Warning', 'waters of Selangor'),
  w('Thunderstorms Warning', 'Thunderstorms over Kelantan'),
  w('Thunderstorms Warning', 'Selangor', '2026-10-10T00:00:00', '2026-10-10T23:00:00'),
], SUNDAY_NOON);
assert.equal(warnings.length, 1);

// AI output is validated: bad cause -> unknown, invented links dropped, no evidence -> low confidence
const ai = validateAi({ cause: 'aliens', confidence: 'high', summary: 'x', evidence_urls: ['https://made.up'] }, news);
assert.deepEqual([ai.cause, ai.evidence, ai.confidence], ['unknown', [], 'high']);
const ai2 = validateAi({ cause: 'accident', confidence: 'high', evidence_urls: ['https://made.up'] }, news);
assert.equal(ai2.confidence, 'low');
assert.deepEqual(validateAi({ cause: 'accident', confidence: 'high', evidence_urls: ['https://x.my/1'] }, news).evidence, ['https://x.my/1']);

// Static files can't escape public/
assert.ok(safePath('/'));
assert.equal(safePath('/../server.js'), null);
assert.equal(safePath('/%2e%2e/package.json'), null);
assert.equal(safePath('/%E0%A4%A'), null);

console.log('all checks passed');
