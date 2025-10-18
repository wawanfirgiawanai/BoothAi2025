// ================== Global Data ==================
let DATA = [];       // Dataset historis
let SPI_DATA = [];   // Hasil analisis
let polygonLayer;    // Layer polygon
let stationLayer;    // Layer marker stasiun

// ================== CSV Parsing ==================
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const col = {
    station: header.indexOf("station"),
    date:    header.indexOf("date"),
    rain:    header.indexOf("rain_mm"),
    lat:     header.indexOf("lat"),
    lon:     header.indexOf("lon")
  };
  if (Object.values(col).some(i=>i<0)) {
    alert("Header CSV harus mengandung: station,date,rain_mm,lat,lon");
    return [];
  }
  return lines.slice(1).filter(Boolean).map(line=>{
    const p = line.split(",");
    return {
      station: p[col.station],
      date: p[col.date],
      rain_mm: Number(p[col.rain]),
      lat: Number(p[col.lat]),
      lon: Number(p[col.lon]),
      source: "Historis"
    };
  });
}

// ================== SPI Calculation ==================
function rollingSum(vals, k) {
  const out = []; let s = 0;
  for (let i=0;i<vals.length;i++) {
    s += vals[i];
    if (i >= k) s -= vals[i-k];
    out.push(i >= k-1 ? s : null);
  }
  return out;
}

function zscore(series) {
  const vals = series.filter(v=>v!=null);
  if (vals.length < 3) return series.map(_=>null);
  const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
  const sd = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/(vals.length-1));
  return series.map(v => (v==null||sd===0) ? null : (v-mean)/sd);
}

function buildSPI(data, k) {
  const by = {};
  data.forEach(r => { (by[r.station] ||= []).push(r); });
  let out = [];
  for (const st in by) {
    const rows = by[st].slice().sort((a,b)=>a.date.localeCompare(b.date));
    const vals = rows.map(r=>r.rain_mm);
    const rs = rollingSum(vals, k);
    const spi = zscore(rs);
    rows.forEach((r,i)=> out.push({...r, spi: spi[i], spi_k: k}));
  }
  return out;
}

// ================== Status dari SPI ==================
function statusFromSPI(spi, thrDry, thrWet) {
  if (spi == null) return {label:"Data Kosong", color:"#808080"}; // abu-abu
  if (spi <= thrDry) return {label:"Kering", color:"#B22222"};    // merah
  if (spi >= thrWet) return {label:"Basah", color:"#22C55E"};     // hijau
  return {label:"Normal", color:"#F5B80F"};                       // biru
}

// ================== Dummy ARIMA Forecast ==================
function forecastARIMA(data, lead=3) {
  const by = {};
  data.forEach(r=> (by[r.station] ||= []).push(r));
  let out = [];
  for (const st in by) {
    const rows = by[st].slice().sort((a,b)=>a.date.localeCompare(b.date));
    if (!rows.length) continue;
    const last = rows[rows.length-1];
    const base = rows.slice(-12).reduce((a,b)=>a+b.rain_mm,0) / Math.max(1, Math.min(12, rows.length));
    for (let l=1; l<=lead; l++) {
      const [y,m]=last.date.split("-").map(Number);
      const d = new Date(y, m-1+l, 1);
      const ym = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
      const noise = (Math.random()-0.5)*20;
      out.push({
        station: st,
        date: ym,
        rain_mm: Math.max(0, base+noise),
        lat: last.lat, lon: last.lon,
        source: "Prediksi"
      });
    }
  }
  return out;
}

// ================== Sidebar Resizer ==================
function setupResizer() {
  const resizer = document.getElementById("resizer");
  const sidebar = document.getElementById("sidebar");
  if (!resizer || !sidebar) return;
  resizer.addEventListener("mousedown", function(e) {
    document.onmousemove = function(ev) {
      const newWidth = ev.clientX;
      if (newWidth > 220 && newWidth < 600) {
        sidebar.style.width = newWidth+"px";
      }
    };
    document.onmouseup = function() {
      document.onmousemove = null;
    };
  });
}

