export function renderLanding(input: { supabaseUrl: string; supabaseAnonKey: string; appBaseUrl: string; connectLead: string }) {
  const supabaseUrl = JSON.stringify(input.supabaseUrl);
  const supabaseAnonKey = JSON.stringify(input.supabaseAnonKey);
  const appBaseUrl = JSON.stringify(input.appBaseUrl);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Queue</title>
  <link rel="icon" href="/icon.svg">
  <style>
    :root{color-scheme:light;--bg:#f6f3ee;--text:#1c1917;--muted:#57534e;--line:#e7e0d6;--accent:#9a3412;--card:#fff}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:18px/1.55 ui-sans-serif,system-ui,sans-serif}
    main{max-width:980px;margin:0 auto;padding:28px 20px 72px}a{color:var(--accent)}
    nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:36px}.brand{font-weight:800;letter-spacing:-.03em}
    h1{font-size:clamp(40px,7vw,68px);line-height:.95;letter-spacing:-.045em;margin:8px 0 16px}
    .muted{color:var(--muted)} .card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px}
    .grid{display:grid;grid-template-columns:1.2fr .8fr;gap:22px}.plans{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    button,.btn{font:inherit;border-radius:12px;padding:12px 16px;border:1px solid var(--line);background:#fff;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
    .primary{background:var(--accent);color:#fff;border-color:var(--accent)} button:disabled{opacity:.55;cursor:wait}
    label{display:block;margin:12px 0 4px} input,textarea,select{width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;background:#fff}
    textarea{min-height:90px} .row{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px} .error{color:#8d1d18} .ok{color:#9a3412}
    article.item{border-top:1px solid var(--line);padding:10px 0} [hidden]{display:none!important}
    footer{display:flex;gap:16px;flex-wrap:wrap;margin-top:48px;color:var(--muted)}
    @media(max-width:760px){.grid,.plans{grid-template-columns:1fr}}
  </style>
</head>
<body>
<main>
  <nav><div class="brand">Queue</div><span class="muted" id="servicePill">Approved response times only</span></nav>
  <section class="grid">
    <div>
      <p class="muted" id="heroEyebrow">Support replies that stay on the plan</p>
      <h1 id="heroTitle">Do not promise a faster reply.</h1>
      <p id="heroDescription">Queue keeps a team's approved support response times by customer plan: which reply window, which channel, and which staffing promise may be stated. An assistant can look them up, and it must refuse a faster reply, a dedicated agent, or a channel that plan does not include.</p>
      ${input.connectLead}
      <div class="row" id="signedOutActions"><button class="primary" id="googleBtn" type="button">Continue with Google</button><a class="btn" href="#plans">See trial and Pro</a></div>
      <div class="card" id="accountCard" hidden>
        <p class="muted">Signed in</p>
        <p id="userEmail"></p>
        <p id="subscriptionStatus" class="muted">Checking account…</p>
        <div class="row"><button id="signOutBtn" type="button">Sign out</button><button id="portalBtn" type="button">Manage billing</button><a class="btn primary" id="workspaceLink" href="/app">Open response workspace</a></div>
      </div>
      <p id="notice" class="ok" role="status"></p>
      <p id="error" class="error" role="alert"></p>
    </div>
    <aside class="card" id="salesAside">
      <p><strong>Customer plans</strong><br><span class="muted">The support plan the customer actually has.</span></p>
      <p><strong>Reply windows</strong><br><span class="muted">The wait the team approved. Nothing faster.</span></p>
      <p><strong>Channels</strong><br><span class="muted">Email, chat, phone, SMS, or video, only when the plan includes it.</span></p>
      <p><strong>Staffing</strong><br><span class="muted">A shared queue, or a dedicated agent, only when that promise is saved.</span></p>
    </aside>
  </section>
  <section id="plans">
    <h2>14-day trial, then Pro</h2>
    <p class="muted">Monthly and yearly checkout are handled by Stripe. Checkout shows the plan terms. Queue does not print a price.</p>
    <div class="plans">
      <article class="card"><h3>Monthly</h3><p>A 14-day trial, then Pro, billed each month.</p><ul><li>Customer plans</li><li>Reply windows</li><li>Included channels</li><li>Staffing promises</li></ul><button class="checkout" data-plan="monthly" type="button">Start monthly trial</button></article>
      <article class="card"><h3>Yearly</h3><p>The same 14-day trial, then Pro, billed once a year.</p><ul><li>Everything in Monthly</li><li>One annual billing cycle</li><li>Same refusal rules</li></ul><button class="primary checkout" data-plan="annual" type="button">Start yearly trial</button></article>
    </div>
  </section>
  <section id="workspace" hidden>
    <h2>Your response catalog</h2>
    <p class="muted">Save only reply windows, channels, and staffing promises the team has approved. An assistant will not promise a faster reply, a dedicated agent, or a channel that is missing here.</p>
    <div class="grid">
      <form id="catalogForm" class="card"><h3>New catalog</h3><label for="catalogName">Name</label><input id="catalogName" required maxlength="200"><label for="catalogDescription">Description</label><textarea id="catalogDescription" maxlength="4000"></textarea><button class="primary" type="submit">Create catalog</button></form>
      <div class="card"><h3>Catalogs</h3><label for="catalogSelect">Open</label><select id="catalogSelect"><option value="">Choose a catalog</option></select><div id="catalogList"></div></div>
    </div>
    <div id="policy" hidden>
      <form id="planForm" class="card"><h3>Customer plan</h3><input id="planRevision" type="hidden"><label>Name<input id="planName" required maxlength="200"></label><label>Who this plan is for<input id="planSummary" required maxlength="500"></label><button class="primary" type="submit">Save customer plan</button></form>
      <div class="card"><h3>Plans</h3><label for="planSelect">Open</label><select id="planSelect"><option value="">Choose a plan</option></select></div>
      <div id="planPolicy" hidden>
        <form id="windowForm" class="card"><h3>Reply window</h3><input id="windowRevision" type="hidden"><label>Name<input id="windowName" required maxlength="200"></label><label>Approved wait in minutes<input id="windowMinutes" type="number" min="1" max="525600" required></label><label>Exact wording<textarea id="windowStatement" required maxlength="2000"></textarea></label><button class="primary" type="submit">Save reply window</button></form>
        <form id="channelForm" class="card"><h3>Included channel</h3><input id="channelRevision" type="hidden"><label>Name<input id="channelName" required></label><label>Channel<select id="channelKey"><option>email</option><option>chat</option><option>phone</option><option>sms</option><option>video</option></select></label><label>Exact wording<textarea id="channelStatement" required maxlength="2000"></textarea></label><button class="primary" type="submit">Save channel</button></form>
        <form id="staffingForm" class="card"><h3>Staffing promise</h3><input id="staffingRevision" type="hidden"><label>Name<input id="staffingName" required></label><label>Kind<select id="staffingKind"><option value="SHARED_QUEUE">Shared queue</option><option value="DEDICATED_AGENT">Dedicated agent</option></select></label><label>Exact wording<textarea id="staffingStatement" required maxlength="2000"></textarea></label><button class="primary" type="submit">Save staffing promise</button></form>
      </div>
      <div class="card"><h3>On this catalog</h3><div id="policyList"></div></div>
    </div>
    <p id="workspaceMessage" role="status"></p>
  </section>
  <footer><a href="/connect">Connect an assistant</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a><a href="/data">Your data</a><a href="/health">System health</a></footer>
</main>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/dist/umd/supabase.js"></script>
<script>
(function(){
  var SUPABASE_URL=${supabaseUrl}, SUPABASE_ANON_KEY=${supabaseAnonKey}, APP_BASE_URL=${appBaseUrl};
  var token="", current=null, isPro=false, ready=false, client=null, catalogId="", planId="";
  function el(id){return document.getElementById(id)}
  function showError(msg){el("error").textContent=msg}
  function clearError(){el("error").textContent=""}
  function renderAccess(pro, accountReady){
    isPro=pro; ready=accountReady;
    el("plans").hidden=pro;
    el("salesAside").hidden=pro;
    el("workspace").hidden=!(pro&&location.pathname==="/app");
    el("workspaceLink").hidden=!pro;
    if(pro&&location.pathname==="/app") void loadCatalogs();
  }
  function setSignedOut(){token="";current=null;el("accountCard").hidden=true;el("signedOutActions").hidden=false;renderAccess(false,true);el("subscriptionStatus").textContent=""}
  function setSignedIn(session){
    current=session; token=session.access_token||"";
    el("userEmail").textContent=(session.user&&session.user.email)||"Signed in";
    el("accountCard").hidden=false; el("signedOutActions").hidden=true;
    void loadProfile(session);
  }
  async function loadProfile(session){
    try{
      var r=await fetch(SUPABASE_URL+"/rest/v1/queue_accounts?id=eq."+encodeURIComponent(session.user.id)+"&select=plan,subscription_status",{headers:{apikey:SUPABASE_ANON_KEY,Authorization:"Bearer "+token}});
      var rows=await r.json();
      var p=rows&&rows[0];
      var pro=Boolean(p&&(p.subscription_status==="trialing"||p.subscription_status==="active"));
      renderAccess(pro,true);
      el("subscriptionStatus").textContent=pro?(p.subscription_status==="trialing"?"Queue Pro · Trial in progress":"Queue Pro · Active"):"Signed in · start a 14-day trial below";
    }catch(e){renderAccess(false,false);el("subscriptionStatus").textContent="Unable to confirm your subscription."}
  }
  async function catalogApi(path, options){
    var opts=options||{}; opts.headers=Object.assign({"Content-Type":"application/json",Authorization:"Bearer "+token},opts.headers||{});
    var r=await fetch(path,opts); var text=await r.text(); var data=text?JSON.parse(text):null;
    if(!r.ok) throw new Error((data&&data.error)||"Request could not complete.");
    return data.data;
  }
  function item(title, body, onEdit){
    var box=document.createElement("article"); box.className="item";
    var h=document.createElement("strong"); h.textContent=title; box.appendChild(h);
    var p=document.createElement("p"); p.textContent=body; box.appendChild(p);
    if(onEdit){var b=document.createElement("button"); b.type="button"; b.textContent="Edit"; b.onclick=onEdit; box.appendChild(b)}
    return box;
  }
  async function loadCatalogs(){
    var rows=await catalogApi("/api/workspace/catalogs");
    var select=el("catalogSelect"); select.replaceChildren(new Option("Choose a catalog",""));
    rows.forEach(function(catalog){select.add(new Option(catalog.name,catalog.id))});
    if(catalogId) select.value=catalogId;
  }
  async function loadPlans(){
    if(!catalogId){el("policy").hidden=true;return}
    el("policy").hidden=false;
    var rows=await catalogApi("/api/workspace/plans?includeRetired=true&catalogId="+encodeURIComponent(catalogId));
    var select=el("planSelect"); select.replaceChildren(new Option("Choose a plan",""));
    rows.forEach(function(plan){select.add(new Option(plan.name,plan.id))});
    if(planId) select.value=planId;
    await loadPolicy();
  }
  async function loadPolicy(){
    var list=el("policyList"); list.replaceChildren();
    if(!planId){el("planPolicy").hidden=true;list.textContent="Choose a customer plan to see its reply windows, channels, and staffing promises.";return}
    el("planPolicy").hidden=false;
    var query="catalogId="+encodeURIComponent(catalogId)+"&planId="+encodeURIComponent(planId)+"&includeRetired=true";
    var windows=await catalogApi("/api/workspace/reply-windows?"+query);
    var channels=await catalogApi("/api/workspace/channels?"+query);
    var staffing=await catalogApi("/api/workspace/staffing?"+query);
    windows.forEach(function(row){list.appendChild(item(row.name+" · "+row.withinMinutes+" min",row.statement,function(){el("windowName").value=row.name;el("windowMinutes").value=row.withinMinutes;el("windowStatement").value=row.statement;el("windowRevision").value=row.revision}))});
    channels.forEach(function(row){list.appendChild(item(row.channel+" · "+row.name,row.statement,function(){el("channelName").value=row.name;el("channelKey").value=row.channel;el("channelStatement").value=row.statement;el("channelRevision").value=row.revision}))});
    staffing.forEach(function(row){list.appendChild(item(row.staffingKind+" · "+row.name,row.statement,function(){el("staffingName").value=row.name;el("staffingKind").value=row.staffingKind;el("staffingStatement").value=row.statement;el("staffingRevision").value=row.revision}))});
    if(!list.childNodes.length) list.textContent="Nothing approved on this plan yet.";
  }
  function rev(id){var n=Number(el(id).value);return n>0?n:undefined}
  el("catalogSelect").onchange=function(){catalogId=this.value;planId="";void loadPlans().catch(function(e){el("workspaceMessage").textContent=e.message})};
  el("planSelect").onchange=function(){planId=this.value;void loadPolicy().catch(function(e){el("workspaceMessage").textContent=e.message})};
  el("catalogForm").onsubmit=async function(e){e.preventDefault();try{var row=await catalogApi("/api/workspace/catalogs",{method:"POST",body:JSON.stringify({name:el("catalogName").value.trim(),description:el("catalogDescription").value.trim()||undefined})});catalogId=row.id;planId="";this.reset();await loadCatalogs();await loadPlans();el("workspaceMessage").textContent="Catalog created."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("planForm").onsubmit=async function(e){e.preventDefault();try{var row=await catalogApi("/api/workspace/plans",{method:"POST",body:JSON.stringify({catalogId:catalogId,name:el("planName").value,summary:el("planSummary").value,expectedRevision:rev("planRevision")})});planId=row.id;el("planRevision").value="";await loadPlans();el("workspaceMessage").textContent="Customer plan saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("windowForm").onsubmit=async function(e){e.preventDefault();try{await catalogApi("/api/workspace/reply-windows",{method:"POST",body:JSON.stringify({catalogId:catalogId,planId:planId,name:el("windowName").value,withinMinutes:Number(el("windowMinutes").value),statement:el("windowStatement").value,expectedRevision:rev("windowRevision")})});el("windowRevision").value="";await loadPolicy();el("workspaceMessage").textContent="Reply window saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("channelForm").onsubmit=async function(e){e.preventDefault();try{await catalogApi("/api/workspace/channels",{method:"POST",body:JSON.stringify({catalogId:catalogId,planId:planId,name:el("channelName").value,channel:el("channelKey").value,statement:el("channelStatement").value,expectedRevision:rev("channelRevision")})});el("channelRevision").value="";await loadPolicy();el("workspaceMessage").textContent="Channel saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("staffingForm").onsubmit=async function(e){e.preventDefault();try{await catalogApi("/api/workspace/staffing",{method:"POST",body:JSON.stringify({catalogId:catalogId,planId:planId,name:el("staffingName").value,staffingKind:el("staffingKind").value,statement:el("staffingStatement").value,expectedRevision:rev("staffingRevision")})});el("staffingRevision").value="";await loadPolicy();el("workspaceMessage").textContent="Staffing promise saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  function resume(){
    try{var saved=sessionStorage.getItem("queuePluginReturn");if(!saved)return false;sessionStorage.removeItem("queuePluginReturn");var pending=JSON.parse(saved);if(!pending||Date.now()-pending.createdAt>600000)return false;location.assign(pending.id?"/oauth/consent?authorization_id="+encodeURIComponent(pending.id):"/connections");return true}catch(e){return false}
  }
  async function init(){
    if(!SUPABASE_URL||!SUPABASE_ANON_KEY||!window.supabase){setSignedOut();showError("Google sign-in is not configured yet.");return}
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{flowType:"implicit",persistSession:true,detectSessionInUrl:true,autoRefreshToken:true}});
    client.auth.onAuthStateChange(function(_e,session){if(session){if(resume())return;setSignedIn(session)}else setSignedOut()});
    var result=await client.auth.getSession();
    var session=result&&result.data?result.data.session:null;
    if(session){if(resume())return;setSignedIn(session)}else setSignedOut();
  }
  el("googleBtn").onclick=async function(){clearError();if(!client){showError("Google sign-in is not configured yet.");return}this.disabled=true;try{var r=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:APP_BASE_URL}});if(r.error)throw r.error}catch(e){this.disabled=false;showError(e.message||String(e))}};
  el("signOutBtn").onclick=async function(){if(client)await client.auth.signOut();setSignedOut();location.href="/"};
  el("portalBtn").onclick=async function(){try{var r=await fetch("/billing/portal",{method:"POST",headers:{Authorization:"Bearer "+token}});var d=await r.json();if(!r.ok)throw Error(d.error||"Unable to open billing");location.href=d.url}catch(e){showError(e.message)}};
  document.querySelectorAll(".checkout").forEach(function(btn){btn.onclick=async function(){clearError();if(!token){showError("Sign in with Google first, then start the trial.");return}if(isPro||!ready){showError("Refresh your subscription status before starting checkout.");return}btn.disabled=true;try{var r=await fetch("/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({plan:btn.getAttribute("data-plan")})});var d=await r.json();if(!r.ok)throw Error(d.error||"Unable to start checkout");location.href=d.url}catch(e){btn.disabled=false;showError(e.message)}}});
  var checkout=new URLSearchParams(location.search).get("checkout");
  if(checkout==="success") el("notice").textContent="Checkout completed. Your subscription is being confirmed.";
  if(checkout==="cancelled") showError("Checkout was cancelled. No changes were made.");
  init();
})();
</script>
</body></html>`;
}
