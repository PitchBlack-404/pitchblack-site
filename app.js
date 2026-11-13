
const CFG = window.PITCHBLACK_CONFIG || {};
const SUPABASE_URL = CFG.SUPABASE_URL || "";
const SUPABASE_KEY = CFG.SUPABASE_ANON_KEY || "";
const ADMIN_EMAILS = (CFG.ADMIN_EMAILS || []).map(e=>e.toLowerCase());
const COINS = CFG.COINS || [];
const FALLBACK = CFG.FALLBACK_RATES_NGN || {};
const WA = "https://wa.me/2349016755312";
const SETUP_PENDING = !SUPABASE_URL || SUPABASE_URL.includes("YOUR-PROJECT") || !SUPABASE_KEY || SUPABASE_KEY === "YOUR-SUPABASE-ANON-KEY";
const $ = s=>document.querySelector(s);
const esc = s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtNgn = n=>"₦"+Number(n||0).toLocaleString("en-NG",{maximumFractionDigits:0});
const fmtCrypto = (n,d)=>Number(n||0).toLocaleString("en-GB",{maximumFractionDigits:d??6,minimumFractionDigits:0});
const fmtDate = iso=>new Date(iso).toLocaleString();

// minimal supabase client fetch helper (no SDK needed for static)
let _session = JSON.parse(localStorage.getItem("pb_session")||"null");
async function sb(path,method="GET",body){
  if(SETUP_PENDING) throw new Error("setup pending");
  const h={"apikey":SUPABASE_KEY,"Content-Type":"application/json"};
  if(_session?.access_token) h["Authorization"]="Bearer "+_session.access_token;
  const res = await fetch(SUPABASE_URL+"/rest/v1/"+path,{method,headers:h,body:body?JSON.stringify(body):undefined});
  const text = await res.text();
  let data; try{data=JSON.parse(text)}catch{data=text}
  if(!res.ok) throw new Error((data?.message||text||res.status));
  return data;
}
async function signIn(email,password){
  const res=await fetch(SUPABASE_URL+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password})});
  const data=await res.json();
  if(!res.ok) throw new Error(data.error_description||data.msg||"sign in failed");
  _session=data; localStorage.setItem("pb_session",JSON.stringify(data)); return data;
}
async function signUp(email,password,whatsapp,fullname,country,state){
  const res=await fetch(SUPABASE_URL+"/auth/v1/signup",{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password,data:{whatsapp:whatsapp||"",fullname:fullname||"",country:country||"",state:state||"",referred_by:(new URLSearchParams(location.search).get("ref")||"")}})});
  const data=await res.json();
  if(!res.ok) throw new Error(data.error_description||data.msg||"sign up failed");
  if(data.access_token){_session=data; localStorage.setItem("pb_session",JSON.stringify(data));}
  return data;
}
async function resetPasswordForEmail(email){
  const redirectTo = location.origin + location.pathname;
  const res=await fetch(SUPABASE_URL+"/auth/v1/recover",{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email,redirect_to:redirectTo})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error_description||data.msg||data.message||"reset failed");
  return data;
}
async function updateUserPassword(password){
  if(!_session?.access_token) throw new Error("recovery session not found");
  const res=await fetch(SUPABASE_URL+"/auth/v1/user",{method:"PUT",headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+_session.access_token,"Content-Type":"application/json"},body:JSON.stringify({password})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error_description||data.msg||data.message||"update failed");
  if(data.user) _session={..._session,user:data.user};
  localStorage.setItem("pb_session",JSON.stringify(_session));
  return data;
}
function parseRecoveryHash(){
  // supabase-js detectSessionInUrl: hash contains access_token, refresh_token, type=recovery
  if(!location.hash || location.hash.startsWith("#/") ) {
    // also check for hash not starting with #/ (supabase puts tokens directly after #)
    // if hash starts with #/ it's router, not recovery
    if(!location.hash) return null;
    if(location.hash.startsWith("#/")) return null;
  }
  const raw = location.hash.replace(/^#/, "");
  const params = new URLSearchParams(raw);
  const access_token=params.get("access_token"), refresh_token=params.get("refresh_token"), type=params.get("type");
  if(access_token && (type==="recovery"||params.has("access_token"))){
    return {access_token, refresh_token, type: type||"recovery"};
  }
  return null;
}
function isRecoveryFlow(){
  const h = location.hash||"";
  return h.includes("access_token=") && (h.includes("type=recovery")||!h.startsWith("#/"));
}
async function signOut(){ _session=null; localStorage.removeItem("pb_session"); await supabaseUser(); }
async function supabaseUser(){ return _session?.user||null; }
const isAdmin = u=> !!u && ADMIN_EMAILS.includes((u.email||"").toLowerCase());

// rates
let RATES={...FALLBACK}, RATE_SOURCE="fallback", RATE_TS=null;
async function loadRates(){
  const ids=COINS.map(c=>c.coingeckoId).join(",");
  if(!ids) return;
  try{
    const res=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=ngn&include_last_updated_at=true`,{cache:"no-store"});
    if(res.ok){
      const data=await res.json();
      COINS.forEach(c=>{ if(data[c.coingeckoId]?.ngn) RATES[c.code]=data[c.coingeckoId].ngn; });
      RATE_SOURCE="live (CoinGecko)"; RATE_TS=new Date().toLocaleString();
    } else { RATE_SOURCE="fallback (CoinGecko unreachable: "+res.status+")"; RATE_TS=new Date().toLocaleString(); }
  }catch(e){ RATE_SOURCE="fallback (offline)"; RATE_TS=new Date().toLocaleString(); }
  render();
}
function rateBadge(){ return RATE_SOURCE.includes("live") ? `<span class="pill completed">${esc(RATE_SOURCE)}</span>` : `<span class="pill pending">${esc(RATES["BTC"]?RATE_SOURCE:"rates unavailable")}</span>`; }

// header auth links
async function renderNav(){
  const u=await supabaseUser();
  const el=$("#navAuth"); if(!el) return;
  if(SETUP_PENDING){ el.innerHTML=`<span class="mut small">setup pending</span>`; return; }
  if(u){ el.innerHTML=`<a href="#/dashboard">Dashboard</a> <a href="#" id="signOutBtn">Sign out (${esc(u.email)})</a>`;
    $("#signOutBtn").onclick=async e=>{e.preventDefault(); await signOut(); location.hash="#/auth"; renderNav();};
  } else { el.innerHTML=`<a href="#/auth">Login / Sign up</a>`; }
}

// router
window.addEventListener("hashchange", render);
async function render(){
  await renderNav();
  const h=location.hash||"#/";
  const app=$("#app");
  // supabase detectSessionInUrl: recovery links land with #access_token=...&type=recovery (not #/...)
  if(isRecoveryFlow()){
    location.hash="#/auth"; 
    // render auth immediately (renderAuth will parse recovery hash before router strips it)
    // keep hash intact until renderAuth reads it: restore it
    history.replaceState(null,"", location.pathname+"#"+(h.startsWith("#")?h.slice(1):h));
    return renderAuth(app);
  }
  if(h.startsWith("#/rates")) return renderRates(app);
  if(h.startsWith("#/auth")) return renderAuth(app);
  if(h.startsWith("#/dashboard")) return renderDashboard(app);
  if(h.startsWith("#/receipt")) return renderReceipt(app);
  if(h.startsWith("#/admin")) return renderAdmin(app);
  return renderHome(app);
}

function waBtn(text){ return `<a class="btn primary" href="${WA}" target="_blank" rel="noopener">${text||"Chat on WhatsApp"}</a>`; }
function setupNotice(){
  if(!SETUP_PENDING) return "";
  return `<div class="notice"><b>Setup pending.</b> This OTC demo UI is live, but accounts and trades open once the Supabase keys are in <span class="mono">config.js</span>. Rates below still update from the public API. Questions? <a href="${WA}" target="_blank">WhatsApp +2349016755312</a>.</div>`;
}

function renderHome(app){
  const rateCards=COINS.map(c=>`<div class="rate"><div class="sub">${esc(c.code)} · ${esc(c.name)}</div><b>${fmtNgn(RATES[c.code])}</b><div class="sub">per 1 ${esc(c.code)}</div></div>`).join("");
  app.innerHTML=`
  <section class="hero">
    <div class="kicker">PitchBlack OTC</div>
    <h1>Buy &amp; sell crypto.<br>With naira, on WhatsApp.</h1>
    <p>BTC, USDT, USDC, ETH, BNB, SOL, XRP, DOGE, TRX and more. Place a buy or sell request, get your rate, and the PitchBlack desk settles manually on WhatsApp. No wallet custody, no fake balances.</p>
    <div class="cta"><a class="btn primary" href="#/dashboard">Start a trade</a> <a class="btn" href="#/rates">See live rates</a> ${waBtn()}</div>
  </section>
  ${setupNotice()}
  <section><div class="row"><h2>Live NGN rates ${rateBadge()}</h2><span class="small mut">${esc(RATE_TS||"")}</span></div><div class="rategrid">${rateCards}</div></section>
  <section class="card"><h2>How it works</h2>
    <ol>
      <li><b>Sign up</b> with email + password.</li>
      <li><b>Place a request</b>: buy (naira &#8594; coin) or sell (coin &#8594; naira).</li>
      <li><b>The desk confirms</b> on WhatsApp before any transfer.</li>
      <li>Rates are live-checked on every page load; anything you see here is display-only, your confirmed rate is the one quoted on WhatsApp.</li>
    </ol>
    <p class="mut small">PitchBlack is a manual OTC desk. We do not hold customer funds, and this site is not a wallet or an exchange. Education and rate display are not financial advice.</p>
  </section>
`;
}

function renderRates(app){
  const hist=await (async()=>{ try{ return await sb("rate_history?select=*&order=day.desc&limit=200"); }catch(e){ return []; } })();
  const byCoin=c=>{ const pts=hist.filter(r=>r.coin===c.code).slice(0,7).reverse(); if(pts.length<2)return"";
    const vs=pts.map(p=>Number(p.rate_ngn)), mn=Math.min(...vs), mx=Math.max(...vs), W=90,H=26;
    const path=vs.map((v,i)=>`${i?"L":"M"}${(i/(vs.length-1)*W).toFixed(1)},${(H-(v-mn)/((mx-mn)||1)*H).toFixed(1)}`).join("");
    const up=vs[vs.length-1]>=vs[0];
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${path}" fill="none" stroke="${up?"#22c55e":"#ef4444"}" stroke-width="2"/></svg>`; };
  const rows=COINS.map(c=>`<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td>${fmtNgn(RATES[c.code])} <span class="mut small">(desk spread included, ~${c.code==="BTC"||c.code==="ETH"?"1.5":"2"}%)</span></td><td>${hist7(c)||byCoin(c)}</td><td class="mut">${esc(c.note||"")}</td></tr>`).join("");
  app.innerHTML=`<h1>NGN rates ${rateBadge()}</h1>
  <p class="mut small">Source: CoinGecko public API, fetched client-side on every page load. Fallback table in config.js is used when the API is unreachable.</p>
  <div class="card" style="overflow:auto"><table><thead><tr><th>Coin</th><th>Name</th><th>NGN per coin</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>
  ${waBtn("Trade on WhatsApp")}`;
}

async function renderAuth(app){
  if(SETUP_PENDING){
    app.innerHTML=`<h1>Sign in</h1>${setupNotice()}<div class="card"><h2>Create your account</h2>
    <p class="mut">Supabase is not wired yet (placeholder keys in config.js). The exact steps are in README.md: create a free project at supabase.com, paste the URL + anon key into config.js, run supabase-schema.sql, push.</p>
    <p>${waBtn("Ask on WhatsApp")}</p></div>`;
    return;
  }
  // Recovery flow: if page loaded with supabase recovery token in URL hash, show set-new-password form
  const rec = parseRecoveryHash();
  if(rec){
    // supabase-js detectSessionInUrl equivalent: store session from hash
    try{
      const res=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+rec.access_token}});
      if(res.ok){
        const user=await res.json();
        _session={access_token:rec.access_token, refresh_token:rec.refresh_token||"", user, token_type:"bearer", expires_at: Math.floor(Date.now()/1000)+3600};
        localStorage.setItem("pb_session",JSON.stringify(_session));
      }
    }catch(e){}
    app.innerHTML=`<h1>Set new password</h1>
    <div class="card"><form id="resetNewForm">
      <label>New password<input name="password" type="password" required minlength="6" autocomplete="new-password"></label>
      <label>Confirm password<input name="confirm" type="password" required minlength="6" autocomplete="new-password"></label>
      <button class="btn primary" style="margin-top:14px">Update password</button>
      <p class="mut small" id="resetNewMsg"></p>
    </form></div>`;
    $("#resetNewForm").onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target), pw=f.get("password"), cf=f.get("confirm");
      const msg=$("#resetNewMsg");
      if(pw!==cf){ msg.textContent="Passwords do not match."; return; }
      msg.textContent="Working…";
      try{
        await updateUserPassword(pw);
        // clean hash so refresh doesn't re-show recovery form
        history.replaceState(null,"",location.pathname);
        location.hash="#/dashboard"; render();
      }catch(err){ msg.textContent=err.message; }
    };
    return;
  }
  app.innerHTML=`<h1>Sign in / Sign up</h1>
  <div class="tabs"><button class="tab active" data-m="login">Login</button><button class="tab" data-m="signup">Sign up</button></div>
  <div class="card"><form id="authForm">
    <label>Email<input name="email" type="email" required></label>
    <label>Password<input name="password" type="password" required minlength="6"></label>
    <label id="waField" hidden>WhatsApp number<input name="whatsapp" type="tel" placeholder="+234..." required></label>
    <label id="nameField" hidden>Full name<input name="fullname" type="text" required></label>
    <label id="countryField" hidden>Country<input name="country" type="text" placeholder="Nigeria" required></label>
    <label id="stateField" hidden>State<input name="state" type="text" placeholder="Lagos" required></label>
    <button class="btn primary" style="margin-top:14px">Submit</button>
    <p class="mut small" id="authMsg"></p>
  </form>
  <p class="small" style="margin-top:10px"><a href="#" id="forgotLink">Forgot password?</a></p>
  </div>
  <div class="card" id="forgotCard" hidden>
    <h2>Reset your password</h2>
    <p class="mut small">Enter the email you signed up with. We'll email you a reset link.</p>
    <form id="forgotForm">
      <label>Email<input name="email" type="email" required></label>
      <button class="btn primary" style="margin-top:14px">Send reset link</button>
      <p class="mut small" id="forgotMsg"></p>
    </form>
    <p class="small" style="margin-top:10px"><a href="#" id="forgotBack">Back to login</a></p>
  </div>`;
  let mode="login";
  document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");mode=t.dataset.m;["waField","nameField","countryField","stateField"].forEach(id=>{const el=$("#"+id);if(el)el.hidden=mode!=="signup";});});
  $("#authForm").onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target), email=f.get("email"), pw=f.get("password"), wa=(f.get("whatsapp")||"").trim(), fn=(f.get("fullname")||"").trim(), ctry=(f.get("country")||"").trim(), st=(f.get("state")||"").trim();
    const msg=$("#authMsg"); msg.textContent="Working…";
    try{ mode==="login"?await signIn(email,pw):await signUp(email,pw,wa,fn,ctry,st); location.hash="#/dashboard"; render(); }
    catch(err){ msg.textContent=err.message; }
  };
  const fl=$("#forgotLink"), fc=$("#forgotCard");
  if(fl&&fc){
    fl.onclick=e=>{e.preventDefault();fc.hidden=false;fl.parentElement.style.display="none";};
    $("#forgotBack").onclick=e=>{e.preventDefault();fc.hidden=true;fl.parentElement.style.display="";};
    $("#forgotForm").onsubmit=async e=>{
      e.preventDefault();
      const email=new FormData(e.target).get("email");
      const msg=$("#forgotMsg"); msg.textContent="Working…";
      try{
        await resetPasswordForEmail(email);
        msg.textContent="Check your inbox for a reset link.";
      }catch(err){ msg.textContent=err.message; }
    };
  }
}

