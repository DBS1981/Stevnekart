// reiseplanlegger.js – stabil og smart reiseplan basert på skytetid eller manuelle punkter

function finnMatchendeStevne(punkt, mineStevner) {
  if (!punkt || typeof punkt.eventId === 'undefined') return null;
  const eid = `${punkt.eventId}`;

  const match = mineStevner.find(s => `${s.eventId}` === eid);
  if (!match) {
    console.warn(`⚠️ Fant ikke match på eventId=${eid}, navn=${punkt.navn}`);
  }
  return match;
}


async function hentKjøreTidORS(start, slutt) {
  const apiKey = "5b3ce3597851110001cf6248679114c65ed6488ab19c6215246c12f4";
  const url = `https://api.openrouteservice.org/v2/directions/driving-car`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ coordinates: [[start.lng, start.lat], [slutt.lng, slutt.lat]] })
    });
    const data = await response.json();
    const sekunder = data.routes?.[0]?.summary?.duration || null;
    const coordinates = data.routes?.[0]?.geometry?.coordinates;
    return {
      minutter: sekunder ? Math.round(sekunder / 60) : null,
      linje: coordinates ? L.polyline(coordinates.map(([lng, lat]) => [lat, lng]), {
        color: "blue", weight: 4, opacity: 0.6
      }) : null
    };
  } catch (e) {
    console.warn("Feil ved henting av kjøredata fra ORS:", e);
    return { minutter: null, linje: null };
  }
}

function parseKjøretidTilMinutter(tidStr) {
  if (!tidStr || typeof tidStr !== "string") return null;
  const deler = tidStr.split(":");
  if (deler.length !== 2) return null;
  const [timer, minutter] = deler.map(Number);
  return isNaN(timer) || isNaN(minutter) ? null : timer * 60 + minutter;
}

function rensReiseruteData(reiserute) {
  if (!Array.isArray(reiserute)) return [];
  return reiserute.map(punkt => {
    const kopi = { ...punkt };
    if (kopi.skytetid && typeof kopi.skytetid === "string") {
      const d = new Date(kopi.skytetid);
      kopi.skytetid = !isNaN(d.getTime()) ? d.toISOString().slice(0, 16) : null;
    }
    return kopi;
  });
}

function formatTilLocalInput(date) {
  if (typeof date === "string") date = new Date(date);
  return date instanceof Date && !isNaN(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : '';
}

function visReiseplanPopup(plan) {
  let html = `<h3>🧭 Generert reiseplan Demo (underutvikling)</h3><table style="width:100%; font-size:0.9em; border-collapse:collapse;">
  <tr style="background:#eee;"><th>Stevne/stopp</th><th>Skytetid</th><th>Ankomst</th><th>Avreise</th><th>Forberedelse</th><th>Varighet</th><th>Forsinkelse</th><th>Kjøretid</th></tr>`;

  plan.forEach((p, idx) => {
    const erStopp = !p.eventId && !p.skytetid;
    html += `<tr>
      <td>${idx + 1}. ${p.navn}</td>
      <td>${erStopp ? '-' : `<input type="datetime-local" value="${formatTilLocalInput(p.skytetid)}" oninput="oppdaterPlanFelt(${idx}, 'skytetid', this.value)">`}</td>
      <td>${formatTilLocalInput(p.ankomstTid)}</td>
      <td>${formatTilLocalInput(p.avreiseTid)}</td>
      <td>${erStopp ? '-' : `${p.forberedelse} min`}</td>
      <td>${erStopp ? '-' : `${p.varighet} min`}</td>
      <td>${erStopp ? '-' : (p.forsinkelseMin != null ? `${Math.floor(p.forsinkelseMin / 60)}:${String(p.forsinkelseMin % 60).padStart(2, "0")}` : '-')}</td>
      <td>${p.kjøretid || ''}</td>
    </tr>`;
  });

  html += `</table><br><button onclick="lagReiseplan()">🔁 Oppdater plan</button> <button onclick="document.getElementById('reiseplanPopup').style.display='none'">Lukk</button>`;

  let popup = document.getElementById("reiseplanPopup");
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "reiseplanPopup";
    Object.assign(popup.style, {
      position: "fixed",
      bottom: "20px",
      left: "20px",
      background: "white",
      border: "1px solid #ccc",
      padding: "10px",
      zIndex: 10001,
      maxWidth: "1200px",
      overflowX: "auto",
      maxHeight: "80vh",
      boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
    });
    document.body.appendChild(popup);
  }
  popup.innerHTML = html;
  popup.style.display = "block";
}

function oppdaterPlanFelt(idx, felt, verdi) {
  if (!window.valgtReiserute || !window.valgtReiserute[idx]) return;
  if (felt === "skytetid") {
    const d = new Date(verdi);
    if (!isNaN(d.getTime())) {
      window.valgtReiserute[idx].skytetid = d.toISOString().slice(0, 16);
    }
  }
}

