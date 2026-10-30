const DEFAULT_CENTER = [12.9120, 74.8565];

const form = document.getElementById('report-form');
const resultBox = document.getElementById('result');
const errorBox = document.getElementById('error');
const submitBtn = document.getElementById('submit-btn');
const locationText = document.getElementById('location-text');

const map = L.map('map').setView(DEFAULT_CENTER, 15);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let marker = null;
let picked = null;

function setLocation(lat, lng) {
  picked = { lat: lat, lng: lng };
  if (marker) {
    marker.setLatLng([lat, lng]);
  } else {
    marker = L.marker([lat, lng]).addTo(map);
  }
  locationText.textContent = 'Pin set at ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
}

map.on('click', function (e) {
  setLocation(e.latlng.lat, e.latlng.lng);
});

document.getElementById('locate-btn').addEventListener('click', function () {
  if (!navigator.geolocation) {
    showError('Location is not available here. Tap the map instead.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      hideError();
      setLocation(pos.coords.latitude, pos.coords.longitude);
      map.setView([pos.coords.latitude, pos.coords.longitude], 17);
    },
    function () {
      showError('Could not get your location. Tap the map to drop a pin instead.');
    }
  );
});

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
}

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  hideError();

  const description = document.getElementById('description').value.trim();
  if (description.length < 5) {
    showError('Please describe the problem (at least 5 characters).');
    return;
  }
  if (!picked) {
    showError('Please drop a pin on the map or use your location.');
    return;
  }

  const photoFile = document.getElementById('photo').files[0];
  if (photoFile && photoFile.size > 5 * 1024 * 1024) {
    showError('The photo is too large. Please choose one under 5 MB.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const formData = new FormData();
    formData.append('description', description);
    formData.append('category', document.getElementById('category').value);
    formData.append('address', document.getElementById('address').value.trim());
    formData.append('lat', picked.lat);
    formData.append('lng', picked.lng);
    const photo = document.getElementById('photo').files[0];
    if (photo) {
      formData.append('image', photo);
    }

    const res = await fetch('/api/reports', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Something went wrong. Please try again.');
      return;
    }
    document.getElementById('result-id').textContent = data.id;
    document.getElementById('track-link').href = '/track.html?id=' + encodeURIComponent(data.id);
    const ai = data.ai;
    document.getElementById('result-ai').innerHTML = ai ?
      '<h3>What our AI understood <span class="badge ai">AI: ' + CF.esc(ai.mode) + '</span></h3>' +
      '<p>' + CF.esc(ai.summary) + '</p>' +
      '<p class="hint">Category: ' + CF.esc(CF.LABELS[ai.category] || ai.category) + '</p>' +
      '<p>Priority: ' + CF.levelBadge(ai) + '</p>' + CF.reasonsList(ai) +
      (ai.duplicateOf ? '<p class="hint">Looks similar to ' + CF.esc(ai.duplicateOf) + ' (' + CF.esc(ai.duplicateReason) + '). Linked, so officers see the pattern.</p>' : '') : '';
    form.hidden = true;
    resultBox.hidden = false;
  } catch (err) {
    showError('Could not reach the server. Check your connection.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit report';
  }
});

document.getElementById('another-btn').addEventListener('click', function () {
  form.reset();
  if (marker) {
    map.removeLayer(marker);
    marker = null;
  }
  picked = null;
  locationText.textContent = 'Tap the map to drop a pin.';
  resultBox.hidden = true;
  form.hidden = false;
  map.invalidateSize();
});