async function requireUser(app){
  const u=await supabaseUser();
  if(SETUP_PENDING){ app.innerHTML=`<h1>Dashboard</h1>${setupNotice()}`; return null; }
  if(!u){ location.hash="#/auth"; return null; }
  return u;
}

function orderSummary(c,side,ngn,crypto,rate){
  return `<div class="card"><h2>Estimated quote</h2>
    <table><tbody>
    <tr><td>Side</td><td><b>${side.toUpperCase()}</b></td></tr>
    <tr><td>Coin</td><td>${esc(c.code)}</td></tr>
    <tr><td>You pay</td><td>${side==="buy"?fmtNgn(ngn):fmtCrypto(crypto,c.decimals)+" "+esc(c.code)}</td></tr>
    <tr><td>You receive</td><td>${side==="buy"?fmtCrypto(crypto,c.decimals)+" "+esc(c.code):fmtNgn(ngn)}</td></tr>
    <tr><td>Rate</td><td>${fmtNgn(rate)} / ${esc(c.code)}</td></tr>
    </tbody></table>
    <p class="mut small">Display only. Your confirmed rate is quoted on WhatsApp.</p></div>`;
}

async function renderDashboard(app){
  const u=await requireUser(app); if(!u) return;
  let trades=[];
  try{ trades=await sb("trade_requests?user_id=eq."+u.id+"&order=created_at.desc"); }catch(e){ trades=[]; }
  const coinOpts=COINS.map(c=>`<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`).join("");
  const rows=trades.length?trades.map(t=>`<tr><td>${new Date(t.created_at).toLocaleString()}</td><td>${esc(t.side)}</td><td>${esc(t.coin)}</td><td>${fmtNgn(t.amount_ngn)}</td><td>${fmtCrypto(t.amount_crypto,6)}</td><td><a href="#/receipt?id=${t.id}"><span class="pill ${esc(t.status)}">${esc(t.status)}</span></a></td><td class="mono">${esc((profiles[t.user_id]||{}).whatsapp||"")}</td><td>${esc((profiles[t.user_id]||{}).fullname||"")}</td><td>${esc([(profiles[t.user_id]||{}).state,(profiles[t.user_id]||{}).country].filter(Boolean).join(", "))}</td></tr>`).join(""):`<tr><td colspan="6" class="mut">No trade requests yet.</td></tr>`;
  app.innerHTML=`<h1>Dashboard <span class="small mut">${esc(u.email)}</span></h1>
  ${isAdmin(u)?`<p><a class="btn" href="#/admin">Admin panel</a></p>`:""}
  <div class="card"><div class="row"><h2>Live rates ${rateBadge()}</h2><span class="small mut">${esc(RATE_TS||"")}</span></div>
    <div class="rategrid">${COINS.map(c=>`<div class="rate"><div class="sub">${esc(c.code)}</div><b>${fmtNgn(RATES[c.code])}</b></div>`).join("")}</div></div>

  <div class="tabs"><button class="tab active" data-s="buy">Buy crypto with NGN</button><button class="tab" data-s="sell">Sell crypto for NGN</button></div>
  <form class="card" id="tradeForm">
    <label>Coin<select name="coin">${coinOpts}</select></label>
    <div id="buyFields"><label>How much NGN do you want to spend? <span class="small">(min 5,000)</span><input name="buyNgn" inputmode="decimal" placeholder="e.g. 50000"></label></div>
    <div id="sellFields" hidden><label>How much coin are you selling?<input name="sellCrypto" inputmode="decimal" placeholder="e.g. 0.01"></label></div>
    <div id="destFields"><label>BTC / coin receive address (buy) or your NGN bank account number (sell)</label>
      <input name="destination" required placeholder="Address / account number"></div>
    <label>Notes (network, bank name, tag, etc.)<input name="note" placeholder="optional"></label>
    <button class="btn primary">Place request</button>
    <p class="mut small" id="tradeMsg"></p>
  </form>
  <div id="quote"></div>

  <div id="alertsBox"></div>

  <div class="card"><h2>Save your payout details</h2><p class="mut small">Bank account or wallet address we prefill on every trade request. You can still type a different one per trade.</p>
  <form id="detailsForm"><label>Default destination (bank account number or wallet address)<input name="default_destination" placeholder="e.g. 0123456789 - GTBank, or a USDT TRC20 address"></label>
  <button class="btn primary">Save details</button><p class="mut small" id="detailsMsg"></p></form></div>

  <div id="refBox"></div>

  <div class="card"><h2>Leave a review</h2><p class="mut small">Completed a trade? Tell people how it went. The desk approves reviews before they show on the homepage.</p>
  <form id="reviewForm"><label>Your review<textarea name="body" rows="3" required maxlength="280" placeholder="Fast settlement, clear rates..."></textarea></label>
  <button class="btn primary">Submit review</button><p class="mut small" id="reviewMsg"></p></form></div>

  <div class="card"><h2>Your trade requests</h2><div style="overflow:auto"><table><thead><tr><th>Date</th><th>Side</th><th>Coin</th><th>NGN</th><th>Crypto</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="mut small">Pending trades get confirmed on <a href="${WA}" target="_blank" rel="noopener">WhatsApp +2349016755312</a>.</p></div>`;
  renderAlerts(u).then(h=>{ const b=$("#alertsBox"); if(b)b.innerHTML=h; });
  sb("profiles?user_id=eq."+u.id+"&select=*").then(ps=>{
    const p=(ps&&ps[0])||{}; const dest=$("input[name=destination]"); if(dest&&!dest.value&&p.default_destination)dest.value=p.default_destination;
    const refCode=p.referral_code||u.id.slice(0,8); const refLink=location.origin+location.pathname+"#/auth?ref="+refCode;
    const refBox=$("#refBox"); if(refBox)refBox.innerHTML=`<div class="card"><h2>Your referral link</h2><p class="mut small">Share it. When someone signs up through it, it's recorded against you.</p><input class="mono" style="width:100%;background:var(--panel);border:1px solid var(--line);color:var(--txt);padding:10px;border-radius:10px" readonly value="${esc(refLink)}" onclick="this.select()"><p class="mut small" id="refCount"></p></div>`;
    sb("profiles?referred_by=eq."+refCode+"&select=user_id").then(r=>{ const rc=$("#refCount"); if(rc)rc.textContent=r.length?r.length+" signups through your link":"No signups through your link yet."; }).catch(()=>{});
  }).catch(()=>{});

  let side="buy";
  document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");side=t.dataset.s;$("#buyFields").hidden=side!=="buy";$("#sellFields").hidden=side!=="sell";});
  $("#tradeForm").onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target), coinCode=f.get("coin");
    const c=COINS.find(x=>x.code===coinCode), rate=RATES[coinCode];
    const msg=$("#tradeMsg"); msg.textContent="";
    if(!rate){ $("#quote").innerHTML=`<div class="notice">Rate unavailable for ${esc(coinCode)}.</div>`; return; }
    const ngn=side==="buy"?Number(f.get("buyNgn")):Number(f.get("sellCrypto"))*rate;
    const crypto=side==="buy"?Number(f.get("buyNgn"))/rate:Number(f.get("sellCrypto"));
    if(!(ngn>0)||!(crypto>0)){ msg.textContent="Enter a valid amount."; return; }
    if(side==="buy"&&ngn<c.minBuyNgn){ msg.textContent=`Minimum buy is ${fmtNgn(c.minBuyNgn)}.`; return; }
    if(side==="sell"&&crypto<c.minSellCrypto){ msg.textContent=`Minimum sell is ${c.minSellCrypto} ${c.code}.`; return; }
    if(!f.get("destination")){ msg.textContent="Destination is required."; return; }
    $("#quote").innerHTML=orderSummary(c,side,ngn,crypto,rate);
    try{
      await sb("trade_requests","POST",{user_id:u.id,side,coin:coinCode,amount_ngn:ngn,amount_crypto:crypto,rate_ngn_per_coin:rate,destination:f.get("destination"),destination_note:f.get("note")||null,status:"pending"});
      render();
    }catch(err){ msg.textContent=err.message; }
  };
}

