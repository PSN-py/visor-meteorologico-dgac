// visor-mapaGeo.js V2.5 - Funciones para dibujar estaciones en el mapa (versión GeoJSON)

// ============================================
// VARIABLES GLOBALES
// ============================================
let capaEstaciones;
let mapaMax            = false;
let velocidadRecorrido = 3000;
let recorridoActivo    = false;
let timeoutId          = null;
let estacionesGlobal   = [];
let indexGlobal        = 0;

window.estacionSeleccionada = null;

// ============================================
// CARGA DE ESTACIONES EN FORMATO GEOJSON
// ============================================
function cargarEstacionesGeoJSON(idEjecucion) {
    const url = idEjecucion
        ? `/visor/geojson?id_ejecucion=${idEjecucion}`
        : '/visor/geojson';

    return fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (data.type === 'Error') {
                throw new Error(data.error || 'Error al cargar GeoJSON');
            }
            if (data.type !== 'FeatureCollection') {
                throw new Error('El formato recibido no es GeoJSON válido');
            }
            return data;
        });
}

// ============================================
// SELECCIÓN DE ESTACIÓN AL HACER CLICK EN MARCADOR
// ============================================
function seleccionarEstacion(feature, opciones = {}) {
    if (!feature) return;

    window.estacionSeleccionada = feature;

    actualizarPanelEstacion(feature);
    actualizarTablaMediciones(feature);

    if (!opciones.desdeRecorrido) {
        centrarMapa(feature);
    }
}

// ============================================
// CONVERSIÓN DE GEOJSON A ARRAY DE ESTACIONES
// ============================================
function geojsonToEstacionesArray(geojson) {
    if (!geojson || !geojson.features) return [];

    return geojson.features.map(feature => ({
        id:              feature.id,
        nombre:          feature.properties.nombre,
        lat:             feature.geometry.coordinates[1],
        lon:             feature.geometry.coordinates[0],
        region:          feature.properties.region,
        altura:          feature.properties.altura,
        institucion:     feature.properties.institucion,
        estadoConexion:  feature.properties.estado_conexion,
        estadoEstacion:  feature.properties.estado_estacion || 'normal',
        temperatura:     feature.properties.temperatura,
        humedad:         feature.properties.humedad,
        presion:         feature.properties.presion,
        vientoVelocidad: feature.properties.viento_velocidad,
        vientoDireccion: feature.properties.viento_direccion,
        precipitacion:   feature.properties.precipitacion,
        ultimaMedicion:  feature.properties.ultima_medicion
    }));
}

// ============================================
// DIBUJAR ESTACIONES EN EL MAPA
// ============================================

// S3776: extraído de dibujarEstaciones
function buildPopupContent(f, p, colorEstado, estadoTexto) {
    let content = `
        <div style="min-width: 250px; font-size: 15px;">
            <b>${p.nombre}</b><br>
            ID: ${f.id}<br>
            Región: ${p.region || 'No especificada'}<br>
            Estado: <span style="color:${colorEstado}; font-weight:bold;">${estadoTexto}</span><br>
            Reporte: ${p.mensaje || 'Sin mensaje'}
            <hr>
            <table style="width:100%; font-size:12px;">
    `;

    if (p.temperatura      != null) content += `<tr><td>Temperatura:</td><td><b>${p.temperatura} °C</b></td></tr>`;
    if (p.humedad          != null) content += `<tr><td>Humedad:</td><td><b>${p.humedad} %</b></td></tr>`;
    if (p.presion          != null) content += `<tr><td>Presión:</td><td><b>${p.presion} hPa</b></td></tr>`;
    if (p.viento_velocidad != null) content += `<tr><td>Viento:</td><td><b>${p.viento_velocidad} km/h</b></td></tr>`;

    content += `
            </table>
            <small>Última medición: ${p.fecha_medicion || 'Sin datos'}</small>
        </div>
    `;

    return content;
}

// S3776: extraído de dibujarEstaciones
function crearMarcador(f) {
    const p      = getProps(f);
    const coords = f.geometry?.coordinates || [];
    const lon    = coords[0];
    const lat    = coords[1];

    if (!lat || !lon) {
        console.warn(`Estación ${f.id} sin coordenadas`);
        return null;
    }

    const estado      = p.estado_estacion || 'NORMAL';
    const conexion    = Number(p.estado_conexion);
    const estadoTexto = conexion === 0 ? 'OFFLINE' : estado.toUpperCase();
    const colorEstado = getColorPorEstado(estado, conexion);

    const marcador = L.marker([lat, lon], {
        icon:     getIconoPorEstado(estado, conexion),
        estado:   estado,
        conexion: conexion
    });

    marcador.bindPopup(buildPopupContent(f, p, colorEstado, estadoTexto));
    marcador.feature = f;
    marcador.on('click', () => seleccionarEstacion(f));

    return marcador;
}

