// ============================================
// INICIALIZACIÓN DEL VISOR MAIN V2.5
// ============================================

const INTERVALO_ACTUALIZACION = 10 * 60 * 3000; // 30 minutos en ms

function cargarYMostrar(idEjecucion) {
    cargarEstacionesGeoJSON(idEjecucion)
        .then(geojson => {
            window.datosGeoJSON = geojson;

            // Mostrar reporte general HTML si existe
            const btnReporteGeneral = document.getElementById("generarReporteGeneral");
            if (btnReporteGeneral) {
                if (geojson.archivo_html && geojson.archivo_html.trim() !== "") {
                    btnReporteGeneral.href          = VISOR_CONFIG.rutaReportes + geojson.archivo_html.trim();
                    btnReporteGeneral.style.display = "block";
                } else {
                    btnReporteGeneral.style.display = "none";
                }
            }

            llenarFiltroRegiones(geojson);

            const filtroInstitucion = document.getElementById("filtro-institucion");
            if (filtroInstitucion) filtroInstitucion.value = "ema";

            aplicarFiltros();
            if (geojson.features && geojson.features.length > 0) {
                actualizarPanelEstacion(geojson.features[0]);
            }
        })
        .catch(error => {
            console.error("Error cargando GeoJSON:", error);
            alert("No se pudieron cargar las estaciones");
        });
}

function cargarEjecuciones(seleccionarPrimera = false) {
    return fetch('/visor/ejecuciones')
        .then(r => r.json())
        .then(data => {
            if (!data.ejecuciones || data.ejecuciones.length === 0) {
                console.error("No hay ejecuciones disponibles");
                return null;
            }

            const sel         = document.getElementById('filtro-ejecucion');
            const valorActual = sel.value;

            sel.innerHTML = '';
            data.ejecuciones.forEach((ej, i) => {
                const opt       = document.createElement('option');
                opt.value       = ej.id;
                opt.textContent = ej.fecha_ejecucion;
                if (i === 0) opt.selected = true;
                sel.appendChild(opt);
            });

            if (!seleccionarPrimera && valorActual) {
                const existe = [...sel.options].some(o => o.value === valorActual);
                if (existe) sel.value = valorActual;
            }

            return sel.value;
        })
        .catch(error => {
            console.error("Error cargando ejecuciones:", error);
            return null;
        });
}

document.addEventListener("DOMContentLoaded", function () {

    cargarEjecuciones(true).then(id => {
        if (id) cargarYMostrar(id);
    });

    document.getElementById('filtro-ejecucion')
        .addEventListener('change', function () {
            cargarYMostrar(this.value);
        });

    setInterval(() => {
        cargarEjecuciones(false).then(id => {
            if (id) cargarYMostrar(id);
        });
    }, INTERVALO_ACTUALIZACION);

});