async function renderReceipt(app){
  const id=new URLSearchParams((location.hash.split("?")[1]||"")).get("id");
  if(!id){ app.innerHTML=`<h1>Receipt</h1><div class="notice">Missing trade id.</div>`; return; }
  let t=null;
  try{ t=(await sb("trade_requests?id=eq."+id+"&select=*"))[0]; }catch(e){}
  if(!t){ app.innerHTML=`<h1>Receipt</h1><div class="notice">Trade not found.</div>`; return; }
  app.innerHTML=`<h1>Trade receipt</h1><div class="card"><table><tbody>
  <tr><td>Date</td><td>${new Date(t.created_at).toLocaleString()}</td></tr>
  <tr><td>Side</td><td><b>${esc(t.side).toUpperCase()}</b></td></tr>
  <tr><td>Coin</td><td>${esc(t.coin)}</td></tr>
  <tr><td>NGN amount</td><td>${fmtNgn(t.amount_ngn)}</td></tr>
  <tr><td>Crypto amount</td><td>${fmtCrypto(t.amount_crypto,6)}</td></tr>
  <tr><td>Rate</td><td>${fmtNgn(t.rate_ngn_per_coin)} / ${esc(t.coin)}</td></tr>
  <tr><td>Status</td><td><span class="pill ${esc(t.status)}">${esc(t.status)}</span></td></tr>
  </tbody></table>
  <p class="mut small">PitchBlack OTC manual settlement desk. Confirmed by a human on WhatsApp: <a href="${WA}" target="_blank" rel="noopener">+234 901 675 5312</a>. Educational content is not financial advice.</p></div>
  <p><a class="btn primary" href="https://wa.me/2349016755312?text=${encodeURIComponent("Hi, about my PitchBlack trade "+t.id)}">Message the desk about this trade</a></p>`;
}

