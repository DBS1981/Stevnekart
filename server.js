const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/data', express.static(path.join(__dirname, 'public', 'data')));




// GET: Hent eksisterende reiseplan
app.get("/api/reiseplan", (req, res) => {
  const filsti = "./public/data/reiseplan.json";
  if (fs.existsSync(filsti)) {
    const data = fs.readFileSync(filsti, "utf-8");
    res.json(JSON.parse(data));
  } else {
    res.json([]);
  }
});

// POST: Lagre ny reiseplan
app.post("/api/reiseplan", (req, res) => {
  const filsti = "./public/data/reiseplan.json";
  fs.writeFileSync(filsti, JSON.stringify(req.body, null, 2));
  res.json({ ok: true });
});


function parseCoords(mapUrl) {
  if (!mapUrl) return null;
  const match = mapUrl.match(/place\/([-.\d]+),([-.\d]+)/);
  if (match) {
    return {
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2])
    };
  }
  return null;
}

function capitalizeFirstLetter(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
// Legg til disse hjelpefunksjonene i toppen av filen (f.eks. under capitalizeFirstLetter):
function formatDatoUtenTid(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

function formatDatoMedTid(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  const tid = d.toTimeString().slice(0, 5);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()} - ${tid}`;
}


app.post('/api/oppdater-stevner', (req, res) => {
  const { fra, til } = req.body;
  if (!fra || !til) return res.status(400).json({ error: 'Dato mangler' });

  const url = `https://mittdfs.no/api/calendar?dateFrom=${fra}&dateTo=${til}&tab=all`;
  console.log("🔄 Henter DFS-data fra:", url);

  https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'Referer': 'https://mittdfs.no/'
    }
  }, response => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        if (response.statusCode !== 200) {
          console.error("❌ DFS svarte med status:", response.statusCode);
          return res.status(502).json({ error: 'DFS svarte ikke med OK.' });
        }

        const json = JSON.parse(data);
        if (!json.events || !Array.isArray(json.events)) {
          console.error("❌ Uventet format på DFS-data");
          return res.status(500).json({ error: "Ugyldig DFS-data (mangler events)" });
        }

        console.log("🔍 Fant", json.events.length, "årstall-grupper fra DFS");
        let totalEvents = 0;
        const stevner = [];

        for (const yearGroup of json.events) {
          if (!yearGroup.months) continue;
          for (const monthGroup of yearGroup.months) {
            if (!monthGroup.events) continue;
            console.log(`📦 Behandler ${monthGroup.events.length} stevner i måned`, monthGroup.month);
            totalEvents += monthGroup.events.length;

            for (const e of monthGroup.events) {
              let coords = parseCoords(e.mapUrl);
              let skytterlag = e.organizer || '';

              if (!coords) {
                console.warn(`⚠️ Stevne uten ekte koordinater: "${e.name}" - "${e.organizer}"`);
                coords = { lat: 65.11608336877725, lng: 8.805541992187502 };
                skytterlag += " (❗ Mangler ekte koordinater!)";
              }

stevner.push({
  navn: e.name,
  fra: formatDatoUtenTid(e.startTime),
  til: formatDatoUtenTid(e.endTime),
  påmeldingFra: formatDatoMedTid(e.registrationFrom),
  påmeldingTil: formatDatoMedTid(e.registrationTo),
  posisjon: coords,
  skytterlag: skytterlag,
  skytterlagUrl: e.organizerUrl ? "https://mittdfs.no" + e.organizerUrl : '',
  arrangementstype: e.eventArrType ? e.eventArrType.replace(/^-\s*/, '').toLowerCase() : '',
  paameldte: e.registeredCount || 0,
  link: e.registrationUrl ? "https://mittdfs.no" + e.registrationUrl : null,
  beskrivelse: e.description ? capitalizeFirstLetter(e.description.replace(/^-\s*/, '')) : '',
  eventId: e.eventId
});

            }
          }
        }

        console.log(`📊 Totalt mottatt stevner: ${totalEvents}`);
        console.log(`✅ Stevner med koordinater (inkl. dummy): ${stevner.length}`);

        const outputPath = path.join(__dirname, 'public', 'data', 'stevner.json');
        fs.writeFile(outputPath, JSON.stringify(stevner, null, 2), 'utf8', err => {
          if (err) {
            console.error("❌ Feil ved skriving til stevner.json:", err);
            return res.status(500).json({ error: 'Kunne ikke skrive stevner.json' });
          }
          console.log(`✅ Lagret ${stevner.length} stevner i public/data/stevner.json`);
          res.json({ message: 'Oppdatering fullført', antall: stevner.length });
        });
      } catch (err) {
        console.error('❌ Feil ved parsing av DFS-svar:', err);
        console.error("Rådata (start):", data.slice(0, 300));
        res.status(500).json({ error: 'DFS svarte ikke med gyldig JSON' });
      }
    });
  }).on('error', err => {
    console.error('❌ Nettverksfeil mot DFS API:', err);
    res.status(500).json({ error: 'Feil ved tilkobling til DFS API' });
  });
});
app.post('/api/oppdater-skytterlag', (req, res) => {
  const url = "https://skytebaneguide.no/api/v1/clubs";
  const outputPath = path.join(__dirname, 'public', 'data', 'skytterlag.json');

  https.get(url, response => {
    let data = "";
    response.on("data", chunk => data += chunk);
    response.on("end", () => {
      try {
        const json = JSON.parse(data);
        fs.writeFile(outputPath, JSON.stringify(json, null, 2), 'utf8', err => {
          if (err) {
            console.error("❌ Klarte ikke å lagre skytterlag.json:", err);
            return res.status(500).json({ error: 'Kunne ikke lagre skytterlag.json' });
          }
          console.log(`✅ Lagret ${json.length} skytterlag i skytterlag.json`);
          res.json({ message: "OK", antall: json.length });
        });
      } catch (e) {
        console.error("❌ Ugyldig JSON fra skytebaneguide.no:", e);
        res.status(500).json({ error: "Ugyldig JSON-data" });
      }
    });
  }).on("error", err => {
    console.error("❌ Feil ved henting av skytterlag:", err);
    res.status(500).json({ error: "Kunne ikke hente fra skytebaneguide.no" });
  });
});

app.post('/api/lagre-minestevner', (req, res) => {
  const data = req.body;

  if (!Array.isArray(data)) {
    return res.status(400).json({ error: "Forventet en liste med stevner." });
  }

  const filsti = path.join(__dirname, 'public', 'data', 'minestevner.json');

  fs.writeFile(filsti, JSON.stringify(data, null, 2), 'utf8', err => {
    if (err) {
      console.error("❌ Klarte ikke å lagre minestevner.json:", err);
      return res.status(500).json({ error: 'Kunne ikke lagre minestevner.json' });
    }

    console.log(`✅ Lagret ${data.length} mine stevner i minestevner.json`);
    res.json({ message: 'Lagret!' });
  });
});

app.listen(PORT, () => console.log(`✅ Server kjører på http://localhost:${PORT}`));
