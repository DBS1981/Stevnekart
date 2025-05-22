// oppdater.js

// Åpne popup når knappen trykkes
document.getElementById('oppdaterStevnerBtn').onclick = () => {
  document.getElementById('oppdaterPopup').style.display = 'block';
};

// Send forespørsel til backend for å hente stevner
document.getElementById('startOppdatering').onclick = async () => {
  const fra = document.getElementById('datoFra').value;
  const til = document.getElementById('datoTil').value;

  if (!fra || !til) {
    alert('❗ Du må velge både fra- og til-dato.');
    return;
  }

  try {
    const res = await fetch('/api/oppdater-stevner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fra, til })
    });

    if (!res.ok) throw new Error(`Server svarte med ${res.status}`);
    const data = await res.json();

    alert(`✅ Oppdatering fullført\nAntall stevner: ${data.antall}`);
    document.getElementById('oppdaterPopup').style.display = 'none';

    // Laster siden på nytt så nye stevner vises
    location.reload();
  } catch (err) {
    console.error('🚨 Feil under oppdatering:', err);
    alert('❌ Noe gikk galt: ' + err.message);
  }
};

document.getElementById("oppdaterSkytterlagBtn").addEventListener("click", () => {
  fetch("/api/oppdater-skytterlag", {
    method: "POST"
  })
    .then(res => res.json())
    .then(data => {
      alert("✅ Skytterlag oppdatert! Antall lag: " + data.antall);
    })
    .catch(err => {
      alert("❌ Feil ved oppdatering av skytterlag: " + err.message);
    });
});