async function renderAdmin(app){
  const u=await requireUser(app); if(!u) return;
  if(!isAdmin(u)){ app.innerHTML=`<h1>Admin</h1><div class="notice">Admin access only. Contact <a href="${WA}" target="_blank">WhatsApp +2349016755312</a>.</div>`; return; }
  let trades=[],profiles={};
  try{ trades=await sb("trade_requests?order=created_at.desc"); }catch(e){ trades=[]; }
  try{ (await sb("profiles?select=user_id,whatsapp,email,fullname,country,state")).forEach(p=>profiles[p.user_id]=p); }catch(e){}
  const rows=trades.map(t=>`<tr><td>${new Date(t.created_at).toLocaleString()}</td><td>${esc(t.side)} ${esc(t.coin)}</td><td>${fmtNgn(t.amount_ngn)}</td><td>${fmtCrypto(t.amount_crypto,6)}</td><td class="mono">${esc(t.destination)}</td><td>${esc(t.destination_note||"")}</td><td><a href="#/receipt?id=${t.id}"><span class="pill ${esc(t.status)}">${esc(t.status)}</span></a></td><td class="mono">${esc((profiles[t.user_id]||{}).whatsapp||"")}</td><td>${esc((profiles[t.user_id]||{}).fullname||"")}</td><td>${esc([(profiles[t.user_id]||{}).state,(profiles[t.user_id]||{}).country].filter(Boolean).join(", "))}</td>
    <td>${["pending","completed","declined"].map(s=>`<button class="btn" data-id="${t.id}" data-s="${s}" ${t.status===s?"disabled":""}>${s}</button>`).join(" ")}</td></tr>`).join("");
  const today=new Date(); today.setHours(0,0,0,0);
  const week=Date.now()-7*864e5;
  const pend=trades.filter(t=>t.status==="pending").length;
  const todayN=trades.filter(t=>new Date(t.created_at)>=today);
  const weekNgn=trades.filter(t=>new Date(t.created_at).getTime()>=week).reduce((s,t)=>s+Number(t.amount_ngn||0),0);
  app.innerHTML=`<h1>Admin panel <span class="small mut">${esc(u.email)}</span></h1>
  <div class="rategrid"><div class="rate"><div class="sub">Pending now</div><b>${pend}</b></div>
  <div class="rate"><div class="sub">Requests today</div><b>${todayN.length}</b></div>
  <div class="rate"><div class="sub">NGN volume, 7 days</div><b>${fmtNgn(weekNgn)}</b></div></div>
  <div class="card"><h2>Reviews waiting for approval</h2><div id="revQueue" class="mut small">Loading...</div></div>

  <div class="card"><h2>All trade requests (${trades.length})</h2><p><button class="btn" id="csvBtn">Download CSV</button></p><div style="overflow:auto"><table><thead><tr><th>Date</th><th>Trade</th><th>NGN</th><th>Crypto</th><th>Destination</th><th>Note</th><th>Status</th><th>WhatsApp</th><th>Name</th><th>State, Country</th><th>Action</th></tr></thead><tbody>${rows||'<tr><td colspan="11" class="mut">No trades yet.</td></tr>'}</tbody></table></div></div>`;
  sb("testimonials?approved=eq.false&order=created_at.desc&select=*").then(ts=>{
    const q=$("#revQueue"); if(!q)return;
    q.innerHTML=ts.length?`<table><tbody>${ts.map(t=>`<tr><td>${esc(t.body)}</td><td><button class="btn" data-rev="${t.id}" data-a="true">Approve</button> <button class="btn" data-rev="${t.id}" data-a="false">Hide</button></td></tr>`).join("")}</tbody></table>`:"No reviews waiting.";
    q.querySelectorAll("button[data-rev]").forEach(b=>b.onclick=async()=>{
      try{ await sb("testimonials?id=eq."+b.dataset.rev,"PATCH",{approved:b.dataset.a==="true"}); render(); }
      catch(e){ alert(e.message); }
    });
  }).catch(()=>{ const q=$("#revQueue"); if(q)q.textContent="Reviews table not created yet. Run the SQL from my last message."; });

  const csvBtn=$("#csvBtn");
  if(csvBtn) csvBtn.onclick=()=>{
    const head=["date","side","coin","amount_ngn","amount_crypto","rate_ngn_per_coin","status","user_email"];
    const lines=trades.map(t=>[t.created_at,t.side,t.coin,t.amount_ngn,t.amount_crypto,t.rate_ngn_per_coin,t.status,(profiles[t.user_id]||{}).email||""].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(","));
    const blob=new Blob([head.join(",")+"\n"+lines.join("\n")],{type:"text/csv"});
    const url=URL.createObjectURL(blob), el=document.createElement("a");
    el.href=url; el.download="pitchblack-trades.csv"; el.click(); URL.revokeObjectURL(url);
  };
  document.querySelectorAll("button[data-id]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.id, s=b.dataset.s;
    try{ await sb("trade_requests?id=eq."+id,"PATCH",{status:s,updated_at:new Date().toISOString()}); render(); }
    catch(e){ alert(e.message); }
  });
}

