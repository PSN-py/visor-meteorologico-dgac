// visor-estaciones.js V2.5
// Funciones para gestionar el panel, filtros y estadísticas de la estación seleccionada.

// ============================================
// Ruta de reportes html public/Reportes
// ============================================
const VISOR_CONFIG = {
    rutaReportes: "/Reportes/"
};


// ============================================
// UTILIDADES
// ============================================
function getProps(f) {
    return f?.properties || {};
}

function getColorPorEstado(estado) {
    const e = (estado || 'normal').toLowerCase();
    if (e === 'error')   return '#dc3545';
    if (e === 'alerta')  return '#ffc107';
    if (e === 'offline') return '#6c757d';
    return '#198754';
}

// ============================================
// TABLA DE MEDICIONES
// ============================================
function actualizarTablaMediciones(feature) {
    const p     = getProps(feature);
    const tbody = document.getElementById("tabla-mediciones");

    if (!tbody) {
        console.error("No existe tabla-mediciones");
        return;
    }

    const mediciones = [
        { variable: "Temperatura", valor: p.temperatura,     unidad: "°C",   estado_variable: p.estado_variable || 'Normal' },
        { variable: "Humedad",     valor: p.humedad,          unidad: "%",    estado_variable: p.estado_variable || 'Normal' },
        { variable: "Presión",     valor: p.presion,          unidad: "hPa",  estado_variable: p.estado_variable || 'Normal' },
        { variable: "Viento",      valor: p.viento_velocidad, unidad: "km/h", estado_variable: p.estado_variable || 'Normal' }
    ].filter(m => m.valor !== null && m.valor !== undefined);

    tbody.innerHTML = mediciones.map(m => {
        const color = getColorPorEstado(m.estado_variable || 'Normal');
        const badge = `
            <div style="
                background: ${color};
                width: 12px;
                height: 12px;
                border-radius: 50%;
                margin: auto;
            "></div>
        `;
        return `
            <tr style="border-left: 3px solid ${color};">
                <td>${badge}</td>
                <td>${m.variable}</td>
                <td>${m.valor} ${m.unidad}</td>
                <td>${p.fecha_medicion ?? '--'}</td>
            </tr>
        `;
    }).join("");
}

// ============================================
// FILTROS
// ============================================

// S3776: extraído de aplicarFiltros para reducir complejidad
function cumpleFiltroRegion(p, regionSel) {
    if (regionSel === "todos") return true;
    return p.region && p.region === regionSel;
}

function cumpleFiltroInstitucion(p, institucionSel) {
    if (institucionSel === "todas") return true;
    if (institucionSel === "ema"    && p.institucion !== "EMA") return false;
    if (institucionSel === "no_ema" && p.institucion === "EMA") return false;
    return true;
}

function cumpleFiltroEstado(f, estadoSel, variableSel) {
    if (estadoSel === "todos") return true;
    const estadoEstacion = obtenerEstado(f, variableSel);
    return estadoEstacion === estadoSel.toUpperCase();
}

function cumpleFiltroCodigo(f, codigoBuscado) {
    if (codigoBuscado === "") return true;
    return String(f.id).includes(codigoBuscado);
}

function aplicarFiltros() {
    const geojson = window.datosGeoJSON;

    if (!geojson || !geojson.features) {
        console.warn("No hay GeoJSON cargado");
        return;
    }

    const regionSel      = document.getElementById("filtro-region").value;
    const institucionSel = document.getElementById("filtro-institucion").value;
    const estadoSel      = document.getElementById("filtro-estado").value;
    const variableSel    = document.getElementById("filtro-variable").value;
    const codigoBuscado  = document.getElementById("buscador-codigo").value.trim();

    const filtradas = geojson.features.filter(f => {
        const p = f.properties || {};
        if (!cumpleFiltroRegion(p, regionSel))              return false;
        if (!cumpleFiltroInstitucion(p, institucionSel))    return false;
        if (!cumpleFiltroEstado(f, estadoSel, variableSel)) return false;
        if (!cumpleFiltroCodigo(f, codigoBuscado))          return false;
        return true;
    });

    window.estacionesFiltradas = filtradas;

    const resultado = { type: "FeatureCollection", features: filtradas };
    dibujarEstaciones(resultado);
    actualizarEstadisticas(resultado);
}

