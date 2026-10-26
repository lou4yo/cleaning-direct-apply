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