async function snapshotRates(){
  if(RATE_SOURCE.indexOf("live")!==0) return;
  const today=new Date().toISOString().slice(0,10);
  try{ await sb("rate_history","POST",{day:today,coin:"BTC",rate_ngn:RATES["BTC"]},{ Prefer:"resolution=merge-duplicates" }); }catch(e){}
}

// homepage proof counters (public count)

// homepage proof counters (public count)
async function loadProof(){
  const el1=$("#proofTrades"), el2=$("#proofDone");
  if(!el1||!el2) return;
  try{
    const h={apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY,Prefer:"count=exact",Range:"0-0"};
    const r1=await fetch(SUPABASE_URL+"/rest/v1/trade_requests?select=id",{headers:h});
    const r2=await fetch(SUPABASE_URL+"/rest/v1/trade_requests?select=id&status=eq.completed",{headers:h});
    const cnt=r=>{ const cr=r.headers.get("content-range"); return cr?Number(cr.split("/")[1]):0; };
    el1.textContent=cnt(r1); el2.textContent=cnt(r2);
  }catch(e){ el1.textContent="-"; el2.textContent="-"; }
}
async function loadReviews(){
  const box=$("#reviewBox"); if(!box) return;
  try{
    const ts=await sb("testimonials?approved=eq.true&order=created_at.desc&limit=6&select=body,created_at,profiles!testimonials_user_id_fkey(fullname,whatsapp)");
    box.innerHTML=ts.length?`<h2>What traders say</h2><div class="steps">${ts.map(t=>`<div class="step"><p>\u201C${esc(t.body)}\u201D</p><div class="sub">- ${esc((t.profiles||{}).fullname||"a trader")}</div></div>`).join("")}</div>`:"";
  }catch(e){ box.innerHTML=""; }
}
loadReviews();