// ============================================
// FILTRO DE REGIONES
// ============================================
function llenarFiltroRegiones(geojson) {
    if (!geojson || geojson.type !== "FeatureCollection" || !geojson.features) {
        console.warn("llenarFiltroRegiones: datos inválidos");
        return;
    }

    const select = document.getElementById("filtro-region");
    if (!select) return;

    const valorActual = select.value;

    while (select.options.length > 1) {
        select.remove(1);
    }

    const regiones = [...new Set(
        geojson.features.map(f => getProps(f).region)
    )].filter(r => r).sort();

    regiones.forEach(r => {
        const option = document.createElement("option");
        option.value = r;
        option.text  = r;
        select.appendChild(option);
    });

    if (valorActual !== 'todos' && regiones.includes(valorActual)) {
        select.value = valorActual;
    }
}

// ============================================
// ESTADO POR VARIABLE
// ============================================
function obtenerEstado(feature, variableSel) {
    const p = getProps(feature);

    if (Number(p.estado_conexion) === 0) return "OFFLINE";

    if (!variableSel || variableSel === "General") {
        return (p.estado_estacion || "NORMAL").toUpperCase();
    }

    if (Array.isArray(p.variables)) {
        const variable = p.variables.find(
            v => v.nombre.toLowerCase() === variableSel.toLowerCase()
        );
        if (variable && variable.estado_variable) {
            return variable.estado_variable.toUpperCase();
        }
    }

    return (p.estado_estacion || "NORMAL").toUpperCase();
}

// ============================================
// ESTADÍSTICAS DEL PANEL LATERAL
// ============================================

// S3776: extraído de actualizarEstadisticas para reducir complejidad
function contarEstados(features) {
    const stats = { total: 0, normal: 0, advertencia: 0, error: 0, online: 0, offline: 0 };

    features.forEach(f => {
        const p = getProps(f);
        stats.total++;

        if (Number(p.estado_conexion) !== 1) {
            stats.offline++;
            return;
        }

        stats.online++;
        const estado = (p.estado_estacion || '');
        if (estado === 'NORMAL')      stats.normal++;
        else if (estado === 'ALERTA') stats.advertencia++;
        else if (estado === 'ERROR')  stats.error++;
    });

    return stats;
}

function actualizarEstadisticas(geojson) {
    if (!geojson || geojson.type !== "FeatureCollection") {
        console.warn("No es GeoJSON válido");
        return;
    }

    const stats = contarEstados(geojson.features);

    const elementos = {
        'total-estaciones':  stats.total,
        'online-estaciones': `● online ${stats.online}`,
        'offline-estaciones':`● offline ${stats.offline}`,
        'normal-count':      `Normal: ${stats.normal}`,
        'advertencia-count': `Advertencia: ${stats.advertencia}`,
        'critica-count':     `Error: ${stats.error}`
    };

    Object.entries(elementos).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = valor;
    });
}

// ============================================
// PANEL DE ESTACIÓN SELECCIONADA
// ============================================

// S3776: extraído de actualizarPanelEstacion
function actualizarBadgeEstado(feature) {
    const variableSel  = document.getElementById('filtro-variable')?.value || 'General';
    const estadoActual = obtenerEstado(feature, variableSel);
    const badgeEstado  = document.querySelector('.card-header .badge');

    if (!badgeEstado) return;

    const configs = {
        'OFFLINE': { cls: 'badge bg-secondary ms-2',         label: 'OFFLINE'     },
        'ERROR':   { cls: 'badge bg-danger ms-2',            label: 'ERROR'       },
        'ALERTA':  { cls: 'badge bg-warning text-dark ms-2', label: 'ADVERTENCIA' },
        'NORMAL':  { cls: 'badge bg-success ms-2',           label: 'NORMAL'      },
    };
    const cfg = configs[estadoActual] || configs['NORMAL'];
    badgeEstado.className = cfg.cls;
    badgeEstado.innerHTML = cfg.label;

    if (variableSel !== 'General') {
        badgeEstado.innerHTML += ` <small style="font-size:10px">(${variableSel})</small>`;
    }
}

