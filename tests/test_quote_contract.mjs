import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calculateQuote} from "../quote/logic.mjs";

test("small flat has an affordable positive-contribution estimate", ()=>{
  const q=calculateQuote({propertyType:"flat",bedrooms:1,bathrooms:1,frequency:"weekly"});
  assert.deepEqual(q,{quarterHours:10,discount:5,pricePence:6175});
  assert.ok(q.pricePence > (q.quarterHours/4)*1800);
});
test("weekly discount cannot make customer price loss-making against £18/hour", ()=>{
  for(const propertyType of ["flat","house"])for(let bedrooms=1;bedrooms<=6;bedrooms++)
    for(let bathrooms=1;bathrooms<=4;bathrooms++)
      for(const frequency of ["weekly","fortnightly","monthly","one_off"]){
        const q=calculateQuote({propertyType,bedrooms,bathrooms,frequency});
        assert.ok(q.pricePence > q.quarterHours/4*1800);
        assert.ok(q.pricePence<=30000);
      }
});
test("malformed options rejected",()=>{
  assert.throws(()=>calculateQuote({propertyType:"house",bedrooms:7,bathrooms:1,frequency:"weekly"}));
});
test("frontend-only files do not include private server credentials or bookings",()=>{
  const html=readFileSync(new URL("../quote/index.html",import.meta.url),"utf8");
  const js=readFileSync(new URL("../quote/ui.mjs",import.meta.url),"utf8");
  assert.match(html,/contactConsent/);
  assert.match(html,/marketingConsent/);
  assert.match(html,/cleaning.direct\/privacy/);
  assert.match(html,/No card/);
  assert.match(html,/no area is currently confirmed open/i);
  assert.doesNotMatch(html+js,/sb_secret_|service.role.key\s*[:=]|sk_test_|sk_live_/i);
  assert.doesNotMatch(js,/bookings\.insert|payment_intent|stripe/i);
});
test("backend uses service role server-side and forbids anonymous data reads",()=>{
  const server=readFileSync(new URL("../supabase/functions/quote-recovery-intake/index.ts",import.meta.url),"utf8");
  assert.match(server,/Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(server,/contactConsent !== true/);
  assert.match(server,/marketingConsent !== "boolean"/);
  assert.match(server,/error\.code === "23505"/);
  assert.match(server,/claim_customer_quote_recovery_slot/);
  assert.match(server,/crypto\.subtle\.sign\("HMAC"/);
});


test("published Surrey guide figures match estimator and link to a real quote page",()=>{
  const guide=readFileSync(new URL("../guides/surrey-domestic-cleaning-prices/index.html",import.meta.url),"utf8");
  for (const c of [
    {p:"flat",bedrooms:1,bathrooms:1,price:"£61.75"},
    {p:"flat",bedrooms:2,bathrooms:1,price:"£74.10"},
    {p:"house",bedrooms:2,bathrooms:2,price:"£98.80"},
    {p:"house",bedrooms:3,bathrooms:2,price:"£111.15"}
  ]){
    const q=calculateQuote({propertyType:c.p,bedrooms:c.bedrooms,bathrooms:c.bathrooms,frequency:"weekly"});
    assert.equal(new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(q.pricePence/100),c.price);
    assert.ok(guide.includes(c.price));
  }
  assert.match(guide,/no postcode is currently confirmed as open/i);
  assert.match(guide,/\.\.\/\.\.\/quote/);
  assert.match(guide,/not a claim about the Surrey market average/i);
});


test("surrey organic traffic lands on accessible fast quote and proper social preview",()=>{
  const html=readFileSync(new URL("../quote/index.html",import.meta.url),"utf8");
  const css=readFileSync(new URL("../quote/styles.css",import.meta.url),"utf8");
  assert.match(html,/href="#quote-form"/);
  assert.match(html,/No account, password, card or joining fee required/i);
  assert.match(html,/property="og:url" content="https:\/\/lou4yo\.github\.io\/cleaning-direct-apply\/quote\/"/);
  assert.match(html,/property="og:image"/);
  assert.match(html,/name="twitter:card" content="summary_large_image"/);
  assert.match(css,/\.hero-jump:focus-visible/);
  assert.match(html,/no area is currently confirmed open for paid booking/i);
});


test("quote form stores campaign attribution without browser identity tracking",()=>{
  const ui=readFileSync(new URL("../quote/ui.mjs",import.meta.url),"utf8");
  const server=readFileSync(new URL("../supabase/functions/quote-recovery-intake/index.ts",import.meta.url),"utf8");
  const sql=readFileSync(new URL("../supabase/migrations/20261026_customer_quote_referral_attribution.sql",import.meta.url),"utf8");
  for(const field of ["utmSource","utmMedium","utmCampaign"]) assert.ok(ui.includes(field));
  for(const field of ["attribution_source","attribution_medium","attribution_campaign"]) assert.ok(server.includes(field));
  assert.match(sql,/customer_quote_recovery_queue/);
  assert.match(sql,/RLS stays enabled/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|document\.cookie/i);
});
