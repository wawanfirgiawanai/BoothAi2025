/* global L, turf */
// -3.292342, 118.975886
(() => {
  // ====== Map setup ======
  const map = L.map('map', { zoomControl: true }).setView([-3.292342, 118.975886], 12);

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20, attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20, attribution: 'Esri'
  });
  const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, attribution: 'CARTO, OSM'
  });

  const baseMaps = { "OSM Streets": osm, "Esri Satellite": esriSat, "Carto Dark": cartoDark };

  const geofenceLayer = L.featureGroup().addTo(map);
  const animalsLayer  = L.featureGroup().addTo(map);

  L.control.layers(baseMaps, { "Virtual Fence": geofenceLayer, "Cattle Positions": animalsLayer }, {collapsed:false}).addTo(map);

  // ====== Draw control (geofence) ======
  const drawControl = new L.Control.Draw({
    draw: {
      polygon: { allowIntersection: false, showArea: true },
      rectangle: true,
      circle: false, circlemarker: false, marker: false, polyline: false
    },
    edit: { featureGroup: geofenceLayer, remove: true }
  });
  map.addControl(drawControl);
  map.on(L.Draw.Event.CREATED, (e) => geofenceLayer.addLayer(e.layer));

  // ====== UI refs ======
  const elServer = document.getElementById('server-status');
  const elSource = document.getElementById('data-source');
  const elAnimals = document.getElementById('animals');
  const alarm = document.getElementById('alarm');
  const modeSelect = document.getElementById('breach-mode');
  const lostRadiusInput = document.getElementById('lost-radius');

  // Enable audio once on first click (browser autoplay policy)
  document.addEventListener('click', () => {
    alarm.play().then(() => alarm.pause()).catch(()=>{});
  }, { once: true });

  // Status initial
  elServer.textContent = 'DISCONNECTED';
  elServer.className = 'pill pill-gray';
  elSource.textContent = 'SIMULATOR';
  elSource.className = 'pill pill-gray';

  // ====== Save / Load / Clear geofences ======
  document.getElementById('btn-save').onclick = () => {
    const feats=[];
    geofenceLayer.eachLayer(l => feats.push(l.toGeoJSON()));
    localStorage.setItem('geofences', JSON.stringify(feats));
    toast('Fence saved.');
  };
  document.getElementById('btn-load').onclick = () => {
    geofenceLayer.clearLayers();
    const raw = localStorage.getItem('geofences');
    if(!raw){ toast('No saved fence.'); return; }
    JSON.parse(raw).forEach(f => geofenceLayer.addLayer(L.geoJSON(f)));
    toast('Fence loaded.');
  };
  document.getElementById('btn-clear').onclick = () => {
    geofenceLayer.clearLayers();
    localStorage.removeItem('geofences');
    toast('All fences cleared.');
  };

  // ====== Helpers ======
  function toast(msg){
    const div = document.createElement('div');
    div.style.position='fixed';div.style.right='16px';div.style.bottom='16px';
    div.style.background='#111827';div.style.color='#e5e7eb';div.style.padding='10px 12px';
    div.style.border='1px solid #0b1220';div.style.borderRadius='10px';div.style.boxShadow='0 6px 20px rgba(0,0,0,.35)';
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(()=>div.remove(), 1800);
  }

  function geofenceCollection() {
    const feats = [];
    geofenceLayer.eachLayer(l => {
      const gj = l.toGeoJSON();
      if (gj.geometry.type === 'Polygon' || gj.geometry.type === 'MultiPolygon') feats.push(gj);
      else if (gj.type === 'FeatureCollection') gj.features.forEach(f => feats.push(f));
    });
    return feats.length ? turf.featureCollection(feats) : null;
  }

  function evaluateStatus(coordLatLng){
    const fences = geofenceCollection();
    if(!fences) return { ok:true, text:'No Fence' };
    const pt = turf.point([coordLatLng.lng, coordLatLng.lat]);
    const insideAny = fences.features.some(f => turf.booleanPointInPolygon(pt, f));
    const mode = modeSelect.value;
    if(mode === 'outside'){
      return insideAny ? {ok:true, text:'Inside'} : {ok:false, text:'Breach (Outside)'};
    }else{
      return insideAny ? {ok:false, text:'Breach (Inside)'} : {ok:true, text:'Outside'};
    }
  }

  // ====== One dummy animal (NO TRAIL) ======
  const cowIconSafe = L.icon({
    iconUrl: 'img/cow2.png', // realistic cow icon
    iconSize: [36, 36],
    iconAnchor: [18, 30],
    popupAnchor: [0, -24]
  });

  const cowIconAlert = L.icon({
    iconUrl: 'img/cow2.png', // same icon but we can style marker popup
    iconSize: [40, 40],
    iconAnchor: [20, 34],
    popupAnchor: [0, -26]
  });

  const animals = new Map();
  function upsertAnimal({id, name, lat, lon}){
    let entry = animals.get(id);
    if(!entry){
      const marker = L.marker([lat, lon], { title: `${name} (${id})`, icon: cowIconSafe }).addTo(animalsLayer);
      entry = { marker, last: { lat, lon } };
      animals.set(id, entry);
    }else{
      entry.marker.setLatLng([lat, lon]);
      entry.last = { lat, lon };
    }
    // check breach + sound
    const status = evaluateStatus({lat, lng: lon});
    if(!status.ok){
      entry.marker.bindPopup(`<b>${name}</b><br>${status.text}`).openPopup();
      try { alarm.currentTime = 0; alarm.play().catch(()=>{}); } catch(e){}
      entry.marker.setIcon(cowIconAlert);
    }else{
      entry.marker.closePopup();
      entry.marker.setIcon(cowIconSafe);
    }
    renderAnimalList();
  }

  function renderAnimalList(){
    elAnimals.innerHTML='';
    animals.forEach((e, id) => {
      const lat = e.last.lat, lon = e.last.lon;
      const status = evaluateStatus({lat, lng: lon});
      const badgeCls = status.ok ? 'badge-ok' : 'badge-warn';
      const div = document.createElement('div');
      div.className = 'animal';
      div.innerHTML = `
        <div>
          <div><b>${id}</b> <span class="badge ${badgeCls}">${status.text}</span></div>
          <div style="color:#9ca3af;font-size:12px">${lat.toFixed(5)}, ${lon.toFixed(5)}</div>
        </div>
        <div><button onclick="window.__zoomTo('${id}')">🔎</button></div>`;
      elAnimals.appendChild(div);
    });
  }

  window.__zoomTo = (id)=>{
    const e = animals.get(id); if(!e) return;
    map.setView([e.last.lat, e.last.lon], Math.max(map.getZoom(), 15));
  };

  // Dummy motion loop (circle)
  let angle = 0;
  setInterval(() => {
    const lat = -3.292342 + Math.sin(angle) * 0.01;
    const lon = 118.975886 + Math.cos(angle) * 0.01;
    upsertAnimal({ id: 'Cow-01', name: 'Cow-01', lat, lon });
    angle += 0.1;
  }, 1000);

  // Initial render (so the list shows "No Fence" first)
  upsertAnimal({ id: 'Cow-01', name: 'Cow-01', lat: -3.292342, lon: 118.975886 });

  // Fit map
  // -3.292342, 118.975886
  setTimeout(()=> map.setView([-3.292342, 118.975886], 12), 500);

})();
