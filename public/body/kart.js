// kart.js – oppdatert med støtte for valgtReiserute og mineStevner via window

document.addEventListener("DOMContentLoaded", function () {
  const map = L.map("map").setView([63.5, 10.5], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // Globale variabler
  window.map = map;
  window.valgtReiserute = [];
  window.mineStevner = [];
  window.egnePunkter = [];

  // 🔵 Vis brukerens posisjon
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    const brukerPos = [latitude, longitude];

    map.setView(brukerPos, 10);

    const brukerMarkør = L.marker(brukerPos, {
      icon: L.divIcon({
        className: 'brukerpos-icon',
        html: `<div style="color:#005eff;font-size:1.4em;">📍</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    }).addTo(map).bindPopup(`
      <strong>📍 Din posisjon</strong><br>
      <button onclick="leggTilReiserute('Startpunkt (meg)', ${latitude}, ${longitude})"
        style="margin-top:6px; padding:4px 8px; font-size: 0.9em;">✚ Legg til som startpunkt</button>
    `);
  }, err => {
    console.warn("⚠️ Kunne ikke hente posisjon:", err.message);
  });


  const farger = {
    "landskytterstevne": "#d1e000",
    "bane": "#d40000",
    "felt": "#2e8b57",
    "inne": "#3282F6",
    "kurs": "#000000",
    "skifelt": "#7DFABB"
  };

  const hovedLayer = L.layerGroup().addTo(map);
  let alleStevner = [];
  let mineStevner = [];
  const valgtReiserute = [];
  let gjeldendeFilter = "Alle typer";
  const dummyPosisjon = { lat: 63.0, lng: 4.0 };
const skytterlagLayer = L.layerGroup().addTo(map);


  function parseDatoUtenTid(str) {
    if (!str) return null;
    const [dag, mnd, år] = str.split(".");
    if (!dag || !mnd || !år) return null;
    return new Date(`${år}-${mnd.padStart(2, '0')}-${dag.padStart(2, '0')}T00:00`);
  }

  function parseDatoMedTid(str) {
    if (!str) return null;
    const parts = str.split(" - ");
    const [dag, mnd, år] = parts[0].split(".");
    if (!dag || !mnd || !år) return null;
    const tid = parts[1] || "00:00";
    return new Date(`${år}-${mnd.padStart(2, '0')}-${dag.padStart(2, '0')}T${tid}`);
  }

  function kortDatoVis(d) {
    const parsed = parseDatoUtenTid(d);
    if (!parsed || isNaN(parsed)) return "Ugyldig dato";
    return parsed.toLocaleDateString("no-NO", {
      day: "numeric",
      month: "short"
    });
  }

  function datoVis(d) {
    const parsed = parseDatoMedTid(d);
    if (!parsed || isNaN(parsed)) return "Ugyldig dato";
    return parsed.toLocaleString("no-NO", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function spreLikePosisjoner(data, radius = 0.0002) {
    const grupper = {};
    data.forEach(s => {
      const nøkkel = `${s.posisjon.lat.toFixed(6)},${s.posisjon.lng.toFixed(6)}`;
      if (!grupper[nøkkel]) grupper[nøkkel] = [];
      grupper[nøkkel].push(s);
    });

    for (const nøkkel in grupper) {
      const gruppe = grupper[nøkkel];
      if (gruppe.length === 1) continue;
      const vinkelSteg = (2 * Math.PI) / gruppe.length;
      const [lat, lng] = nøkkel.split(",").map(Number);

      gruppe.forEach((s, i) => {
        const vinkel = i * vinkelSteg;
        s.posisjon.lat = lat + radius * Math.cos(vinkel);
        s.posisjon.lng = lng + radius * Math.sin(vinkel);
      });
    }
  }

function erInnenforRadius(pos1, pos2, meterRadius) {
  const R = 6371000; // jordradius i meter
  const rad = Math.PI / 180;
  const dLat = (pos2.lat - pos1.lat) * rad;
  const dLng = (pos2.lng - pos1.lng) * rad;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(pos1.lat * rad) * Math.cos(pos2.lat * rad) *
            Math.sin(dLng/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const avstand = R * c;
  return avstand <= meterRadius;
}

function lagStevneKortHTML(s, statusTekst, statusFarge, datotekst, markertMine = false) {
  const stjerne = markertMine ? "⭐Du + " : "";


let koordinatAdvarsel = "";
if (s.posisjon && erInnenforRadius(s.posisjon, dummyPosisjon, 100)) {
  koordinatAdvarsel = `<div style="color:red; font-size:0.85em; margin-top:6px;">⚠️ Mangler koordinater</div>`;
} else {
  koordinatAdvarsel = `<div style="color:black; font-size:0.85em; margin-top:6px;">📡Koordinater: ${s.posisjon.lat.toFixed(5)}, ${s.posisjon.lng.toFixed(5)}</div>`;
}






  let skytetidTekst = "";
  if (markertMine && s.startTime) {
    const d = new Date(s.startTime);
    const dato = d.toLocaleDateString("no-NO", { day: "2-digit", month: "short" });
    const tid = d.toTimeString().slice(0, 5);
    skytetidTekst = `Skytetid: ${dato} – ${tid}`;
  }

  const farge = farger[(s.arrangementstype || "").toLowerCase()] || "#ccc";

  return `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; border-bottom: 1px solid #ccc; background: linear-gradient(to right, ${farge} 15px, white 5px);">
      <div style="flex: 1; min-width: 50%; padding-left: 10px;">
        <div style="font-weight: bold;">${datotekst}</div>
        <div>ℹ️<a href="${s.link || "#"}" target="_blank" style="font-weight:bold;">${s.navn}</a></div>
        <div>🎯${s.arrangementstype || ""}${s.beskrivelse ? " – " + s.beskrivelse : ""}</div>
        ${s.skytterlagUrl ? `<div>🌐<a href="${s.skytterlagUrl}" target="_blank"> ${s.skytterlag}</a></div>` : (s.skytterlag || "")}
        <button onclick="leggTilReiserute('${s.navn.replace(/'/g, "\\'")}', ${s.posisjon.lat}, ${s.posisjon.lng})" style="margin-top:6px; padding:4px 8px; font-size: 0.9em;">✚ Legg til reiserute</button>
	${koordinatAdvarsel}



      </div>
      <div style="text-align: right;">
        ${s.liveLink ? `<a href="${s.liveLink}" target="_blank" style="background:#3A30F5;color:white;padding:2px 6px;border-radius:4px;text-decoration:none;">Live</a><br>` : ""}
        <div style="background:${statusFarge};padding:4px 6px;border-radius:4px;margin-top:4px;">
          ${statusTekst}<br>
          ${stjerne}${s.paameldte || 0} påmeldt
          ${skytetidTekst ? `<div style="margin-top:4px;">${skytetidTekst}</div>` : ""}
        </div>
      </div>
    </div>
  `;
}
  function visSkytterlagIMarker() {
    skytterlagLayer.clearLayers();
    skytterlagData.forEach(lag => {
      const lat = lag.lat;
      const lng = lag.long;
      if (!lat || !lng) return;

      const markør = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'skytterlag-icon',
          html: `<div style="color:#000;font-size:1.2em;">🎯</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      }).addTo(skytterlagLayer);

      const normaliser = str => str?.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9æøå]/gi, "") || "";

      const relatertStevner = alleStevner.filter(s =>
        normaliser(s.skytterlag) === normaliser(lag.skytterlag_navn)
      );

      let popupHTML = `<strong>Skytterlag:</strong> <a href="https://skytebaneguide.no/club/${lag.skytterlag_id}" target="_blank">${lag.skytterlag_navn}</a><br>`;
      popupHTML += `<strong>Baner:</strong> ${lag.range_types?.join(", ") || "Ukjent"}`;

      if (relatertStevner.length > 0) {
        popupHTML += `<hr><strong>Kommende stevner:</strong>`;
        relatertStevner.forEach(s => {
          const datotekst = s.fra === s.til ? s.fra : `${s.fra} – ${s.til}`;
          popupHTML += `<div style="margin-top:6px;"><a href="${s.link || '#'}" target="_blank">${s.navn}</a><br><small>${datotekst} – ${s.arrangementstype || ''}</small></div>`;
        });
      }

      markør.bindPopup(popupHTML);
    });
  }

  fetch("data/skytterlag.json")
    .then(res => res.json())
    .then(data => {
      skytterlagData = data;
      visSkytterlagIMarker();
    });

  fetch("data/stevner.json")
    .then(res => res.json())
    .then(data => {
      data.forEach(s => {
        if (s.posisjon && typeof s.posisjon.lat === "string") {
          s.posisjon.lat = parseFloat(s.posisjon.lat);
          s.posisjon.lng = parseFloat(s.posisjon.lng);
        }
      });
      alleStevner = data;
      fetch("data/minestevner.json")
        .then(res => res.json())
        .then(mine => {
          mineStevner = mine;
          // init kartvisning og filter som før
        });
    });