loadProof();

// boot: load rates, then render current hash
loadRates();

// submit testimonial
document.addEventListener("submit",async e=>{
  if(e.target.id!=="reviewForm")return;
  e.preventDefault();
  const m=$("#reviewMsg"); if(!m)return;
  try{ await sb("testimonials","POST",{user_id:_session.user.id,body:e.target.body.value.trim(),approved:false}); m.textContent="Thanks. It shows once the desk approves it."; e.target.reset(); }
  catch(err){ m.textContent=err.message; }
});

// save default payout details
document.addEventListener("submit",async e=>{
  if(e.target.id!=="detailsForm")return;
  e.preventDefault();
  const m=$("#detailsMsg"); if(!m)return;
  try{ await sb("profiles?user_id=eq."+_session.user.id,"PATCH",{default_destination:e.target.default_destination.value.trim()}); m.textContent="Saved. New trade requests will prefill it."; }
  catch(err){ m.textContent=err.message; }
});

// email list signup
document.addEventListener("submit",async e=>{
  if(e.target.id!=="subForm")return;
  e.preventDefault();
  const email=e.target.email.value.trim(), m=$("#subMsg"); if(!m)return;
  m.textContent="Joining...";
  try{ await sb("email_subscribers","POST",{email}); m.textContent="You're on the list."; e.target.reset(); }
  catch(err){ m.textContent=err.message; }
});

