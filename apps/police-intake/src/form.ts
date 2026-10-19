/**
 * The protected police form (wireframe 4.1), served as three static strings so
 * the CSP can forbid inline scripts and styles. No third-party assets, no cookies.
 * Keep the total under 50 KB.
 *
 * TODO (before launch): photo upload with on-device blur and EXIF strip via a
 * signed vault-bucket URL; a status-check page for the four-word code.
 */

export const FORM_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Protected report</title>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<header>
  <strong>Protected report</strong>
  <a class="exit" href="https://www.google.com/search?q=weather" rel="noreferrer">Quick exit</a>
</header>
<main>
  <div class="note"><strong>Your safety comes first.</strong> In danger right now? Call 112. Don't film or photograph if it could put you at risk.</div>
  <form id="report" novalidate>
    <fieldset>
      <legend>What happened?</legend>
      <label><input type="radio" name="incidentType" value="money_demanded" required> Money demanded at checkpoint</label>
      <label><input type="radio" name="incidentType" value="phone_searched_harassment"> Phone searched / harassment</label>
      <label><input type="radio" name="incidentType" value="unlawful_arrest_detention"> Unlawful arrest / detention</label>
      <label><input type="radio" name="incidentType" value="violence"> Violence</label>
    </fieldset>
    <label>City
      <select name="city"><option value="lagos">Lagos</option><option value="fct">FCT Abuja</option></select>
    </label>
    <label>Where <input name="place" required minlength="2" maxlength="120" placeholder="e.g. Third Mainland Bridge"></label>
    <button type="button" id="locate" class="secondary">Add approximate location (about 1 km)</button>
    <label>When
      <select name="when"><option value="just_now">Just now</option><option value="today">Today</option><option value="earlier">Earlier</option></select>
    </label>
    <label>What happened, in your words <textarea name="description" rows="4" maxlength="2000"></textarea></label>
    <label>Unit, vehicle number or name tag <small>Optional. Only if you saw it safely. Never shown publicly.</small>
      <input name="officerDetails" maxlength="300">
    </label>
    <label class="check"><input type="checkbox" name="consentToForward" checked> Send to the Police Complaint Response Unit (without anything that identifies me)</label>
    <label class="check"><input type="checkbox" name="wantsLegalAid"> Connect me with free legal aid</label>
    <ul class="promises">
      <li>Fully anonymous: no account, no phone number, no IP address kept</li>
      <li>Shown only as a pattern: about 1 km area, after 48 hours</li>
    </ul>
    <button type="submit">Submit protected report</button>
    <p id="error" role="alert" hidden></p>
  </form>
  <section id="done" hidden>
    <h1>Report received</h1>
    <p>Your status code (shown once, we can't recover it):</p>
    <p class="code" id="code"></p>
    <p>Write it down somewhere safe, or memorise it.</p>
  </section>
</main>
<script src="/app.js"></script>
</body>
</html>`;

export const FORM_CSS = `:root{--ink:#1a1a1a;--muted:#5c5c5c;--line:#d9d9d4;--police:#3a1f4a;--police-soft:#efe6f4}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;font-family:system-ui,sans-serif;background:#fafaf7;color:var(--ink)}
header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px}
.exit{background:var(--ink);color:#fff;padding:10px 14px;border-radius:20px;text-decoration:none;font-weight:700;font-size:14px}
main{max-width:480px;margin:0 auto;padding:0 20px 40px}
.note{background:var(--police-soft);color:#2e1740;padding:12px;border-radius:12px;font-size:14px;margin-bottom:16px}
form{display:flex;flex-direction:column;gap:14px}fieldset{border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px}
label{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:14px}label small{font-weight:400;color:var(--muted)}
fieldset label,.check{flex-direction:row;align-items:center;font-weight:400;gap:10px}
input,select,textarea{font:inherit;font-weight:400;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;min-height:44px}
input[type=radio],input[type=checkbox]{min-height:auto;width:20px;height:20px}
button{font:inherit;font-weight:600;min-height:52px;border:0;border-radius:12px;background:var(--police);color:#fff}
button.secondary{background:#fff;color:var(--ink);border:1px solid var(--line);min-height:44px}
.promises{font-size:13px;color:var(--muted);padding-left:18px;margin:0}
#error{background:#fbebd7;color:#5e3300;padding:12px;border-radius:10px}
.code{font-size:24px;font-weight:700;letter-spacing:.02em;background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;text-align:center}`;

export const FORM_JS = `(function(){
var form=document.getElementById('report'),err=document.getElementById('error'),coords=null;
document.getElementById('locate').addEventListener('click',function(e){
  if(!navigator.geolocation)return;
  e.target.textContent='Finding location…';
  navigator.geolocation.getCurrentPosition(function(p){coords={lat:p.coords.latitude,lng:p.coords.longitude};e.target.textContent='Approximate location added ✓';},
  function(){e.target.textContent='Location unavailable (optional)';},{timeout:15000});
});
form.addEventListener('submit',function(e){
  e.preventDefault();err.hidden=true;
  var f=new FormData(form),type=f.get('incidentType');
  if(!type||!f.get('place')){err.textContent='Choose what happened and where.';err.hidden=false;return;}
  var body={city:f.get('city'),incidentType:type,place:f.get('place'),when:f.get('when'),description:f.get('description')||'',
    consentToForward:f.get('consentToForward')==='on',wantsLegalAid:f.get('wantsLegalAid')==='on'};
  if(f.get('officerDetails'))body.officerDetails=f.get('officerDetails');
  if(coords){body.lat=coords.lat;body.lng=coords.lng;}
  fetch('/api/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',referrerPolicy:'no-referrer'})
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
  .then(function(x){
    if(!x.ok)throw new Error(x.d.error||'Something went wrong.');
    form.reset();form.hidden=true;document.getElementById('code').textContent=x.d.statusCode;document.getElementById('done').hidden=false;
  }).catch(function(e2){err.textContent=e2.message;err.hidden=false;});
});
})();`;
