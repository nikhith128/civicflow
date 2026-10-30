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

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: description,
        category: document.getElementById('category').value,
        address: document.getElementById('address').value.trim(),
        lat: picked.lat,
        lng: picked.lng
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Something went wrong. Please try again.');
      return;
    }
    document.getElementById('result-id').textContent = data.id;
    document.getElementById('track-link').href = '/track.html?id=' + encodeURIComponent(data.id);
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