// ================== INDEX (Map) ==================
function initMapPage() {
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  const map = L.map("map").setView([-3.45,119.2], 9);
  window._leafletMap = map;

  // 🎨 Base Maps
  const googleStreets = L.tileLayer("http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
    maxZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'], attribution: "© Google"
  }).addTo(map); // default

  const googleHybrid = L.tileLayer("http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}", {
    maxZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'], attribution: "© Google"
  });

  const googleSat = L.tileLayer("http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    maxZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'], attribution: "© Google"
  });

  const googleTerrain = L.tileLayer("http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", {
    maxZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'], attribution: "© Google"
  });

  const cartoDark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OSM &copy; Carto"
  });

  const osmDark = L.tileLayer("https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap contributors &copy; Stadia Maps"
  });

  // ✅ Layer Control
  const baseMaps = {
    "Google Streets": googleStreets,
    "Google Hybrid": googleHybrid,
    "Google Satellite": googleSat,
    "Google Terrain": googleTerrain,
    "Carto Dark": cartoDark,
    "OSM Dark": osmDark
  };
  L.control.layers(baseMaps).addTo(map);

  // Layers
  drawnItems = new L.FeatureGroup().addTo(map);
  stationLayer = L.layerGroup().addTo(map);

  map.addControl(new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: { polygon:true, rectangle:true, polyline:false, circle:false, marker:false, circlemarker:false }
  }));

  // Legend
  const legend = L.control({position:'bottomright'});
  legend.onAdd = function() {
    const div = L.DomUtil.create("div","legend");
    div.innerHTML = `
      <div><span class="sw" style="background:#808080"></span>Data Kosong</div>
      <div><span class="sw" style="background:#F5B80F"></span>Normal</div>
      <div><span class="sw" style="background:#B22222"></span>Kering</div>
      <div><span class="sw" style="background:#22C55E"></span>Basah</div>
    `;
    return div;
  };
  legend.addTo(map);

  function applyToMapAndTable() {
    if (!DATA.length) return;
    const k = Number(document.getElementById("spiK").value);
    const thrDry = Number(document.getElementById("thrDry").value);
    const thrWet = Number(document.getElementById("thrWet").value);
    const mode   = document.getElementById("mode").value;
    const lead   = Number(document.getElementById("lead").value);
    const riskFilter = document.getElementById("riskFilter")?.value || "all";

    let data = [...DATA];
    if (mode === "prediksi") data = data.concat(forecastARIMA(DATA, lead));
    SPI_DATA = buildSPI(data, k);

    stationLayer.clearLayers();
    const tbody = document.querySelector("#riskTable tbody");
    tbody.innerHTML = "";

    for (const r of SPI_DATA) {
      // 🔽 Filter sesuai dropdown
      if (riskFilter === "historis" && r.source !== "Historis") continue;
      if (riskFilter === "prediksi" && r.source !== "Prediksi") continue;

      const sev = statusFromSPI(r.spi, thrDry, thrWet);
      if (isFinite(r.lat) && isFinite(r.lon)) {
        L.circleMarker([r.lat, r.lon], {
          radius: 6, color: sev.color, fillColor: sev.color, fillOpacity: 0.85
        }).bindPopup(`
          <b>${r.station}</b><br>
          ${r.date} | SPI-${k}<br>
          Hujan: ${r.rain_mm} mm<br>
          SPI: ${r.spi==null?'n/a':r.spi.toFixed(2)}<br>
          Status: <span style="color:${sev.color}">${sev.label}</span><br>
          Sumber: ${r.source}
        `).addTo(stationLayer);
      }
      if (r.spi!=null) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.station}</td>
          <td>${r.date}</td>
          <td>${r.rain_mm}</td>
          <td>${r.spi.toFixed(2)}</td>
          <td style="color:${sev.color}">${sev.label}</td>
          <td>${r.source}</td>
        `;
        tbody.appendChild(tr);
      }
    }
  }

  // Upload CSV
  document.getElementById("fileInput")?.addEventListener("change", ev=>{
    const f = ev.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      DATA = parseCSV(reader.result);
      localStorage.setItem("ewsDataset", reader.result);
      applyToMapAndTable();
      const pts = DATA.map(r=>[r.lat,r.lon]).filter(p=>isFinite(p[0])&&isFinite(p[1]));
      if (pts.length) map.fitBounds(pts);
    };
    reader.readAsText(f);
  });

  document.getElementById("apply")?.addEventListener("click", applyToMapAndTable);
  document.getElementById("riskFilter")?.addEventListener("change", applyToMapAndTable);

  // Export CSV
  document.getElementById("exportCsv")?.addEventListener("click", ()=>{
    if (!SPI_DATA.length) return;
    const thrDry = Number(document.getElementById("thrDry").value);
    const thrWet = Number(document.getElementById("thrWet").value);
    const header = ["station","lat","lon","date","rain_mm","SPI","status","source"];
    const rows = SPI_DATA.map(r=>{
      const sev = statusFromSPI(r.spi, thrDry, thrWet);
      return [r.station,r.lat,r.lon,r.date,r.rain_mm,(r.spi==null?"":r.spi.toFixed(2)),sev.label,r.source];
    });
    const csv = [header].concat(rows).map(a=>a.join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "spi_analysis.csv";
    a.click();
  });

  // Export Polygon
  document.getElementById("exportPolygon")?.addEventListener("click", ()=>{
    const data = polygonLayer.toGeoJSON();
    const blob = new Blob([JSON.stringify(data)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "polygon.geojson";
    a.click();
  });

  // Import Polygon
  document.getElementById("importPolygon")?.addEventListener("change", ev=>{
    const f = ev.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      const geojson = JSON.parse(reader.result);
      polygonLayer.clearLayers();
      L.geoJSON(geojson, {
        style: () => ({color:"#2563EB", fillColor:"#2563EB", fillOpacity:0.3})
      }).addTo(polygonLayer);
      polygonLayer.bringToBack();
      map.fitBounds(polygonLayer.getBounds());
    };
    reader.readAsText(f);
  });

  // Event gambar polygon baru
  map.on(L.Draw.Event.CREATED, e => {
    if (e.layerType === "polygon" || e.layerType === "rectangle") {
      const poly = e.layer;

      // 🎨 warna polygon biru
      poly.setStyle({
        color: "#2563EB",       // garis pinggir biru
        fillColor: "#2563EB",   // isi biru
        fillOpacity: 0.3        // transparansi isi
      });

      poly.bindPopup(`<b>Polygon Wilayah</b>`);

      // simpan ke drawnItems supaya bisa diedit/dihapus
      drawnItems.addLayer(poly);

      // selalu di bawah marker
      poly.bringToBack();
    }
  });
}

// ================== GRAFIK (Chart.js) ==================
let chart;
function initChartPage() {
  const chartCanvas = document.getElementById("spiChart");
  if (!chartCanvas) return;

  chart = new Chart(chartCanvas.getContext("2d"), {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: "#e8eaed" } } },
      scales: {
        x: { ticks: { color: "#e8eaed" } },
        y: { ticks: { color: "#e8eaed" } }
      }
    }
  });

  function applyToChart() {
    if (!DATA.length) return;
    const k = Number(document.getElementById("spiK").value);
    const showH = document.getElementById("showHistoris")?.checked;
    const showP = document.getElementById("showPrediksi")?.checked;
    const lead  = Number(document.getElementById("lead").value);

    let data = [...DATA];
    let pred = showP ? forecastARIMA(DATA, lead) : [];

    const histSPI = showH ? buildSPI(data, k).map(r=>({...r,source:"Historis"})) : [];
    const predSPI = showP ? buildSPI(data.concat(pred), k).filter(r=>r.source==="Prediksi") : [];

    const labels = Array.from(new Set(histSPI.concat(predSPI).map(r=>r.date))).sort();
    chart.data.labels = labels;

    const colors = ["#22C55E","#F5B80F","#B22222","#EAB308","#10B981","#F97316"];
    const stations = Array.from(new Set(histSPI.concat(predSPI).map(r=>r.station)));

    chart.data.datasets = [];

    stations.forEach((st, idx)=>{
      const color = colors[idx % colors.length];

      if (showH) {
        const seriesH = labels.map(l=>{
          const rec = histSPI.find(r=>r.station===st && r.date===l);
          return rec ? rec.spi : null;
        });
        chart.data.datasets.push({
          label: `${st} (Historis)`,
          data: seriesH,
          borderColor: color,
          borderWidth: 2,
          spanGaps: true,
          tension: 0.25
        });
      }

      if (showP) {
        const seriesP = labels.map(l=>{
          const rec = predSPI.find(r=>r.station===st && r.date===l);
          return rec ? rec.spi : null;
        });
        chart.data.datasets.push({
          label: `${st} (Prediksi)`,
          data: seriesP,
          borderColor: color,
          borderWidth: 2,
          borderDash: [6,4],
          spanGaps: true,
          tension: 0.25
        });
      }
    });

    chart.update();
  }

  const csvText = localStorage.getItem("ewsDataset");
  if (csvText) DATA = parseCSV(csvText);

  document.getElementById("apply")?.addEventListener("click", applyToChart);
  applyToChart();
}

// ================== Init ==================
document.addEventListener("DOMContentLoaded", ()=>{
  setupResizer();
  initMapPage();
  initChartPage();
});
