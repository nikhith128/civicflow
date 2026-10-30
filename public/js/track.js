const form = document.getElementById('track-form');
const input = document.getElementById('rid');
const box = document.getElementById('result');
const errorBox = document.getElementById('error');
let timer = null;

async function load(id, quiet) {
  if (!quiet) { errorBox.hidden = true; box.hidden = true; }
  try {
    const r = await CF.api('/api/reports/' + encodeURIComponent(id));
    const ai = r.ai;
    box.innerHTML =
      '<h2>' + CF.esc(r.id) + ' ' + CF.statusBadge(r.status) + '</h2>' +
      '<p>' + CF.esc(ai ? ai.summary : r.description) + '</p>' +
      '<p class="hint">' + CF.esc(CF.LABELS[CF.categoryOf(r)] || '') +
      (r.location.address ? ' · ' + CF.esc(r.location.address) : '') +
      ' · Submitted ' + CF.esc(CF.fmtDate(r.createdAt)) + '</p>' +
      '<p><strong>Assigned to:</strong> ' + (r.assignedTo ? CF.esc(r.assignedTo) + ' <span class="hint">(mocked team)</span>' : 'Not assigned yet') + '</p>' +
      (r.imagePath ? '<img class="photo" src="/' + CF.esc(r.imagePath) + '" alt="Photo you uploaded">' : '') +
      '<h3>Progress</h3>' + CF.timeline(r.timeline);
    box.hidden = false;
    errorBox.hidden = true;
  } catch (err) {
    if (quiet) return;
    errorBox.textContent = err.status === 404 ? 'No report found with that ID. Check it and try again.' : 'Could not load the report. Try again.';
    errorBox.hidden = false;
  }
}

function start(id) {
  clearInterval(timer);
  load(id, false);
  timer = setInterval(function () { load(id, true); }, 15000); // pick up status changes while the page stays open
}

form.addEventListener('submit', function (e) {
  e.preventDefault();
  const id = input.value.trim().toUpperCase();
  if (!/^CF-\d{4}$/.test(id)) {
    errorBox.textContent = 'IDs look like CF-0041.';
    errorBox.hidden = false;
    return;
  }
  history.replaceState(null, '', '?id=' + encodeURIComponent(id));
  start(id);
});

const fromUrl = new URLSearchParams(location.search).get('id');
if (fromUrl) { input.value = fromUrl.toUpperCase(); start(input.value); }