// ---------- rate alerts ----------
async function renderAlerts(u){
  let alerts=[];
  try{ alerts=await sb("rate_alerts?user_id=eq."+u.id+"&status=eq.active&order=created_at.desc"); }catch(e){ alerts=[]; }
  const triggered=[];
  alerts.forEach(a=>{ const r=RATES[a.coin]; if(!r) return;
    if((a.direction==="above"&&r>=a.target_ngn)||(a.direction==="below"&&r<=a.target_ngn)){
      triggered.push(a);
      sb("rate_alerts?id=eq."+a.id,"PATCH",{status:"triggered",triggered_at:new Date().toISOString(),triggered_rate:r}).catch(()=>{});
    }
  });
  const row=a=>`<tr><td><b>${esc(a.coin)}</b></td><td>${a.direction==="above"?"rises to":"falls to"} ${fmtNgn(a.target_ngn)}</td><td><span class="pill ${a.status}">${esc(a.status)}</span></td><td>${a.status==="active"?`<button class="btn" data-alert="${a.id}">Cancel</button>`:""}</td></tr>`;
  const list=alerts.length?alerts.map(row).join(""):`<tr><td colspan="4" class="mut">No alerts yet.</td></tr>`;
  return `<div class="card"><h2>Rate alerts</h2>
  <p class="mut small">We check the live naira rate. When it crosses your target, the alert fires and shows here, and the desk can confirm your rate on WhatsApp.</p>
  <form id="alertForm"><label>Coin<select name="coin">${COINS.map(c=>`<option value="${esc(c.code)}">${esc(c.code)}</option>`).join("")}</select></label>
  <label>Alert me when the rate goes<select name="direction"><option value="above">above</option><option value="below">below</option></select></label>
  <label>Target rate (NGN per coin)<input name="target" inputmode="decimal" required placeholder="e.g. ${Math.round(RATES["BTC"]||100000000)}"></label>
  <button class="btn primary">Set alert</button><p class="mut small" id="alertMsg"></p></form>
  <div style="overflow:auto"><table><thead><tr><th>Coin</th><th>Condition</th><th>Status</th><th></th></tr></thead><tbody>${list}</tbody></table></div>
  ${triggered.length?`<div class="notice"><b>Alert hit:</b> ${triggered.map(a=>esc(a.coin)+" is now "+fmtNgn(RATES[a.coin])).join(", ")}. Message <a href="${WA}" target="_blank" rel="noopener">WhatsApp +234****5312</a> to trade at this rate.</div>`:""}</div>`;
}
document.addEventListener("submit",async e=>{
  if(e.target.id!=="alertForm")return;
  e.preventDefault();
  const f=new FormData(e.target), m=$("#alertMsg"); if(!m)return;
  const target=Number(f.get("target"));
  if(!(target>0)){ m.textContent="Enter a valid target rate."; return; }
  try{ await sb("rate_alerts","POST",{user_id:_session.user.id,coin:f.get("coin"),direction:f.get("direction"),target_ngn:target,status:"active"}); render(); }
  catch(err){ m.textContent=err.message; }
});
document.addEventListener("click",async e=>{
  const id=e.target&&e.target.dataset&&e.target.dataset.alert; if(!id)return;
  try{ await sb("rate_alerts?id=eq."+id,"PATCH",{status:"cancelled"}); render(); }catch(err){ alert(err.message); }
});

