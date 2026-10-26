// Keep this estimator aligned with the independently validating Edge Function.
// Values are explicitly indicative: never create a booking or charge a card.
export function calculateQuote({propertyType,bedrooms,bathrooms,frequency}) {
  const b=Number(bedrooms), ba=Number(bathrooms);
  if (!["flat","house"].includes(propertyType) || !Number.isInteger(b) || b<1 || b>6 ||
      !Number.isInteger(ba) || ba<1 || ba>4 ||
      !["one_off","monthly","fortnightly","weekly"].includes(frequency)) {
    throw new Error("invalid_quote_options");
  }
  const quarterHours=8 + b*2 + (ba-1)*2 + (propertyType==="house" ? 2:0);
  const discount=frequency==="weekly"?5:frequency==="fortnightly"?3:0;
  const pricePence=Math.round(2600*quarterHours/4*(100-discount)/100);
  return {quarterHours,discount,pricePence};
}
export const money=(pence)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(pence/100);
