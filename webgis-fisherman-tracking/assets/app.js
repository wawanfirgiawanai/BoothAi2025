/* global L, turf */
(() => {
  const map = L.map('map', { zoomControl: true }).setView([-3.570384, 118.973543], 12);
  // -3.570384, 118.973543
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap' }).addTo(map);
  const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, attribution: 'Esri' });
  const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: 'CARTO, OSM' });

  const baseMaps = { "OSM Streets": osm, "Esri Satellite": esriSat, "Carto Dark": cartoDark };

  const safeLayer   = L.featureGroup().addTo(map);
  const dangerLayer = L.featureGroup().addTo(map);
  const labelLayer  = L.featureGroup().addTo(map);
  const vesselLayer = L.featureGroup().addTo(map);

  L.control.layers(baseMaps, { "Safety Zones": safeLayer, "Danger Zones": dangerLayer, "Danger Labels": labelLayer, "Vessel": vesselLayer }, {collapsed:false}).addTo(map);

  let activeTarget = 'safe';
  document.querySelectorAll('input[name="zoneTarget"]').forEach(r => { r.addEventListener('change', (e)=> activeTarget = e.target.value); });

  const drawControl = new L.Control.Draw({
    draw: { polygon: { allowIntersection: false, showArea: true }, rectangle: true, circle: false, circlemarker: false, marker: false, polyline: false },
    edit: { featureGroup: L.featureGroup([safeLayer, dangerLayer]), remove: true }
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, (e) => {
    const layer = e.layer;
    if (activeTarget === 'safe') {
      styleSafe(layer); safeLayer.addLayer(layer);
    } else {
      styleDanger(layer); dangerLayer.addLayer(layer); addOrUpdateDangerLabel(layer);
    }
  });
  map.on(L.Draw.Event.EDITED, (e) => { e.layers.eachLayer(l => { if (dangerLayer.hasLayer(l)) addOrUpdateDangerLabel(l, true); }); });
  map.on(L.Draw.Event.DELETED, (e) => { e.layers.eachLayer(l => removeDangerLabel(l)); });

  function styleSafe(layer){ layer.setStyle && layer.setStyle({ color:'#10b981', weight:2, fillColor:'#10b981', fillOpacity:0.2 }); }
  function styleDanger(layer){ layer.setStyle && layer.setStyle({ color:'#ef4444', weight:2, fillColor:'#ef4444', fillOpacity:0.35 }); }

  function addOrUpdateDangerLabel(layer){
    const gj = layer.toGeoJSON();
    const centroid = turf.centroid(gj).geometry.coordinates;
    const key = L.stamp(layer);
    labelLayer.eachLayer(l=>{ if(l.options && l.options.__ownerKey === key) labelLayer.removeLayer(l); });
    const div = L.divIcon({ className:'', html:'<div class="danger-label">⚠️</div>' });
    const m = L.marker([centroid[1], centroid[0]], { icon: div });
    m.options.__ownerKey = key;
    labelLayer.addLayer(m);
  }
  function removeDangerLabel(layer){
    const key = L.stamp(layer); const toRemove=[];
    labelLayer.eachLayer(l=>{ if(l.options && l.options.__ownerKey === key) toRemove.push(l); });
    toRemove.forEach(l => labelLayer.removeLayer(l));
  }

  const elServer = document.getElementById('server-status');
  const elSource = document.getElementById('data-source');
  const elVessels = document.getElementById('vessels');
  const alarm = document.getElementById('alarm');
  // document.addEventListener('click', () => { alarm.play().then(()=>alarm.pause()).catch(()=>{}); }, { once:true });
  elServer.textContent = 'DISCONNECTED'; elServer.className = 'pill pill-gray';
  elSource.textContent = 'SIMULATOR'; elSource.className = 'pill pill-gray';

  document.getElementById('btn-save').onclick = () => {
    const s=[]; safeLayer.eachLayer(l => s.push(l.toGeoJSON()));
    const d=[]; dangerLayer.eachLayer(l => d.push(l.toGeoJSON()));
    localStorage.setItem('zones_safe', JSON.stringify(s));
    localStorage.setItem('zones_danger', JSON.stringify(d));
    toast('Zones saved.');
  };
  document.getElementById('btn-load').onclick = () => {
    safeLayer.clearLayers(); dangerLayer.clearLayers(); labelLayer.clearLayers();
    const sraw = localStorage.getItem('zones_safe'); const draw = localStorage.getItem('zones_danger');
    if (sraw){ JSON.parse(sraw).forEach(f => { const lyr = L.geoJSON(f, { style:{ color:'#10b981', weight:2, fillColor:'#10b981', fillOpacity:0.2 } }); lyr.eachLayer(l=> safeLayer.addLayer(l)); }); }
    if (draw){ JSON.parse(draw).forEach(f => { const lyr = L.geoJSON(f, { style:{ color:'#ef4444', weight:2, fillColor:'#ef4444', fillOpacity:0.35 } }); lyr.eachLayer(l=> { dangerLayer.addLayer(l); addOrUpdateDangerLabel(l); }); }); }
    toast('Zones loaded.');
  };
  document.getElementById('btn-clear').onclick = () => {
    safeLayer.clearLayers(); dangerLayer.clearLayers(); labelLayer.clearLayers();
    localStorage.removeItem('zones_safe'); localStorage.removeItem('zones_danger');
    toast('All zones cleared.');
  };

  function toast(msg){
    const div = document.createElement('div');
    div.style.position='fixed';div.style.right='16px';div.style.bottom='16px';
    div.style.background='#111827';div.style.color='#e5e7eb';div.style.padding='10px 12px';
    div.style.border='1px solid #0b1220';div.style.borderRadius='10px';div.style.boxShadow='0 6px 20px rgba(0,0,0,.35)';
    div.textContent = msg; document.body.appendChild(div); setTimeout(()=>div.remove(), 1800);
  }

  function pointInsideGroup(lat, lon, group){
    const pt = turf.point([lon, lat]); let inside=false;
    group.eachLayer(l => {
      const gj = l.toGeoJSON();
      if(gj.geometry && (gj.geometry.type==='Polygon' || gj.geometry.type==='MultiPolygon')){
        if(turf.booleanPointInPolygon(pt, gj)) inside = true;
      }else if (gj.type==='FeatureCollection'){
        gj.features.forEach(f=>{ if(turf.booleanPointInPolygon(pt, f)) inside=true; });
      }
    });
    return inside;
  }

  function boatIcon(className='ok'){
    const img = 'img/cargo-ship.png';
    return L.divIcon({ className:'', html:`<div class="boat-icon ${className}"><img src="${img}" alt="boat"/></div>`, iconSize:[42,42], iconAnchor:[21,21], popupAnchor:[0,-22] });
  }

  const vessels = new Map();
  function upsertVessel({id, name, lat, lon}){
    let entry = vessels.get(id);
    if(!entry){
      const m = L.marker([lat, lon], { icon: boatIcon('ok'), title: `${name} (${id})` }).addTo(vesselLayer);
      entry = { marker: m, last: {lat, lon} }; vessels.set(id, entry);
    } else {
      entry.marker.setLatLng([lat, lon]); entry.last = {lat, lon};
    }

    const insideSafe = pointInsideGroup(lat, lon, safeLayer);
    const insideDanger = pointInsideGroup(lat, lon, dangerLayer);

    let status = 'No Zones'; let ok = true;
    if (insideDanger) { status = 'Breach (Inside Danger Zone)'; ok = false; }
    else if (!insideSafe && safeLayer.getLayers().length>0) { status = 'Breach (Outside Safety Zone)'; ok = false; }
    else if (safeLayer.getLayers().length>0) { status = 'Inside Safety Zone'; ok = true; }

    if (!ok){
      entry.marker.setIcon(boatIcon('alert'));
      entry.marker.bindPopup(`<b>${name}</b><br>${status}`).openPopup();
      // try { alarm.currentTime = 0; alarm.play().catch(()=>{}); } catch(e){}
    } else {
      entry.marker.setIcon(boatIcon('ok'));
      entry.marker.closePopup();
    }
    renderVesselList();
  }

  function renderVesselList(){
    elVessels.innerHTML='';
    vessels.forEach((e, id) => {
      const {lat, lon} = e.last;
      const insideSafe = pointInsideGroup(lat, lon, safeLayer);
      const insideDanger = pointInsideGroup(lat, lon, dangerLayer);
      let status = 'No Zones', ok = true;
      if (insideDanger){ status = 'Breach (Inside Danger Zone)'; ok=false; }
      else if (!insideSafe && safeLayer.getLayers().length>0){ status='Breach (Outside Safety Zone)'; ok=false; }
      else if (safeLayer.getLayers().length>0){ status='Inside Safety Zone'; ok=true; }
      const badgeCls = ok ? 'badge-ok' : 'badge-warn';
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `<div><div><b>${id}</b> <span class="badge ${badgeCls}">${status}</span></div><div style="color:#9ca3af;font-size:12px">${lat.toFixed(5)}, ${lon.toFixed(5)}</div></div><div><button onclick="window.__zoomTo('${id}')">🔎</button></div>`;
      elVessels.appendChild(div);
    });
  }

  window.__zoomTo = (id)=>{ const e = vessels.get(id); if(!e) return; map.setView([e.last.lat, e.last.lon], Math.max(map.getZoom(), 15)); };

  // Dummy motion loop (one vessel)
  let angle = 0;
  setInterval(() => {
    const lat = -3.570384 + Math.sin(angle) * 0.01;
    const lon = 118.973543 + Math.cos(angle) * 0.01;
    upsertVessel({ id: 'Vessel-01', name: 'Vessel-01', lat, lon });
    angle += 0.1;
  }, 1000);

  // -3.551794, 118.967879
  upsertVessel({ id: 'Vessel-01', name: 'Vessel-01', lat: -3.570384, lon: 118.973543 });
  setTimeout(()=> map.setView([-3.570384, 118.973543], 12), 500);
})();