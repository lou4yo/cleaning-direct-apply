import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Owner directive 26 Oct 2026: no quote or cleaner application should collect
// personal data on this obsolete GitHub Pages origin. The actual hosted
// cleaning.direct site must pass separate real lead-save/RTW launch gates.
function read(path) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

const retired = new Map([
  ["index.html", "https://cleaning.direct/cleaners/apply"],
  ["account/index.html", "https://cleaning.direct/login"],
  ["assignment-requirements/index.html", "https://cleaning.direct/login"],
  ["legal-pack/index.html", "https://cleaning.direct/cleaners/apply"],
  ["rtw/index.html", "https://cleaning.direct/login"],
  ["quote/index.html", "https://cleaning.direct/book"],
]);

test("every legacy intake route is a noindex static notice without a form or side effects", () => {
  for (const [path, firstParty] of retired) {
    const html = read(path);
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
    assert.ok(html.includes('rel="canonical" href="' + firstParty + '"'), path);
    assert.ok(html.includes('href="' + firstParty + '"'), path);
    assert.doesNotMatch(html, /<form\b|<input\b|<script\b|<iframe\b/i, path);
    assert.doesNotMatch(html, /supabase\.co|neon\.tech|fetch\s*\(|XMLHttpRequest|stripe\.com/i, path);
    assert.match(html, /no longer accepts personal details/i, path);
  }
});

test("retired quote route cannot claim a booking, payment or saved lead", () => {
  const html = read("quote/index.html");
  assert.match(html, /non-binding estimates/i);
  assert.match(html, /checkout remains disabled/i);
  assert.match(html, /retired page will not save an enquiry/i);
});

test("off-domain educational pages link only to the official quote entrypoint", () => {
  for (const path of ["areas/index.html", "guides/surrey-domestic-cleaning-prices/index.html"]) {
    const html = read(path);
    assert.ok(html.includes("https://cleaning.direct/book"), path);
    assert.doesNotMatch(html, /href\s*=\s*["'](?:\.\.\/)+quote(?:\/|\?)/i, path);
    assert.doesNotMatch(html, /href\s*=\s*["']https?:\/\/lou4yo\.github\.io\/cleaning-direct-apply\/quote/i, path);
  }
});

test("sitemap excludes obsolete off-domain quote and quick-application routes", () => {
  const sitemap = read("sitemap.xml");
  assert.doesNotMatch(sitemap, /cleaning-direct-apply\/(?:quote|quick)\//i);
  assert.match(sitemap, /cleaning-direct-apply\/areas\//i);
});

test("first-party destination is never an off-domain prototype", () => {
  for (const [path, expected] of retired) {
    const html = read(path);
    assert.ok(expected.startsWith("https://cleaning.direct/"), path);
    assert.doesNotMatch(html, /href\s*=\s*["']https?:\/\/(?:lou4yo\.)?github\.io/i, path);
  }
});