function dibujarEstaciones(geojson) {
    if (capaEstaciones) {
        capaEstaciones.clearLayers();
    }

    if (!geojson || geojson.type !== 'FeatureCollection') {
        console.warn('No es GeoJSON válido');
        return;
    }

    const features = geojson.features;

    if (!features || features.length === 0) {
        console.warn('No hay estaciones para dibujar');
        return;
    }

    features.forEach(f => {
        const marcador = crearMarcador(f);
        if (marcador) {
            capaEstaciones.addLayer(marcador);
        }
    });

    ajustarVistaMapa(features);
}

// ============================================
// AJUSTE DE VISTA DEL MAPA SEGÚN ESTACIONES
// ============================================
function ajustarVistaMapa(features) {
    const grupo = L.featureGroup(
        features.map(f => {
            const c = f.geometry.coordinates;
            return L.marker([c[1], c[0]]);
        })
    );

    try {
        if (features.length === 1) {
            const c = features[0].geometry.coordinates;
            mapa.setView([c[1], c[0]], 12);
            return;
        }

        let zoomMax = 7;
        const regionSeleccionada = document.getElementById("filtro-region")?.value;

        if (regionSeleccionada && regionSeleccionada !== "todas") {
            zoomMax = 9;
        } else if (features.length < 10) {
            zoomMax = 10;
        }

        mapa.fitBounds(grupo.getBounds(), { padding: [60, 60], maxZoom: zoomMax });

    } catch (e) {
        console.warn('Error ajustando bounds:', e);
        mapa.setView([-33.45, -70.67], 6);
    }
}

// ============================================
// FILTRO DE ESTACIONES POR REGIÓN, ESTADO E INSTITUCIÓN
// ============================================
function filtrarEstaciones(filtro) {
    const datosGeoJSON = window.datosGeoJSON;

    if (!datosGeoJSON) {
        console.warn('No hay datos GeoJSON cargados');
        return [];
    }

    let estacionesArray = geojsonToEstacionesArray(datosGeoJSON);

    if (filtro.region      && filtro.region      !== '') estacionesArray = estacionesArray.filter(e => e.region      === filtro.region);
    if (filtro.estado      && filtro.estado      !== '') estacionesArray = estacionesArray.filter(e => e.estado      === filtro.estado);
    if (filtro.institucion && filtro.institucion !== '') estacionesArray = estacionesArray.filter(e => e.institucion === filtro.institucion);

    dibujarEstaciones(estacionesArray);

    return estacionesArray;
}

// ============================================
// REGIONES ÚNICAS PARA EL FILTRO
// ============================================
function obtenerRegionesUnicas() {
    const datosGeoJSON = window.datosGeoJSON;
    if (!datosGeoJSON) return [];

    const estacionesArray = geojsonToEstacionesArray(datosGeoJSON);
    const regiones = [...new Set(estacionesArray.map(e => e.region).filter(r => r))];
    return regiones.sort();
}

// ============================================
// ACTUALIZAR SELECT DE REGIONES
// ============================================
function actualizarSelectRegiones(selectId) {
    const regiones = obtenerRegionesUnicas();
    const select   = document.getElementById(selectId);

    if (select) {
        select.innerHTML = '<option value="">Todas las regiones</option>';
        regiones.forEach(region => {
            const option       = document.createElement('option');
            option.value       = region;
            option.textContent = region;
            select.appendChild(option);
        });
    }
}

// ============================================
// ORDENAR ESTACIONES POR CERCANÍA PARA RECORRIDO
// ============================================
function ordenarPorCercania(estaciones) {
    if (estaciones.length === 0) return [];

    const ordenadas = [];
    const restantes = [...estaciones];

    restantes.sort((a, b) => b.getLatLng().lat - a.getLatLng().lat);

    let actual = restantes.shift();
    ordenadas.push(actual);

    while (restantes.length > 0) {
        let masCercanaIndex = 0;
        let menorDistancia  = Infinity;

        restantes.forEach((est, index) => {
            const d = mapa.distance(actual.getLatLng(), est.getLatLng());
            if (d < menorDistancia) {
                menorDistancia  = d;
                masCercanaIndex = index;
            }
        });

        actual = restantes.splice(masCercanaIndex, 1)[0];
        ordenadas.push(actual);
    }

    return ordenadas;
}

// ============================================
// AVANZAR AL SIGUIENTE EN EL RECORRIDO
// ============================================
function siguiente() {
    if (!recorridoActivo) return;

    if (indexGlobal >= estacionesGlobal.length) {
        recorridoActivo = false;
        const btn = document.getElementById('btn-recorrer');
        if (btn) btn.innerHTML = '▶ Recorrer';
        return;
    }

    const marker = estacionesGlobal[indexGlobal];
    const pos    = marker.getLatLng();

    const avanzar = () => {
        capaEstaciones.zoomToShowLayer(marker, () => {
            marker.openPopup();
            seleccionarEstacion(marker.feature, { desdeRecorrido: true });
            indexGlobal++;
            timeoutId = setTimeout(siguiente, velocidadRecorrido);
        });
    };

    if (mapa.getCenter().distanceTo(pos) < 10) {
        avanzar();
    } else {
        mapa.flyTo(pos, 12, { duration: 2 });
        mapa.once('moveend', avanzar);
    }
}