async function lagReiseplan(valgtePunkter = rensReiseruteData(window.valgtReiserute), mineStevner = window.mineStevner) {
  if (!valgtePunkter || valgtePunkter.length === 0) {
    alert("Ingen punkter i reiserute.");
    return;
  }

  if (!window.reiseLinjerLayer) {
    window.reiseLinjerLayer = L.layerGroup().addTo(map);
  }
  window.reiseLinjerLayer.clearLayers();

  const plan = [];

  // Første steg: sikre at alle punkter har eventId og skytetid hvis det finnes i mineStevner
  valgtePunkter.forEach(p => {
    const match = finnMatchendeStevne(p, mineStevner);
    if (match) {
      if (!p.eventId && match.eventId) {
        p.eventId = match.eventId;
      }
      if ((!p.skytetid || isNaN(new Date(p.skytetid).getTime())) && match.startTime) {
      const tid = new Date(match.startTime);
      if (!isNaN(tid.getTime())) {
        p.skytetid = tid.toISOString();
      } else {
        console.warn(`❗ Ugyldig eller manglende startTime for ${p.navn}:`, match.startTime);
        }
      }
    }
  });

  for (let i = 0; i < valgtePunkter.length; i++) {
    const p = valgtePunkter[i];
    // Match allerede gjort i init – ingen grunn til å gjøre det igjen

    const erStopp = !p.eventId && !p.skytetid;
    let skytetid = null;
    if (typeof p.skytetid === "string") {
      const d = new Date(p.skytetid);
      if (!isNaN(d.getTime())) {
        skytetid = d;
      }
    }
    if (!p.skytetid && i === 0) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      skytetid = d;
      console.warn(`⏰ Automatisk satt skytetid for første punkt (${p.navn}) til ${skytetid.toISOString()}`);
    } else if (p.skytetid instanceof Date && !isNaN(p.skytetid.getTime())) {
      skytetid = p.skytetid;
    } else if (typeof p.skytetid === "string") {
      const d = new Date(p.skytetid);
      if (!isNaN(d.getTime())) {
        skytetid = d;
      }
    }

    if (!erStopp && (!skytetid || isNaN(skytetid.getTime()))) {
      console.warn(`⚠️ Skytetid mangler eller ugyldig for ${p.navn} – vises likevel for manuell redigering.`);
      p.feil = true;
    }

    const forberedelseMin = erStopp ? 0 : (p.forberedelse != null ? parseInt(p.forberedelse) : 30);
    const varighetMin = erStopp ? 0 : (p.varighet != null ? parseInt(p.varighet) : 60);

    let ankomstTid = skytetid ? new Date(skytetid.getTime() - forberedelseMin * 60000) : null;
    let avreiseTid = skytetid ? new Date(skytetid.getTime() + varighetMin * 60000) : null;

    let forrige = null;
    let kjøretidMin = parseKjøretidTilMinutter(p.kjøretid);
    if (plan.length > 0) {
      forrige = plan.slice().reverse().find(p => p.avreiseTid && !isNaN(new Date(p.avreiseTid).getTime()));
            if (
        forrige &&
        !kjøretidMin &&
        forrige.posisjon?.lat != null &&
        forrige.posisjon?.lng != null &&
        p.posisjon?.lat != null &&
        p.posisjon?.lng != null
      ) {
        const result = await hentKjøreTidORS(forrige.posisjon, p.posisjon);
        kjøretidMin = result.minutter;
        p.kjøretid = kjøretidMin ? `${Math.floor(kjøretidMin / 60)}:${String(kjøretidMin % 60).padStart(2, "0")}` : "";
        if (result.linje) window.reiseLinjerLayer.addLayer(result.linje);
      }

      kjøretidMin = kjøretidMin || 60;
      if (forrige && (!forrige.avreiseTid || isNaN(new Date(forrige.avreiseTid).getTime()))) {
        console.warn(`❗ Forrige punkt mangler gyldig avreiseTid: ${forrige.navn} – hopper over tidsberegning`);
      } else {
        if (forrige?.avreiseTid && !isNaN(new Date(forrige.avreiseTid).getTime())) {
        ankomstTid = new Date(new Date(forrige.avreiseTid).getTime() + kjøretidMin * 60000);
        avreiseTid = new Date(ankomstTid.getTime() + (forberedelseMin + varighetMin) * 60000);
      } else {
        console.warn(`❗ Forrige punkt mangler gyldig avreiseTid (eller forrige er null) for ${p.navn}`);
      }
      }
      
    }

    let forsinkelseMin = null;
    if (!erStopp && skytetid && ankomstTid && !isNaN(skytetid.getTime()) && !isNaN(ankomstTid.getTime())) {
      forsinkelseMin = Math.max(0, Math.round((ankomstTid.getTime() - skytetid.getTime() + forberedelseMin * 60000) / 60000));
    }

    plan.push({
      ...p,
      skytetid: skytetid ? skytetid.toISOString() : null,
      ankomstTid: ankomstTid ? ankomstTid.toISOString() : null,
      avreiseTid: avreiseTid ? avreiseTid.toISOString() : null,
      forberedelse: forberedelseMin,
      varighet: varighetMin,
      forsinkelseMin
    });
  }

  window.valgtReiserute = plan;

  visReiseplanPopup(plan);

  fetch("/api/reiseplan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan)
  });
}

window.lagReiseplan = lagReiseplan;

document.addEventListener("DOMContentLoaded", () => {
  const knapp = document.getElementById("visReiseplanKnapp");
  if (knapp) {
    knapp.addEventListener("click", () => {
      if (!window.valgtReiserute || window.valgtReiserute.length === 0) {
        alert("Ingen punkter i reiserute.");
        return;
      }

      const renset = rensReiseruteData(window.valgtReiserute);

      fetch("/api/reiseplan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(renset)
      })
      .then(() => lagReiseplan(renset, window.mineStevner || []))
      .catch(err => console.error("Feil ved lagring av reiseplan:", err));
    });
  }
});
