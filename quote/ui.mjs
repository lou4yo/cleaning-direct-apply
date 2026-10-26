import {calculateQuote,money} from "./logic.mjs";
const root=document.getElementById("quote-form");
const total=document.getElementById("quote-total");
const hours=document.getElementById("quote-hours");
const priceGrid=document.getElementById("frequency-grid");
const status=document.getElementById("submit-status");
const button=document.getElementById("save-button");
const API="https://cntynkumizvpiajmfzcj.supabase.co/functions/v1/quote-recovery-intake";
const OPTIONS=[["one_off","One-off"],["monthly","Monthly"],["fortnightly","Fortnightly"],["weekly","Weekly"]];
let idempotencyKey=crypto.randomUUID().replaceAll("-","");
function fields(){
  return {
    service:"standard",
    propertyType:root.elements.propertyType.value,
    bedrooms:Number(root.elements.bedrooms.value),
    bathrooms:Number(root.elements.bathrooms.value),
    frequency:root.elements.frequency.value,
  };
}
function render(){
  try{
    const opts=fields();
    const estimated=calculateQuote(opts);
    total.textContent=money(estimated.pricePence);
    hours.textContent=(estimated.quarterHours/4).toLocaleString("en-GB")+" estimated cleaning hours";
    priceGrid.innerHTML="";
    for(const [value,label] of OPTIONS) {
      const q=calculateQuote({...opts,frequency:value});
      const item=document.createElement("div");
      item.className="option-card"+(value===opts.frequency?" selected":"");
      const strong=document.createElement("strong");strong.textContent=label;
      const span=document.createElement("span");span.textContent=money(q.pricePence)+" per clean";
      const caption=document.createElement("small");caption.textContent=q.discount?(`Includes ${q.discount}% repeat discount`):"Standard rate";
      item.append(strong,span,caption);priceGrid.appendChild(item);
    }
  }catch {total.textContent="—";hours.textContent="Select your property details.";}
}
for(const name of ["propertyType","bedrooms","bathrooms","frequency"]){
  root.elements[name].addEventListener("change",render);
}
render();
root.addEventListener("submit",async(event)=>{
  event.preventDefault();
  if(!root.reportValidity()) return;
  const p=fields();
  const q=calculateQuote(p);
  status.textContent="Saving your free enquiry securely…";
  status.className="status";
  button.disabled=true;
  const payload={
    ...p,idempotencyKey,
    firstName:root.elements.firstName.value.trim(),
    email:root.elements.email.value.trim(),
    phone:root.elements.phone.value.trim(),
    postcode:root.elements.postcode.value.trim(),
    contactConsent:root.elements.contactConsent.checked,
    marketingConsent:root.elements.marketingConsent.checked,
    website:root.elements.website.value,
    utmSource:new URLSearchParams(location.search).get("utm_source")||"direct",
    utmMedium:new URLSearchParams(location.search).get("utm_medium")||"none",
    utmCampaign:new URLSearchParams(location.search).get("utm_campaign")||"none",
  };
  try{
    const res=await fetch(API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.ok!==true)throw Error("Unable to save your enquiry right now. Your details have not been confirmed as saved; please retry.");
    const displayPrice=typeof data.pricePence==="number"?data.pricePence:q.pricePence;
    status.className="status ok";
    status.textContent="Enquiry saved. Reference: "+(data.reference||"already received")+
       ". Your indicative price is "+money(displayPrice)+" per clean. No booking or payment has been taken. We’ll contact you when suitable verified cleaners become available.";
    button.textContent="Enquiry received";
    root.elements.contactConsent.disabled=true;
  }catch(err){
    status.className="status error";
    status.textContent=err instanceof Error?err.message:"Unable to save your enquiry. Please retry.";
    button.disabled=false;
    return;
  }
});
