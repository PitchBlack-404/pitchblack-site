
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
async function signUp(email,password,whatsapp){
  const res=await fetch(SUPABASE_URL+"/auth/v1/signup",{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password,data:{whatsapp:whatsapp||""}})});
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
  const rows=COINS.map(c=>`<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td>${fmtNgn(RATES[c.code])}</td><td class="mut">${esc(c.note||"")}</td></tr>`).join("");
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
  document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");mode=t.dataset.m;const wf=$("#waField");if(wf)wf.hidden=mode!=="signup";});
  $("#authForm").onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target), email=f.get("email"), pw=f.get("password"), wa=(f.get("whatsapp")||"").trim();
    const msg=$("#authMsg"); msg.textContent="Working…";
    try{ mode==="login"?await signIn(email,pw):await signUp(email,pw,wa); location.hash="#/dashboard"; render(); }
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
  const rows=trades.length?trades.map(t=>`<tr><td>${new Date(t.created_at).toLocaleString()}</td><td>${esc(t.side)}</td><td>${esc(t.coin)}</td><td>${fmtNgn(t.amount_ngn)}</td><td>${fmtCrypto(t.amount_crypto,6)}</td><td><span class="pill ${esc(t.status)}">${esc(t.status)}</span></td><td class="mono">${esc((profiles[t.user_id]||{}).whatsapp||"")}</td></tr>`).join(""):`<tr><td colspan="6" class="mut">No trade requests yet.</td></tr>`;
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

  <div class="card"><h2>Your trade requests</h2><div style="overflow:auto"><table><thead><tr><th>Date</th><th>Side</th><th>Coin</th><th>NGN</th><th>Crypto</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="mut small">Pending trades get confirmed on <a href="${WA}" target="_blank" rel="noopener">WhatsApp +2349016755312</a>.</p></div>`;

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

async function renderAdmin(app){
  const u=await requireUser(app); if(!u) return;
  if(!isAdmin(u)){ app.innerHTML=`<h1>Admin</h1><div class="notice">Admin access only. Contact <a href="${WA}" target="_blank">WhatsApp +2349016755312</a>.</div>`; return; }
  let trades=[],profiles={};
  try{ trades=await sb("trade_requests?order=created_at.desc"); }catch(e){ trades=[]; }
  try{ (await sb("profiles?select=user_id,whatsapp,email")).forEach(p=>profiles[p.user_id]=p); }catch(e){}
  const rows=trades.map(t=>`<tr><td>${new Date(t.created_at).toLocaleString()}</td><td>${esc(t.side)} ${esc(t.coin)}</td><td>${fmtNgn(t.amount_ngn)}</td><td>${fmtCrypto(t.amount_crypto,6)}</td><td class="mono">${esc(t.destination)}</td><td>${esc(t.destination_note||"")}</td><td><span class="pill ${esc(t.status)}">${esc(t.status)}</span></td><td class="mono">${esc((profiles[t.user_id]||{}).whatsapp||"")}</td>
    <td>${["pending","completed","declined"].map(s=>`<button class="btn" data-id="${t.id}" data-s="${s}" ${t.status===s?"disabled":""}>${s}</button>`).join(" ")}</td></tr>`).join("");
  app.innerHTML=`<h1>Admin panel <span class="small mut">${esc(u.email)}</span></h1>
  <div class="card"><h2>All trade requests (${trades.length})</h2><div style="overflow:auto"><table><thead><tr><th>Date</th><th>Trade</th><th>NGN</th><th>Crypto</th><th>Destination</th><th>Note</th><th>Status</th><th>WhatsApp</th><th>Action</th></tr></thead><tbody>${rows||'<tr><td colspan="9" class="mut">No trades yet.</td></tr>'}</tbody></table></div></div>`;
  document.querySelectorAll("button[data-id]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.id, s=b.dataset.s;
    try{ await sb("trade_requests?id=eq."+id,"PATCH",{status:s,updated_at:new Date().toISOString()}); render(); }
    catch(e){ alert(e.message); }
  });
}

// boot: load rates, then render current hash
loadRates();