function oppdaterStevneListe() {
  hovedLayer.clearLayers();

  if (gjeldendeFilter === "Skytterlag") {
    map.addLayer(skytterlagLayer);
  } else {
    map.removeLayer(skytterlagLayer);
  }

  const listDiv = document.getElementById("stevneliste");
  listDiv.innerHTML = "<h3>Stevner i kartutsnitt</h3>";
  let count = 0;
  const nå = new Date();

  const synligeStevner = alleStevner
    .map(s => {
      const manglerKoord = !s.posisjon || s.posisjon.lat === 0 || s.posisjon.lng === 0;
      if (manglerKoord) {
        s.posisjon = { ...dummyPosisjon };
      }
      return s;
    })
    .filter(s => {
      const innenforKart = map.getBounds().contains([s.posisjon.lat, s.posisjon.lng]);
      if (!innenforKart) return false;

      if (gjeldendeFilter === "Alle typer") return true;
      if (gjeldendeFilter === "Mine stevner") return mineStevner.some(ms => ms.eventId === s.eventId);
      return (s.arrangementstype || "").toLowerCase() === gjeldendeFilter.toLowerCase();
    });

  spreLikePosisjoner(synligeStevner);

  synligeStevner.forEach(s => {
    const fraDato = parseDatoMedTid(s.påmeldingFra);
    const tilDato = parseDatoMedTid(s.påmeldingTil);
    let statusTekst = "";
    let statusFarge = "";

    if (!tilDato || !fraDato) {
      statusTekst = "<strong style='color:#888;'>Mangler dato</strong>";
      statusFarge = "#eeeeee";
    } else if (nå > tilDato) {
      statusTekst = "<strong style='color:#900;'>Stengt</strong>";
      statusFarge = "#f7e4e4";
    } else {
      const tidDiff = tilDato - nå;
      const timerIgjen = Math.floor(tidDiff / (1000 * 60 * 60));
      const minutterIgjen = Math.floor((tidDiff % (1000 * 60 * 60)) / (1000 * 60));

      if (tidDiff < 24 * 60 * 60 * 1000) {
        statusTekst = `<strong style='color:#b58900;'>Stenger om ${timerIgjen}t ${minutterIgjen}m</strong>`;
        statusFarge = "#fff6d6";
      } else {
        statusTekst = `<strong style='color:#1a7f00;'>Åpen</strong><br>Stenger ${datoVis(s.påmeldingTil)}`;
        statusFarge = "#e2f7e2";
      }
    }

    const datotekst = s.fra === s.til ? kortDatoVis(s.fra) : `${kortDatoVis(s.fra)} – ${kortDatoVis(s.til)}`;
    const farge = farger[(s.arrangementstype || "").toLowerCase()] || "#999";
    const markert = mineStevner.some(ms => ms.eventId && ms.eventId === s.eventId);

    const icon = L.divIcon({
      className: "stevneikon",
      html: `<div style='position: relative; background-color:${farge}; width:24px; height:24px; border-radius:50%; border:2px solid white;'>
               <div style='position:absolute;top:2px;left:6px;font-size:12px;color:white;font-weight:bold;'>${markert ? "★" : s.paameldte || 0}</div></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker([s.posisjon.lat, s.posisjon.lng], { icon }).addTo(hovedLayer);
    const popup = lagStevneKortHTML(s, statusTekst, statusFarge, datotekst, markert);
    marker.bindPopup(popup, { minWidth: 360 });

    const div = document.createElement("div");
    div.className = "stevnekort";
    div.innerHTML = lagStevneKortHTML(s, statusTekst, statusFarge, datotekst, markert);
    listDiv.appendChild(div);
    count++;
  });


    listDiv.querySelector("h3").innerText += ` (${count})`;
  }

  fetch("data/stevner.json")
    .then(res => res.json())
    .then(data => {
      data.forEach(s => {
        if (s.posisjon && typeof s.posisjon.lat === "string") {
          s.posisjon.lat = parseFloat(s.posisjon.lat);
          s.posisjon.lng = parseFloat(s.posisjon.lng);
        }
      });
      alleStevner = data;
      fetch("data/minestevner.json")
        .then(res => res.json())
        .then(mine => {
          mineStevner = mine;

// Slå sammen startTime fra mineStevner inn i alleStevner
alleStevner.forEach(s => {
  const match = mineStevner.find(m => m.eventId === s.eventId);
  if (match && match.startTime) {
    s.startTime = match.startTime;
  }
});

          // Fyll filter-dropdown
          const filterEl = document.getElementById("eventTypeFilter");
          const typer = [...new Set(alleStevner.map(s => (s.arrangementstype || "").toLowerCase()))].filter(t => t);
          ["Alle typer", "Mine stevner","Skytterlag", ...typer].forEach(type => {
            const opt = document.createElement("option");
            opt.value = type;
            opt.textContent = type.charAt(0).toUpperCase() + type.slice(1);
            filterEl.appendChild(opt);
          });

          document.getElementById("brukFilterBtn").addEventListener("click", () => {
            gjeldendeFilter = filterEl.value;
            oppdaterStevneListe();
          });
          document.getElementById("nullstillFilterBtn").addEventListener("click", () => {
            gjeldendeFilter = "Alle typer";
            filterEl.value = "Alle typer";
            oppdaterStevneListe();
          });

          map.on("moveend", oppdaterStevneListe);
          oppdaterStevneListe();
        });
    });


window.lagreMineStevner = function () {
  const input = document.getElementById("dfsJsonInput").value;
  try {
    const cleanJson = input.trim().replace(/,\s*]/g, "]");
    const parsed = JSON.parse(cleanJson);

    // Sjekk struktur: `events` → year → months → events
    if (!parsed.events || !Array.isArray(parsed.events)) {
      throw new Error("Fant ikke 'events' i dataen.");
    }

    // Samle alle stevner
    const alle = [];
    parsed.events.forEach(year => {
      if (Array.isArray(year.months)) {
        year.months.forEach(m => {
          if (Array.isArray(m.events)) {
            alle.push(...m.events);
          }
        });
      }
    });

    const stevner = alle.map(e => {
      const posisjon = (e.mapUrl && e.mapUrl.includes("place/")) ? (() => {
        const match = e.mapUrl.match(/place\/([-\d.]+),([-\d.]+)/);
        return match ? {
          lat: parseFloat(match[1]),
          lng: parseFloat(match[2])
        } : { lat: 65.1, lng: 8.8 };
      })() : { lat: 65.1, lng: 8.8 };

      return {
        navn: e.name,
        eventId: e.eventId,
        fra: e.startTime?.split("T")[0].split("-").reverse().join(".") || "",
        til: e.endTime?.split("T")[0].split("-").reverse().join(".") || "",
        påmeldingFra: e.registrationFrom ? e.registrationFrom.replace("T", " - ").slice(0, 16) : null,
        påmeldingTil: e.registrationTo ? e.registrationTo.replace("T", " - ").slice(0, 16) : null,
        startTime: e.startTime || null,
        posisjon
      };
    });

fetch("/api/lagre-minestevner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stevner, null, 2)
    }).then(() => {
      alert("✅ Lagret! Last inn siden på nytt for å se 'Mine stevner'");
    });
  } catch (err) {
    alert("❌ Ugyldig JSON: " + err.message);
  }
};


  // 🖱️ Høyreklikk for å legge til egendefinert punkt
  map.on("contextmenu", function (e) {
    const { lat, lng } = e.latlng;

    const popupInnhold = document.createElement("div");
    popupInnhold.innerHTML = `
      <strong>🧭 Tilpasset punkt</strong><br>
      <label for="markørnavn">Navn:</label><br>
      <input id="markørnavn" type="text" placeholder="Eks: Overnatting" style="width: 140px; margin-top:4px;"><br>
      <button style="margin-top:6px; margin-right:4px;" onclick="leggTilTilpassetMarkør(${lat}, ${lng}, this, false)">📍 Bare vis i kart</button>
      <button style="margin-top:6px;" onclick="leggTilTilpassetMarkør(${lat}, ${lng}, this, true)">✚ Vis og legg til reiserute</button>
    `;

    L.popup()
      .setLatLng(e.latlng)
      .setContent(popupInnhold)
      .openOn(map);
  });

  // ➕ Legg til i reiserute
  window.leggTilReiserute = function (navn, lat, lng) {
    if (!window.valgtReiserute.find(p => p.navn === navn)) {
      window.valgtReiserute.push({ navn, lat, lng });
      const liste = document.getElementById("ruteliste");
      if (liste) {
        const li = document.createElement("li");
        li.innerHTML = `${navn} <button onclick="this.parentElement.remove(); fjernFraReiserute('${navn}')" style="margin-left:8px;">Fjern</button>`;
        liste.appendChild(li);
        document.getElementById("ruteplanlegger").style.display = "block";
      }
    }
  };

  // ➖ Fjern fra reiserute
  window.fjernFraReiserute = function (navn) {
    const index = window.valgtReiserute.findIndex(p => p.navn === navn);
    if (index !== -1) window.valgtReiserute.splice(index, 1);
  };

  // 🔄 Nullstill reiserute
  window.nullstillReiserute = function () {
    window.valgtReiserute.length = 0;
    const liste = document.getElementById("ruteliste");
    if (liste) liste.innerHTML = "";
  };

  // 🗺️ Åpne reiserute i Google Maps
  window.åpneGoogleMapsRute = function () {
    if (window.valgtReiserute.length < 2) {
      alert("Velg minst to punkt for å lage rute.");
      return;
    }
    const base = "https://www.google.com/maps/dir/";
    const path = window.valgtReiserute.map(p => `${p.lat},${p.lng}`).join("/");
    window.open(base + path, "_blank");
  };

  // 🔃 Dra og slipp støtte (dersom Sortable er lastet)
  if (window.Sortable) {
    Sortable.create(document.getElementById("ruteliste"), {
      animation: 150,
      onUpdate: () => {
        const nyeNavn = Array.from(document.querySelectorAll("#ruteliste li"))
          .map(li => li.textContent.replace("Fjern", "").trim());
        window.valgtReiserute.sort((a, b) => nyeNavn.indexOf(a.navn) - nyeNavn.indexOf(b.navn));
      }
    });
  }
});

// 📍 Legg til tilpasset punkt og valgfritt i reiserute
window.leggTilTilpassetMarkør = function (lat, lng, btn, leggTilReise) {
  const input = btn.parentElement.querySelector("#markørnavn");
  const navn = input.value.trim();
  if (!navn) {
    alert("Skriv inn et navn for punktet.");
    return;
  }

  const markør = L.marker([lat, lng], {
    icon: L.divIcon({
      className: 'tilpasset-ikon',
      html: `<div style='background:#000;color:#fff;padding:2px 6px;border-radius:4px;font-size:0.85em;'>${navn}</div>`,
      iconAnchor: [10, 10],
    })
  }).addTo(map);

  markør.bindPopup(`
    <strong>${navn}</strong><br>📍 Tilpasset punkt<br>
    <button onclick=\"leggTilReiserute('${navn}', ${lat}, ${lng})\" style=\"margin-top:4px;\">➕ Legg til i reiserute</button><br>
    <button onclick=\"fjernTilpassetMarkør(this)\" style=\"margin-top:4px;color:red;\">🗑️ Fjern punkt</button>
  `);

  window.egnePunkter.push({ navn, lat, lng, markør });

  if (leggTilReise) {
    leggTilReiserute(navn, lat, lng);
  }

  map.closePopup();
};

// 🗑️ Fjern tilpasset markør fra kart og liste
window.fjernTilpassetMarkør = function (btn) {
  const popup = btn.closest(".leaflet-popup-content");
  const navn = popup.querySelector("strong").textContent;

  const index = window.egnePunkter.findIndex(p => p.navn === navn);
  if (index !== -1) {
    map.removeLayer(window.egnePunkter[index].markør);
    window.egnePunkter.splice(index, 1);
  }

  map.closePopup();
};
