// sok.js – Søk etter sted og vis stevner i nærheten (kun radius i km)

document.addEventListener("DOMContentLoaded", () => {
  const søkeSirkelLayer = L.layerGroup().addTo(map);
  const søkKnapp = document.getElementById("åpneSøkPopup");

  // Opprett penere popup hvis den ikke finnes
  if (!document.getElementById("søkPopup")) {
    const popupHTML = `
      <div id="søkPopup" style="display:none; position:fixed; top:100px; left:20px; width:300px; background:white; padding:20px; border:1px solid #ccc; box-shadow:0 0 10px rgba(0,0,0,0.2); border-radius:8px; z-index:1001; font-family:Arial, sans-serif;">
        <h3 style="margin-top:0; font-size:1.2em;">🔍 Finn stevner i nærheten</h3>
        <label style="display:block; margin-bottom:10px;">
          Sted:
          $1
<small style="display:block; margin-top:4px; color:#555; font-size:0.85em;">Tips: Skriv både gatenavn og sted, f.eks. "Høknesbakken 9, Namsos"</small>
        </label>
        <label style="display:block; margin-bottom:10px;">
          Radius (km):
          <input id="søkRadius" type="number" value="30" style="width: 80px; padding:6px; margin-top:4px;">
        </label>
        <div style="display:flex; justify-content:space-between;">
          <button id="startSøk" style="padding:6px 12px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer;">🔎 Søk</button>
          <button onclick="document.getElementById('søkPopup').style.display='none'" style="padding:6px 12px; background:#ccc; border:none; border-radius:4px; cursor:pointer;">Lukk</button>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", popupHTML);
  }

  søkKnapp.onclick = () => {
    document.getElementById("søkPopup").style.display = "block";
  };

  requestAnimationFrame(() => {
    const startSøkKnapp = document.getElementById("startSøk");
    if (startSøkKnapp) {
      startSøkKnapp.onclick = async () => {
        const søk = document.getElementById("søkSted").value.trim();
        const radiusKm = parseFloat(document.getElementById("søkRadius").value);

        if (!søk || isNaN(radiusKm)) return alert("Ugyldig søk eller verdi.");

        let geoRes = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=5b3ce3597851110001cf6248679114c65ed6488ab19c6215246c12f4&text=${encodeURIComponent(søk)}&boundary.country=NO`);
let geo = await geoRes.json();

if (!geo.features || !geo.features.length) {
  // Prøv igjen uten landsgrense (hele Norden/verden)
  geoRes = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=5b3ce3597851110001cf6248679114c65ed6488ab19c6215246c12f4&text=${encodeURIComponent(søk)}`);
  geo = await geoRes.json();
  if (!geo.features || !geo.features.length) return alert("Fant ikke posisjon for søket.");
}

        const [lng, lat] = geo.features[0].geometry.coordinates;
        map.setView([lat, lng], 10);

        søkeSirkelLayer.clearLayers();
        const sirkel = L.circle([lat, lng], {
          radius: radiusKm * 1000,
          color: "blue",
          fillOpacity: 0.15
        }).addTo(søkeSirkelLayer);
      };
    }
  });
});