// ---------- support chatbot (AI with live-rate context, WhatsApp escalation) ----------
async function aiReply(q){
  // asks the ai-chat Supabase edge function; the API key lives server-side, never in this file
  const res=await fetch("https://kvivbndffnzlujhbpspr.supabase.co/functions/v1/ai-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:q})});
  if(!res.ok) return null;
  const d=await res.json();
  return d&&d.reply&&!d.reply.startsWith("Sorry, the assistant is unavailable")?d.reply:null;
}

// ---------- support chatbot (rule-based fallback, live rates, WhatsApp escalation) ----------
const PB_ANSWERS=[
  {k:["settle","how long","arrive","when will i receive","receive my"],a:"Most trades settle within 30 minutes of the desk confirming on WhatsApp. Naira transfers follow Nigerian bank hours."},
  {k:["fee","spread","charge","cost","commission"],a:"Rates on this site already include the desk spread: about 1.5% on BTC and ETH, about 2% on other coins. The rate you see is the rate you trade."},
  {k:["safe","scam","trust","legit","real"],a:"Every trade is a request until a human confirms it on WhatsApp. You send funds only after confirmation. We never hold custody of any wallet."},
  {k:["minimum","min","least"],a:"Minimum buy is 5,000 naira. Sell minimums vary by coin and show on the trade form."},
  {k:["coin","which crypto","what can i buy","what can i sell"],a:"We trade BTC, USDT, USDC, ETH, BNB, SOL, XRP, DOGE and TRX against naira, both buying and selling."},
  {k:["rate","price of","how much is","current"],a:"live-rate"},
  {k:["account","sign up","signup","register","login","password"],a:"Click Sign up on the site, fill email, password, WhatsApp, name, country and state. Forgot your password? Use the reset link on the login page."},
  {k:["refund","decline","cancel","wrong"],a:"Pending requests can be declined by the desk before settlement. Message the desk on WhatsApp and they'll sort it out."},
  {k:["alert"],a:"Go to your dashboard, open Rate alerts, pick a coin, set a naira target. You'll see a banner the moment the live rate crosses it."},
  {k:["referral","refer","invite"],a:"Your dashboard has a referral link. Share it; signups through it are recorded against your account."},
];
async function pbAnswer(q){
  const s=q.toLowerCase();
  for(const item of PB_ANSWERS){ if(item.k.some(k=>s.includes(k))){
    if(item.a==="live-rate"){
      const c=COINS.find(c=>s.includes(c.code.toLowerCase())||s.includes((c.name||"").toLowerCase()));
      if(c&&RATES[c.code]) return c.code+" is currently "+fmtNgn(RATES[c.code])+" per coin. The desk quotes the final rate on WhatsApp when you trade.";
      return "Live naira rates for all coins are on the Rates page. The desk confirms the exact rate on WhatsApp when you trade.";
    }
    return item.a;
  }}
  return null;
}
function pbWidget(){
  const w=document.createElement("div");
  w.id="pbBot"; w.innerHTML=`
  <button id="pbBotBtn" aria-label="Support chat">?</button>
  <div id="pbBotPanel" hidden>
    <div class="pbHead">PitchBlack support <span class="mut small">bot. for trades, a human replies on WhatsApp</span></div>
    <div id="pbLog" class="pbLog"><div class="pbMsg pbBot2">Hi. I handle the small stuff: rates, fees, how settlement works. Anything about an actual trade goes to the desk on WhatsApp.</div></div>
    <form id="pbForm" class="pbForm"><input name="q" placeholder="Ask about rates, fees, settlement..." autocomplete="off"><button class="btn primary">Send</button></form>
    <a class="pbWa" href="${WA}" target="_blank" rel="noopener">Talk to a human on WhatsApp</a>
  </div>`;
  document.body.appendChild(w);
  document.getElementById("pbBotBtn").onclick=()=>{ const p=document.getElementById("pbBotPanel"); p.hidden=!p.hidden; };
  document.getElementById("pbForm").onsubmit=async e=>{
    e.preventDefault();
    const q=e.target.q.value.trim(); if(!q)return;
    e.target.q.value="";
    const log=document.getElementById("pbLog");
    log.insertAdjacentHTML("beforeend",`<div class="pbMsg pbMe">${esc(q)}</div><div class="pbMsg pbBot2" id="pbTyping">...</div>`);
    log.scrollTop=log.scrollHeight;
    let ans=null;
    try{ ans=await aiReply(q); }catch(err){ ans=null; }
    if(!ans) ans=await pbAnswer(q)||"I don't have that one. For anything about a real trade, payment or dispute, message the desk on WhatsApp below, a human answers.";
    const t=document.getElementById("pbTyping"); if(t){ t.textContent=ans; }
    log.scrollTop=log.scrollHeight;
  };
}
if(document.readyState!=="loading") pbWidget(); else document.addEventListener("DOMContentLoaded",pbWidget);