// ============================================
// INICIAR RECORRIDO DE ESTACIONES
// ============================================
function recorrerEstaciones() {
    if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
    }

    estacionesGlobal = [];
    capaEstaciones.eachLayer(function (layer) {
        if (layer.getLatLng && mapa.getBounds().contains(layer.getLatLng())) {
            estacionesGlobal.push(layer);
        }
    });

    if (estacionesGlobal.length === 0) {
        console.warn("No hay estaciones visibles en el mapa");
        return;
    }

    estacionesGlobal = ordenarPorCercania(estacionesGlobal);
    indexGlobal      = 0;
    recorridoActivo  = true;

    siguiente();

    const btn = document.getElementById('btn-recorrer');
    if (btn) btn.innerHTML = '⏸ Pausar';
}

// ============================================
// CONTROLAR RECORRIDO (PAUSAR / REANUDAR)
// ============================================
function controlRecorrido() {
    const btn = document.getElementById('btn-recorrer');

    if (recorridoActivo) {
        recorridoActivo = false;
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        btn.innerHTML = '▶ Recorrer';
    } else {
        if (estacionesGlobal.length === 0 || indexGlobal >= estacionesGlobal.length) {
            recorrerEstaciones();
        } else {
            recorridoActivo = true;
            siguiente();
            btn.innerHTML = '⏸ Pausar';
        }
    }
}

// ============================================
// MAXIMIZAR / RESTAURAR MAPA
// ============================================
function toggleMapa() {
    const cont  = document.getElementById("panel-mapa");
    const boton = document.getElementById("btn-max-mapa");

    if (!mapaMax) {
        cont.style.position   = "fixed";
        cont.style.top        = "0";
        cont.style.left       = "0";
        cont.style.width      = "100vw";
        cont.style.height     = "100vh";
        cont.style.zIndex     = "9999";
        cont.style.background = "white";
        boton.innerHTML       = "🗗 Minimizar";
        mapaMax = true;
    } else {
        cont.removeAttribute("style");
        boton.innerHTML = "⛶ Maximizar";
        mapaMax = false;
    }

    setTimeout(() => mapa.invalidateSize(), 300);
}

// ============================================
// COLOR SEGÚN ESTADO DE ESTACIÓN
// ============================================
function getColorPorEstado(estado, conexion) {
    if (Number(conexion) === 0) return '#000000';

    switch (estado) {
        case 'ERROR':  return '#dc3545';
        case 'ALERTA': return '#ffc107';
        default:       return '#28a745';
    }
}

// ============================================
// ÍCONO SEGÚN ESTADO DE ESTACIÓN
// ============================================
function getIconoPorEstado(estado, conexion) {
    const color = getColorPorEstado(estado, conexion);

    return L.divIcon({
        html: `<div style="
            background: ${color};
            width: 18px;
            height: 18px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 4px rgba(0,0,0,0.5);
        "></div>`,
        className: "",
        iconSize: [16, 16]
    });
}

// ============================================
// EXPORTAR FUNCIONES AL SCOPE GLOBAL
// ============================================
window.dibujarEstaciones       = dibujarEstaciones;
window.filtrarEstaciones       = filtrarEstaciones;
window.recorrerEstaciones      = recorrerEstaciones;
window.toggleMapa              = toggleMapa;
window.obtenerRegionesUnicas   = obtenerRegionesUnicas;
window.seleccionarEstacion     = seleccionarEstacion;
window.cargarEstacionesGeoJSON = cargarEstacionesGeoJSON;

// ============================================
// INICIALIZACIÓN DEL MAPA
// ============================================
const capasBase = {
    "Base ESRI Imagen": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxZoom: 18
    }),
    "Base ESRI Gris": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxZoom: 16
    }),
    "Base OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }),
    "Base ESRI Topográfica": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxZoom: 17
    })
};

const mapa = L.map('mapa', {
    layers: [capasBase["Base ESRI Topográfica"]]
}).setView([-33.45, -70.67], 7);

capaEstaciones = L.markerClusterGroup({
    maxClusterRadius: 70,
    iconCreateFunction: function (cluster) {
        const markers   = cluster.getAllChildMarkers();
        let critica     = false;
        let advertencia = false;
        let offline     = false;

        markers.forEach(m => {
            if (m.options.conexion === 0)      offline     = true;
            if (m.options.estado === "ERROR")  critica     = true;
            if (m.options.estado === "ALERTA") advertencia = true;
        });

        let color = "green";
        if (offline)           color = "black";
        else if (critica)      color = "red";
        else if (advertencia)  color = "orange";

        return L.divIcon({
            html: `<div style="
                background: ${color};
                color: white;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            ">${cluster.getChildCount()}</div>`,
            className: "cluster-custom",
            iconSize: [40, 40]
        });
    }
});

mapa.addLayer(capaEstaciones);

L.control.layers(capasBase, {}, {
    collapsed: false,
    position: 'topright'
}).addTo(mapa);