function actualizarInfoGeneral(feature) {
    const p = getProps(feature);
    document.getElementById('nombre-estacion-actual').innerHTML      = p.nombre || '';
    document.getElementById('id-estacion-actual').innerHTML          = feature.id;
    document.getElementById('region-estacion-actual').innerHTML      = `Región ${p.region}`;
    document.getElementById('institucion-estacion-actual').innerHTML = `Institución: ${p.institucion}`;
    document.getElementById('mensaje-alerta').innerHTML              = p.mensaje || '';
}

function actualizarCoordenadas(feature) {
    const coords = feature.geometry?.coordinates || [];
    const lon    = coords[0];
    const lat    = coords[1];
    const p      = getProps(feature);

    document.getElementById('estacion-lat').textContent    = (lat != null) ? lat.toFixed(2) + '°' : 'N/A';
    document.getElementById('estacion-lon').textContent    = (lon != null) ? lon.toFixed(2) + '°' : 'N/A';
    document.getElementById('estacion-altura').textContent = p.altura ? Number(p.altura).toFixed(0) + ' m' : 'N/A';
}

// S3358: ternario anidado extraído a función
function getColorPorTipoVariable(est) {
    if (est === 'error')  return '#dc3545';
    if (est === 'alerta') return '#ffc107';
    return '#198754';
}

function actualizarListaVariables(p) {
    const listaVariables = document.getElementById("lista-variables");
    if (!listaVariables) return;

    const variables = p.variables || [];
    if (variables.length === 0) {
        listaVariables.innerHTML = `<div class="text-muted">Sin datos de variables</div>`;
        return;
    }

    listaVariables.innerHTML = variables.map(v => {
        const est   = (v.estado_variable || 'normal').toLowerCase();
        const color = getColorPorTipoVariable(est);
        return `
        <div class="mb-1 p-1 rounded d-flex justify-content-between align-items-center"
             style="border-left: 3px solid ${color}">
            <span>${v.nombre}</span>
            <span class="badge" style="background:${color}">${v.estado_variable.toUpperCase()}</span>
        </div>`;
    }).join('');
}

// S3358: ternario anidado extraído a función
function getColorPorTipoAlerta(tipo) {
    if (tipo === 'error')       return '#dc3545';
    if (tipo === 'advertencia') return '#ffc107';
    return '#0dcaf0';
}

function actualizarListaAlertas(p) {
    const listaAlertas = document.getElementById("lista-alertas");
    if (!listaAlertas) {
        console.warn("No existe #lista-alertas en el HTML");
        return;
    }

    const alertas = p.alertas || [];
    if (alertas.length === 0) {
        listaAlertas.innerHTML = `<div class="text-muted">Sin alertas recientes</div>`;
    } else {
        alertas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        listaAlertas.innerHTML = alertas.map(a => {
            const tipo  = (a.tipo || 'info').toLowerCase();
            const color = getColorPorTipoAlerta(tipo);
            return `
            <div class="mb-1 p-1 rounded" style="border-left: 3px solid ${color}">
                <strong>${a.tipo}</strong>: ${a.mensaje}
                <div class="text-muted" style="font-size: 11px;">
                    ${new Date(a.fecha).toLocaleString()}
                </div>
            </div>`;
        }).join('');
    }

    listaAlertas.style.display = "none";
}

function actualizarBtnReporte(p) {
    const btnReporte = document.getElementById("btn-ver-reporte");
    if (!btnReporte) return;

    const alertaConReporte = (p.alertas || []).find(a => a.reporte);
    if (alertaConReporte) {
        btnReporte.href          = VISOR_CONFIG.rutaReportes + alertaConReporte.reporte;
        btnReporte.style.display = "block";
    } else {
        btnReporte.style.display = "none";
    }
}

