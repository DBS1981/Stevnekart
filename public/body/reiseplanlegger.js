// reiseplanlegger.js – forbedret reiseplan basert på skytetid + kjøredata

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

// Normaliserer reiserute-data før ny plan genereres
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

// Til bruk for datetime-local input
function formatTilLocalInput(date) {
  if (!date) return '';
  if (typeof date === "string") date = new Date(date);
  return date instanceof Date && !isNaN(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : '';
}

// Leseable label for forsinkelse
function formatForsinkelseLabel(forsinkelseMin) {
  if (forsinkelseMin == null) return '-';
  if (forsinkelseMin > 0) return `${forsinkelseMin} min for sen`;
  if (forsinkelseMin < 0) return `${Math.abs(forsinkelseMin)} min å gå på`;
  return '0 min margin';
}

function visReiseplanPopup(plan) {
  let html = `
    <div style="
      background:#fff;
      border-radius:16px;
      padding:16px 18px 18px;
      max-width:1200px;
      box-shadow:0 18px 40px rgba(15,23,42,0.25);
    ">
      <h3 style="margin-top:0; margin-bottom:10px; font-size:18px;">
        🧭 Generert reiseplan Demo <span style="font-size:11px; color:#6b7280;">(under utvikling)</span>
      </h3>
      <table style="width:100%; font-size:0.9em; border-collapse:collapse;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="text-align:left; padding:6px 8px;">Stevne/stopp</th>
            <th style="text-align:left; padding:6px 8px;">Skytetid</th>
            <th style="text-align:left; padding:6px 8px;">Ankomst</th>
            <th style="text-align:left; padding:6px 8px;">Avreise</th>
            <th style="text-align:left; padding:6px 8px;">Forberedelse</th>
            <th style="text-align:left; padding:6px 8px;">Varighet</th>
            <th style="text-align:left; padding:6px 8px;">Forsinkelse</th>
            <th style="text-align:left; padding:6px 8px;">Kjøretid</th>
          </tr>
        </thead>
        <tbody>
  `;

  plan.forEach((p, idx) => {
    const erStopp = !p.eventId && !p.skytetid;

    const skytetidCell = erStopp
      ? '-'
      : `<input type="datetime-local"
                 value="${formatTilLocalInput(p.skytetid)}"
                 oninput="oppdaterPlanFelt(${idx}, 'skytetid', this.value)"
                 style="font-size:0.9em; padding:3px 6px; border-radius:6px; border:1px solid #d1d5db;">`;

    const forberedelseCell = erStopp
      ? '-'
      : `<input type="number"
                 min="0"
                 value="${p.forberedelse != null ? p.forberedelse : 30}"
                 oninput="oppdaterPlanFelt(${idx}, 'forberedelse', this.value)"
                 style="width:60px; font-size:0.9em; padding:3px 4px; border-radius:6px; border:1px solid #d1d5db;"> min`;

    const varighetCell = erStopp
      ? '-'
      : `<input type="number"
                 min="0"
                 value="${p.varighet != null ? p.varighet : 60}"
                 oninput="oppdaterPlanFelt(${idx}, 'varighet', this.value)"
                 style="width:60px; font-size:0.9em; padding:3px 4px; border-radius:6px; border:1px solid #d1d5db;"> min`;

    let forsinkelseTekst = '-';
    let forsinkelseStyle = '';

    if (!erStopp && p.forsinkelseMin != null) {
      forsinkelseTekst = formatForsinkelseLabel(p.forsinkelseMin);
      if (p.forsinkelseMin > 0) {
        forsinkelseStyle = 'color:#b91c1c; font-weight:bold;';     // for sen
      } else if (p.forsinkelseMin < 0) {
        forsinkelseStyle = 'color:#166534;';                        // god margin
      }
    }

    html += `
      <tr>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">
          ${idx + 1}. ${p.navn}
        </td>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">
          ${skytetidCell}
        </td>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">
          ${formatTilLocalInput(p.ankomstTid) || '-'}
        </td>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">
          ${formatTilLocalInput(p.avreiseTid) || '-'}
        </td>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">
          ${forberedelseCell}
        </td>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">
          ${varighetCell}
        </td>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; ${forsinkelseStyle}">
          ${forsinkelseTekst}
        </td>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">
          ${p.kjøretid || ''}
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button onclick="lagReiseplan()" style="
          border:none; border-radius:999px; padding:6px 12px;
          background:#2563eb; color:#f9fafb; cursor:pointer; font-size:13px;">
          🔁 Oppdater plan
        </button>
        <button onclick="document.getElementById('reiseplanPopup').style.display='none'" style="
          border:1px solid #d1d5db; border-radius:999px; padding:6px 12px;
          background:#fff; color:#111827; cursor:pointer; font-size:13px;">
          Lukk
        </button>
      </div>
    </div>
  `;

  let popup = document.getElementById("reiseplanPopup");
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "reiseplanPopup";
    Object.assign(popup.style, {
      position: "fixed",
      bottom: "20px",
      left: "20px",
      background: "transparent",
      border: "none",
      padding: "0",
      zIndex: 10001,
      maxWidth: "1200px",
      overflowX: "auto",
      maxHeight: "80vh"
    });
    document.body.appendChild(popup);
  }
  popup.innerHTML = html;
  popup.style.display = "block";
}

// Oppdaterer verdier i den aktive reiseruten når bruker endrer input i tabellen
function oppdaterPlanFelt(idx, felt, verdi) {
  if (!window.valgtReiserute || !window.valgtReiserute[idx]) return;
  const p = window.valgtReiserute[idx];

  if (felt === "skytetid") {
    const d = new Date(verdi);
    if (!isNaN(d.getTime())) {
      // lagres kortformat – lagReiseplan gjør om til full ISO
      p.skytetid = d.toISOString().slice(0, 16);
    } else {
      p.skytetid = null;
    }
  } else if (felt === "forberedelse" || felt === "varighet") {
    const tall = parseInt(verdi, 10);
    p[felt] = isNaN(tall) || tall < 0 ? 0 : tall;
  }
}

/**
 * Hovedmotor for reiseplan:
 * - sikrer skytetid (Mine stevner / fallback)
 * - henter kjøre­tider (ORS) ved behov
 * - beregner ankomst, avreise, forsinkelseMin
 * - lagrer til /api/reiseplan
 */
async function lagReiseplan(
  valgtePunkter = rensReiseruteData(window.valgtReiserute),
  mineStevner = window.mineStevner
) {
  if (!valgtePunkter || valgtePunkter.length === 0) {
    alert("Ingen punkter i reiserute.");
    return;
  }

  if (!window.reiseLinjerLayer) {
    window.reiseLinjerLayer = L.layerGroup().addTo(map);
  }
  window.reiseLinjerLayer.clearLayers();

  const plan = [];

  // Først: forsøk å fylle inn eventId + skytetid fra Mine stevner
  valgtePunkter.forEach(p => {
    const match = finnMatchendeStevne(p, mineStevner || []);
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

    const erStopp = !p.eventId && !p.skytetid;
    let skytetid = null;

    if (typeof p.skytetid === "string") {
      const d = new Date(p.skytetid);
      if (!isNaN(d.getTime())) skytetid = d;
    } else if (p.skytetid instanceof Date && !isNaN(p.skytetid.getTime())) {
      skytetid = p.skytetid;
    }

    // Første punkt uten skytetid → default kl 12:00 i dag
    if (!skytetid && i === 0) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      skytetid = d;
      console.warn(`⏰ Automatisk satt skytetid for første punkt (${p.navn}) til ${skytetid.toISOString()}`);
    }

    if (!erStopp && (!skytetid || isNaN(skytetid.getTime()))) {
      console.warn(`⚠️ Skytetid mangler eller ugyldig for ${p.navn} – vises likevel for manuell redigering.`);
      p.feil = true;
    }

    const forberedelseMin = erStopp ? 0 : (p.forberedelse != null ? parseInt(p.forberedelse, 10) || 0 : 30);
    const varighetMin = erStopp ? 0 : (p.varighet != null ? parseInt(p.varighet, 10) || 0 : 60);

    let ankomstTid = null;
    let avreiseTid = null;

    // Finn forrige punkt i plan som har gyldig avreiseTid
    let forrige = null;
    if (plan.length > 0) {
      forrige = plan.slice().reverse().find(x => x.avreiseTid && !isNaN(new Date(x.avreiseTid).getTime()));
    }

    let kjøretidMin = parseKjøretidTilMinutter(p.kjøretid);

    // Hvis vi har forrige punkt og ikke har kjøretid → hent fra ORS
    if (forrige && (!kjøretidMin || isNaN(kjøretidMin))) {
      if (
        forrige.posisjon?.lat != null &&
        forrige.posisjon?.lng != null &&
        p.posisjon?.lat != null &&
        p.posisjon?.lng != null
      ) {
        const result = await hentKjøreTidORS(forrige.posisjon, p.posisjon);
        kjøretidMin = result.minutter;
        p.kjøretid = kjøretidMin
          ? `${Math.floor(kjøretidMin / 60)}:${String(kjøretidMin % 60).padStart(2, "0")}`
          : "";
        if (result.linje) window.reiseLinjerLayer.addLayer(result.linje);
      }
    }

    // Default kjøretid hvis fortsatt ukjent og ikke første punkt
    if (forrige && (!kjøretidMin || isNaN(kjøretidMin))) {
      kjøretidMin = 60; // fallback 1 time
    }

    if (!forrige) {
      // Første punkt: sett ankomst/avreise basert på skytetid eller nå
      if (skytetid && !isNaN(skytetid.getTime())) {
        const requiredArrival = new Date(skytetid.getTime() - forberedelseMin * 60000);
        ankomstTid = requiredArrival;
        const startTid = skytetid;
        avreiseTid = new Date(startTid.getTime() + varighetMin * 60000);
      } else {
        // helt manuell / stopp uten tid
        const nå = new Date();
        ankomstTid = nå;
        avreiseTid = new Date(nå.getTime() + varighetMin * 60000);
      }
    } else {
      // Øvrige punkt: start fra forrige avreise + kjøretid
      if (forrige.avreiseTid && !isNaN(new Date(forrige.avreiseTid).getTime()) && kjøretidMin != null) {
        const forrigeAvreise = new Date(forrige.avreiseTid);
        ankomstTid = new Date(forrigeAvreise.getTime() + kjøretidMin * 60000);

        if (!erStopp && skytetid && !isNaN(skytetid.getTime())) {
          const requiredArrival = new Date(skytetid.getTime() - forberedelseMin * 60000);
          // Vi starter forberedelse når vi kommer frem
          const faktiskStartForberedelse = ankomstTid;
          const faktiskStartSkyting = new Date(faktiskStartForberedelse.getTime() + forberedelseMin * 60000);
          const faktiskStart = skytetid > faktiskStartSkyting ? skytetid : faktiskStartSkyting;
          avreiseTid = new Date(faktiskStart.getTime() + varighetMin * 60000);
        } else {
          // Stopp uten skytetid
          avreiseTid = new Date(ankomstTid.getTime() + varighetMin * 60000);
        }
      } else {
        console.warn(`❗ Forrige punkt mangler gyldig avreiseTid for ${p.navn} – bruker kun skytetid.`);
        if (skytetid && !isNaN(skytetid.getTime())) {
          const requiredArrival = new Date(skytetid.getTime() - forberedelseMin * 60000);
          ankomstTid = requiredArrival;
          avreiseTid = new Date(skytetid.getTime() + varighetMin * 60000);
        }
      }
    }

    // Beregn forsinkelseMin (positiv = for sen, negativ = margin)
    let forsinkelseMin = null;
    if (!erStopp && skytetid && ankomstTid &&
        !isNaN(skytetid.getTime()) && !isNaN(ankomstTid.getTime())) {
      const requiredArrival = new Date(skytetid.getTime() - forberedelseMin * 60000);
      const diffMin = Math.round((ankomstTid.getTime() - requiredArrival.getTime()) / 60000);
      // diffMin > 0  → vi kommer X min senere enn ønsket ankomst (for sen)
      // diffMin < 0  → vi er X min tidligere enn ønsket ankomst (margin)
      forsinkelseMin = diffMin;
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

  // lagre til backend
  fetch("/api/reiseplan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan)
  }).catch(err => console.error("Feil ved lagring av reiseplan:", err));
}

// Gjør tilgjengelig globalt (brukes fra HTML-knapp og andre scripts)
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
