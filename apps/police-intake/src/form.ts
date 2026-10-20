/**
 * The protected police pages (wireframe 4.1, docs/POLICE.md), served as static
 * strings so the CSP can forbid inline scripts and styles. No cookies, nothing in
 * browser storage. The only outside script is Cloudflare Turnstile, loaded by the
 * page's own JS. Keep the total under 50 KB.
 *
 * TODO (before launch): photo upload with on-device blur and EXIF strip via a
 * signed vault-bucket URL (docs/POLICE.md task 9).
 */

const SITE_KEY_SLOT = "__TURNSTILE_SITE_KEY__";

/** Puts the Turnstile site key into a page. Anything that isn't a plain key is dropped. */
export function withSiteKey(html: string, siteKey: string | undefined): string {
  return html.replace(SITE_KEY_SLOT, siteKey && /^[A-Za-z0-9_-]{1,100}$/.test(siteKey) ? siteKey : "");
}

const HEAD = (title: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<header>
  <strong>Protected report</strong>
  <a class="exit" href="https://www.google.com/search?q=weather" rel="noreferrer">Quick exit</a>
</header>`;

const TURNSTILE_SLOT = `<div id="ts" data-sitekey="${SITE_KEY_SLOT}"></div>`;

export const FORM_HTML = `${HEAD("Protected report")}
<main>
  <div class="note"><strong>Your safety comes first.</strong> In danger right now? Call 112. Don't film or photograph if it could put you at risk. It's fine to report later, once you're safe.</div>
  <form id="report" novalidate>
    <fieldset>
      <legend>What do you want to report?</legend>
      <label><input type="radio" name="kind" value="misconduct" checked> Something went wrong</label>
      <label><input type="radio" name="kind" value="commendation"> An officer did the right thing</label>
    </fieldset>
    <fieldset data-kind="misconduct">
      <legend>What happened?</legend>
      <label><input type="radio" name="incidentType" value="money_demanded"> Money demanded at checkpoint</label>
      <label><input type="radio" name="incidentType" value="phone_searched_harassment"> Phone searched / harassment</label>
      <label><input type="radio" name="incidentType" value="unlawful_arrest_detention"> Unlawful arrest / detention</label>
      <label><input type="radio" name="incidentType" value="violence"> Violence</label>
    </fieldset>
    <fieldset data-kind="commendation" hidden>
      <legend>What did the officer do?</legend>
      <label><input type="radio" name="incidentType" value="refused_bribe"> Refused a bribe</label>
      <label><input type="radio" name="incidentType" value="helped_me"> Helped me</label>
      <label><input type="radio" name="incidentType" value="respected_rights"> Respected my rights</label>
      <label><input type="radio" name="incidentType" value="professional_conduct"> Professional and courteous</label>
    </fieldset>
    <label>City
      <select name="city"><option value="lagos">Lagos</option><option value="fct">FCT Abuja</option></select>
    </label>
    <label>Where <input name="place" required minlength="2" maxlength="120" placeholder="e.g. Third Mainland Bridge"></label>
    <button type="button" id="locate" class="secondary">Add approximate location (about 1 km)</button>
    <label>When
      <select name="when"><option value="just_now">Just now</option><option value="today">Today</option><option value="earlier">Earlier</option></select>
    </label>
    <label>Time of day <small>Optional</small>
      <select name="timeOfDay"><option value="">Prefer not to say</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option><option value="night">Night</option></select>
    </label>
    <label>In your words <textarea name="description" rows="4" maxlength="2000"></textarea></label>
    <label>Unit, vehicle number or name tag <small>Optional. Only if you saw it safely. Never shown publicly.</small>
      <input name="officerDetails" maxlength="300">
    </label>
    <label class="check"><input type="checkbox" name="consentToForward" checked> Send to the Police Complaint Response Unit and the Police Service Commission (without anything that identifies me)</label>
    <label class="check" data-kind="misconduct"><input type="checkbox" name="wantsLegalAid"> Connect me with free legal aid</label>
    <ul class="promises">
      <li>Fully anonymous: no account, no phone number, no IP address kept</li>
      <li>Shown only as a pattern: about 1 km area, after a delay</li>
    </ul>
    ${TURNSTILE_SLOT}
    <button type="submit">Submit protected report</button>
    <p id="error" role="alert" hidden></p>
  </form>
  <section id="done" hidden>
    <h1>Report received</h1>
    <p>Your status code (shown once, we can't recover it):</p>
    <p class="code" id="code"></p>
    <p>Write it down somewhere safe, or memorise it. Use it at <a href="/status">the status page</a> to see what happened to your report and to message our moderators. We can't contact you, so check back there.</p>
  </section>
</main>
<script src="/app.js"></script>
</body>
</html>`;

export const STATUS_HTML = `${HEAD("Report status")}
<main>
  <form id="lookup" novalidate>
    <h1>Check your report</h1>
    <label>Your six-word code
      <input name="code" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="word-word-word-word-word-word" maxlength="100">
    </label>
    <button type="submit">Check status</button>
    <p id="lookup-error" role="alert" hidden></p>
  </form>
  <section id="report" hidden>
    <div class="card">
      <p class="muted" id="filed"></p>
      <h1 id="status"></h1>
      <p id="detail"></p>
      <ul id="forwards" class="forwards"></ul>
    </div>
    <h2>Messages</h2>
    <p class="muted">Our moderators reply here. We can't notify you, so check back with your code. Never share your name, phone number or anything that could identify you.</p>
    <ol id="messages" class="messages"></ol>
    <form id="message" novalidate>
      <label>Send a message <textarea name="body" rows="3" maxlength="1000"></textarea></label>
      ${TURNSTILE_SLOT}
      <button type="submit">Send</button>
      <p id="message-error" role="alert" hidden></p>
    </form>
  </section>
</main>
<script src="/status.js"></script>
</body>
</html>`;

export const SHARED_CSS = `:root{--ink:#1a1a1a;--muted:#5c5c5c;--line:#d9d9d4;--police:#3a1f4a;--police-soft:#efe6f4}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;font-family:system-ui,sans-serif;background:#fafaf7;color:var(--ink)}
header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px}
.exit{background:var(--ink);color:#fff;padding:10px 14px;border-radius:20px;text-decoration:none;font-weight:700;font-size:14px}
main{max-width:480px;margin:0 auto;padding:0 20px 40px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:24px 0 4px}
a{color:var(--police)}.muted{color:var(--muted);font-size:14px}
.note{background:var(--police-soft);color:#2e1740;padding:12px;border-radius:12px;font-size:14px;margin-bottom:16px}
form{display:flex;flex-direction:column;gap:14px}fieldset{border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px}
label{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:14px}label small{font-weight:400;color:var(--muted)}
fieldset label,.check{flex-direction:row;align-items:center;font-weight:400;gap:10px}
input,select,textarea{font:inherit;font-weight:400;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;min-height:44px}
input[type=radio],input[type=checkbox]{min-height:auto;width:20px;height:20px}
button{font:inherit;font-weight:600;min-height:52px;border:0;border-radius:12px;background:var(--police);color:#fff}
button:disabled{opacity:.5}button.secondary{background:#fff;color:var(--ink);border:1px solid var(--line);min-height:44px}
.promises{font-size:13px;color:var(--muted);padding-left:18px;margin:0}
[role=alert]{background:#fbebd7;color:#5e3300;padding:12px;border-radius:10px;margin:0}
.code{font-size:22px;font-weight:700;letter-spacing:.02em;background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;text-align:center;word-break:break-word}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
.forwards{list-style:none;padding:0;margin:12px 0 0;display:flex;flex-direction:column;gap:6px;font-size:14px}
.messages{list-style:none;padding:0;margin:12px 0;display:flex;flex-direction:column;gap:8px}
.messages li{padding:10px 12px;border-radius:12px;max-width:85%;white-space:pre-wrap;word-break:break-word}
.messages .reporter{background:var(--police-soft);align-self:flex-end}.messages .moderator{background:#fff;border:1px solid var(--line)}
.messages small{display:block;color:var(--muted);font-size:12px;margin-top:4px}`;

/** Turnstile widget helper shared by both pages. Loads Cloudflare's script only when a site key is set. */
const TURNSTILE_JS = `var TS=(function(){
var el=document.getElementById('ts'),key=el&&el.getAttribute('data-sitekey'),token=null,id=null,changed=function(){};
function set(t){token=t;changed();}
if(key){var s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;
s.onload=function(){id=window.turnstile.render(el,{sitekey:key,appearance:'interaction-only',callback:set,'expired-callback':function(){set(null);},'error-callback':function(){set(null);}});};
document.head.appendChild(s);}
return{ready:function(){return !key||!!token;},token:function(){return token;},onChange:function(f){changed=f;f();},
reset:function(){set(null);if(id!==null&&window.turnstile)window.turnstile.reset(id);}};
})();
function post(path,body){return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',referrerPolicy:'no-referrer'})
.then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};},function(){return{ok:false,d:{}};});},function(){return{ok:false,d:{error:'No connection. Check your internet and try again.'}};});}
function show(el,msg){el.textContent=msg;el.hidden=!msg;}`;

export const FORM_JS = `(function(){
${TURNSTILE_JS}
var form=document.getElementById('report'),err=document.getElementById('error'),submit=form.querySelector('button[type=submit]'),coords=null;
TS.onChange(function(){submit.disabled=!TS.ready();});
form.addEventListener('change',function(e){
  if(e.target.name!=='kind')return;
  var kind=e.target.value;
  Array.prototype.forEach.call(form.querySelectorAll('[data-kind]'),function(el){el.hidden=el.getAttribute('data-kind')!==kind;});
  Array.prototype.forEach.call(form.querySelectorAll('input[name=incidentType]'),function(i){i.checked=false;});
});
document.getElementById('locate').addEventListener('click',function(e){
  if(!navigator.geolocation)return;
  e.target.textContent='Finding location…';
  navigator.geolocation.getCurrentPosition(function(p){coords={lat:p.coords.latitude,lng:p.coords.longitude};e.target.textContent='Approximate location added ✓';},
  function(){e.target.textContent='Location unavailable (optional)';},{timeout:15000});
});
form.addEventListener('submit',function(e){
  e.preventDefault();show(err,'');
  var f=new FormData(form),kind=f.get('kind'),type=f.get('incidentType');
  if(!type||!f.get('place')){show(err,kind==='commendation'?'Choose what the officer did, and where.':'Choose what happened and where.');return;}
  var body={kind:kind,city:f.get('city'),incidentType:type,place:f.get('place'),when:f.get('when'),description:f.get('description')||'',
    consentToForward:f.get('consentToForward')==='on',wantsLegalAid:kind==='misconduct'&&f.get('wantsLegalAid')==='on',turnstileToken:TS.token()};
  if(f.get('timeOfDay'))body.timeOfDay=f.get('timeOfDay');
  if(f.get('officerDetails'))body.officerDetails=f.get('officerDetails');
  if(coords){body.lat=coords.lat;body.lng=coords.lng;}
  submit.disabled=true;
  post('/api/submit',body).then(function(x){
    if(!x.ok){TS.reset();show(err,x.d.error||'Something went wrong. Please try again.');return;}
    form.reset();form.hidden=true;document.getElementById('code').textContent=x.d.statusCode;document.getElementById('done').hidden=false;
  });
});
})();`;

export const STATUS_JS = `(function(){
${TURNSTILE_JS}
var STATUS={new:['Received','A trained moderator will review your report.'],consistent:['Reviewed','A moderator has reviewed your report.'],
  forwarded:['Forwarded','Your report has been sent on, without anything that identifies you.'],closed:['Closed','This report is closed.'],
  rejected:['Not taken forward','']};
var RECIPIENT={cru:'Police Complaint Response Unit',psc:'Police Service Commission'};
var OUTCOME={awaiting:'waiting for a response',acknowledged:'acknowledged',action_reported:'action reported',no_response:'no response after 30 days'};
var lookup=document.getElementById('lookup'),lookupErr=document.getElementById('lookup-error'),report=document.getElementById('report'),
  msgForm=document.getElementById('message'),msgErr=document.getElementById('message-error'),send=msgForm.querySelector('button'),code=null;
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function render(t){
  var s=STATUS[t.status]||[t.status,''];
  document.getElementById('filed').textContent=(t.kind==='commendation'?'Commendation':'Report')+' filed '+t.filed_on;
  document.getElementById('status').textContent=s[0];
  document.getElementById('detail').textContent=t.status==='rejected'?(t.reject_reason||''):s[1];
  var fw=document.getElementById('forwards');fw.textContent='';
  t.forwards.forEach(function(f){fw.appendChild(el('li',null,(RECIPIENT[f.recipient]||f.recipient)+': '+(OUTCOME[f.outcome]||f.outcome)));});
  var ms=document.getElementById('messages');ms.textContent='';
  if(!t.messages.length)ms.appendChild(el('li','moderator','No messages yet.'));
  t.messages.forEach(function(m){var li=el('li',m.author,m.body);li.appendChild(el('small',null,(m.author==='reporter'?'You':'Moderator')+', '+m.sent_on));ms.appendChild(li);});
  msgForm.hidden=t.status==='closed';
  lookup.hidden=true;report.hidden=false;
}
function refresh(){return post('/api/status',{code:code}).then(function(x){if(x.ok)render(x.d);return x;});}
lookup.addEventListener('submit',function(e){
  e.preventDefault();show(lookupErr,'');
  var input=lookup.elements.code;code=input.value;
  refresh().then(function(x){if(x.ok){input.value='';}else{code=null;show(lookupErr,x.d.error||'Something went wrong. Please try again.');}});
});
TS.onChange(function(){send.disabled=!TS.ready();});
msgForm.addEventListener('submit',function(e){
  e.preventDefault();show(msgErr,'');
  var text=msgForm.elements.body.value.trim();
  if(!text){show(msgErr,'Write a message first.');return;}
  send.disabled=true;
  post('/api/message',{code:code,body:text,turnstileToken:TS.token()}).then(function(x){
    TS.reset();
    if(!x.ok){show(msgErr,x.d.error||'Something went wrong. Please try again.');return;}
    msgForm.reset();refresh();
  });
});
})();`;