function actualizarBtnGraficos(feature) {
    const btnGraficos = document.getElementById("btn-ver-graficos");
    if (!btnGraficos || !feature || !feature.id) return;

    const hoy  = new Date();
    const anio = hoy.getFullYear();
    const mes  = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia  = String(hoy.getDate()).padStart(2, '0');

    btnGraficos.href = `https://climatologia.meteochile.gob.cl/application/diariob/graficosRecienteEma/${feature.id}/${anio}/${mes}/${dia}`;
}

function actualizarPanelEstacion(feature) {
    const p = getProps(feature);

    actualizarBadgeEstado(feature);
    actualizarInfoGeneral(feature);
    actualizarCoordenadas(feature);
    actualizarTablaMediciones(feature);
    actualizarListaVariables(p);
    actualizarListaAlertas(p);
    actualizarBtnReporte(p);
    actualizarBtnGraficos(feature);
}

// ============================================
// EVENTOS DE FILTROS Y AUTOCOMPLETADO
// ============================================
document.addEventListener("DOMContentLoaded", () => {

    const filtroVariable    = document.getElementById("filtro-variable");
    const filtroEstado      = document.getElementById("filtro-estado");
    const filtroRegion      = document.getElementById("filtro-region");
    const buscadorCodigo    = document.getElementById("buscador-codigo");
    const filtroInstitucion = document.getElementById("filtro-institucion");
    const btnHistorial      = document.getElementById("btn-ver-historial");

    if (filtroVariable)    filtroVariable.addEventListener("change", aplicarFiltros);
    if (filtroEstado)      filtroEstado.addEventListener("change", aplicarFiltros);
    if (filtroRegion)      filtroRegion.addEventListener("change", aplicarFiltros);
    if (filtroInstitucion) filtroInstitucion.addEventListener("change", aplicarFiltros);

    if (buscadorCodigo) {
        let timeout = null;
        buscadorCodigo.addEventListener("input", () => {
            clearTimeout(timeout);
            timeout = setTimeout(aplicarFiltros, 300);
        });
    }

    const inputCodigo           = document.getElementById("buscador-codigo");
    const contenedorSugerencias = document.getElementById("sugerencias-estaciones");

    if (inputCodigo) {
        inputCodigo.addEventListener("input", function () {
            const valor = this.value.toLowerCase().trim();
            contenedorSugerencias.innerHTML = "";

            if (valor.length < 2) return;

            const coincidencias = (window.estacionesFiltradas || window.datosGeoJSON.features)
                .map(f => {
                    const p = getProps(f);
                    return { id: f.id, nombre: p.nombre };
                })
                .filter(e =>
                    e.id.toString().toLowerCase().includes(valor) ||
                    (e.nombre && e.nombre.toLowerCase().includes(valor))
                )
                .slice(0, 5);

            coincidencias.forEach(estacion => {
                const item       = document.createElement("a");
                item.className   = "list-group-item list-group-item-action";
                item.textContent = `${estacion.id} - ${estacion.nombre}`;
                item.addEventListener("click", () => {
                    inputCodigo.value               = estacion.id;
                    contenedorSugerencias.innerHTML = "";
                    aplicarFiltros();
                });
                contenedorSugerencias.appendChild(item);
            });
        });
    }

    if (btnHistorial) {
        btnHistorial.addEventListener("click", function (e) {
            e.preventDefault();
            const lista = document.getElementById("lista-alertas");
            if (!lista) return;

            if (lista.style.display === "none") {
                lista.style.display = "block";
                this.innerHTML = '<i class="fas fa-eye-slash me-1"></i> Ocultar Historial';
            } else {
                lista.style.display = "none";
                this.innerHTML = '<i class="fas fa-file-alt me-1"></i> Ver Historial de Alertas';
            }
        });
    }
});
