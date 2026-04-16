<?php

namespace Visor\Controller;

use Laminas\Mvc\Controller\AbstractActionController;
use Laminas\View\Model\ViewModel;
use Laminas\View\Model\JsonModel;
use Visor\Exception\DatabaseException;

class VisorController extends AbstractActionController
{
    private const DB_PATH = __DIR__ . '/../../../../data/db/'
        . 'sql_calidad_datos.db';

    public function indexAction()
    {
        return new ViewModel();
    }

    /**
     * Endpoint que devuelve GeoJSON para mapas
     */
    public function geojsonAction()
    {
        try {
            $request     = $this->getRequest();
            $idEjecucion = intval($request->getQuery('id_ejecucion', 0));

            $conexion    = new \SQLite3(self::DB_PATH);
            $conexion->busyTimeout(10000);
            $archivoHtml = null;

            if (!$idEjecucion) {
                [$idEjecucion, $archivoHtml] = $this->obtenerUltimaEjecucion($conexion);
            } else {
                $archivoHtml = $this->obtenerArchivoHtml($conexion, $idEjecucion);
            }

            $estaciones = $this->consultarEstaciones($conexion, $idEjecucion);
            $conexion->close();

            $geojson = [
                "type"         => "FeatureCollection",
                "archivo_html" => $archivoHtml,
                "features"     => array_values($estaciones)
            ];

            error_log("GeoJSON generado con " . count($geojson['features']) . " estaciones");

            return new JsonModel($geojson);

        } catch (DatabaseException $e) {
            error_log("Error en geojsonAction: " . $e->getMessage());

            return new JsonModel([
                "type"  => "Error",
                "error" => $e->getMessage()
            ]);
        }
    }

    /**
     * Obtiene el id y archivo_html de la última ejecución registrada
     */
    private function obtenerUltimaEjecucion(\SQLite3 $conexion): array
    {
        $row = $conexion->querySingle(
            "SELECT id, archivo_html FROM reportes ORDER BY fecha_ejecucion DESC LIMIT 1",
            true
        );
        $idEjecucion = $row ? intval($row['id']) : 0;
        $archivoHtml = $row ? $row['archivo_html'] : null;

        return [$idEjecucion, $archivoHtml];
    }

    /**
     * Obtiene el archivo_html asociado a una ejecución específica
     */
    private function obtenerArchivoHtml(\SQLite3 $conexion, int $idEjecucion): ?string
    {
        $row = $conexion->querySingle(
            "SELECT archivo_html FROM reportes WHERE id = $idEjecucion",
            true
        );
        return $row ? $row['archivo_html'] : null;
    }

    /**
     * Ejecuta la consulta principal y retorna el array de estaciones GeoJSON
     */
    private function consultarEstaciones(\SQLite3 $conexion, int $idEjecucion): array
    {
        $query  = $this->buildQuery($idEjecucion);
        $result = $conexion->query($query);

        if (!$result) {
            throw new DatabaseException("Error SQL: " . $conexion->lastErrorMsg());
        }

        $estaciones = [];

        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $id = $row['codigo_nacional'];

            if (!isset($estaciones[$id])) {
                $estaciones[$id] = $this->buildFeature($row);
            }

            $this->parsearAlertas($estaciones[$id], $row['alertas_concat']);
            $this->parsearVariables($estaciones[$id], $row['variable_concat']);
        }

        return $estaciones;
    }

    /**
     * Construye la query SQL principal parametrizada con el id de ejecución
     */
    private function buildQuery(int $idEjecucion): string
    {
        return "
            SELECT
                e.codigo_nacional, e.nombre, e.region, e.numero_region,
                e.comuna, e.lat, e.lon, e.altura, e.institucion,

                m.temperatura, m.humedad, m.presion,
                m.viento_velocidad, m.viento_direccion,
                m.precipitacion, m.fecha_medicion,

                a.estado_conexion, a.estado_estacion, a.mensaje, a.reporte,
                al.alertas_concat,
                av.variable_concat

            FROM estaciones e

            LEFT JOIN mediciones m
                ON e.codigo_nacional = m.codigo_nacional
                AND m.id_ejecucion = $idEjecucion

            LEFT JOIN (
                SELECT a1.codigo_nacional, a1.estado_conexion,
                    a1.estado_estacion, a1.mensaje, a1.reporte
                FROM alertas a1
                INNER JOIN (
                    SELECT codigo_nacional, MAX(fecha_alerta) AS max_fecha
                    FROM alertas
                    WHERE id_ejecucion = $idEjecucion
                    GROUP BY codigo_nacional
                ) a2 ON a1.codigo_nacional = a2.codigo_nacional
                    AND a1.fecha_alerta = a2.max_fecha
                    AND a1.id_ejecucion = $idEjecucion
            ) a ON e.codigo_nacional = a.codigo_nacional

            LEFT JOIN (
                SELECT codigo_nacional,
                    GROUP_CONCAT(
                        mensaje || '|' || tipo_mensaje || '|' || fecha_alerta || '|' || IFNULL(reporte, ''),
                        ';;'
                    ) AS alertas_concat
                FROM alertas
                WHERE id_ejecucion = $idEjecucion
                GROUP BY codigo_nacional
            ) al ON e.codigo_nacional = al.codigo_nacional

            LEFT JOIN (
                SELECT a_outer.codigo_nacional,
                    GROUP_CONCAT(
                        a_outer.variable || '|' || a_outer.estado_variable,
                        ';;'
                    ) AS variable_concat
                FROM alertas a_outer
                INNER JOIN (
                    SELECT codigo_nacional, variable, MAX(fecha_alerta) AS max_fecha
                    FROM alertas
                    WHERE id_ejecucion = $idEjecucion AND variable IS NOT NULL
                    GROUP BY codigo_nacional, variable
                ) a_inner ON a_outer.codigo_nacional = a_inner.codigo_nacional
                        AND a_outer.variable = a_inner.variable
                        AND a_outer.fecha_alerta = a_inner.max_fecha
                        AND a_outer.id_ejecucion = $idEjecucion
                GROUP BY a_outer.codigo_nacional
            ) av ON e.codigo_nacional = av.codigo_nacional
        ";
    }

    /**
     * Construye un feature GeoJSON a partir de una fila de la consulta
     */
    private function buildFeature(array $row): array
    {
        return [
            "type"     => "Feature",
            "id"       => (string)$row['codigo_nacional'],
            "geometry" => [
                "type"        => "Point",
                "coordinates" => [floatval($row['lon']), floatval($row['lat'])]
            ],
            "properties" => [
                "nombre"           => $row['nombre'],
                "region"           => $row['region'],
                "numero_region"    => $row['numero_region'],
                "comuna"           => $row['comuna'],
                "altura"           => $row['altura'] ? floatval($row['altura']) : null,
                "institucion"      => $row['institucion'],
                "temperatura"      => $row['temperatura'],
                "humedad"          => $row['humedad'],
                "presion"          => $row['presion'],
                "viento_velocidad" => $row['viento_velocidad'],
                "viento_direccion" => $row['viento_direccion'],
                "precipitacion"    => $row['precipitacion'],
                "fecha_medicion"   => $row['fecha_medicion'],
                "estado_conexion"  => $row['estado_conexion'],
                "estado_estacion"  => $row['estado_estacion'],
                "mensaje"          => $row['mensaje'],
                "reporte"          => $row['reporte'],
                "alertas"          => [],
                "variables"        => []
            ]
        ];
    }

    /**
     * Parsea el campo alertas_concat e incorpora las alertas al feature
     */
    private function parsearAlertas(array &$feature, ?string $alertasConcat): void
    {
        if (empty($alertasConcat)) {
            return;
        }
        foreach (explode(';;', $alertasConcat) as $a) {
            $partes = explode('|', $a);
            if (count($partes) === 4) {
                [$mensaje, $tipo, $fecha, $reporte] = $partes;
                $feature["properties"]["alertas"][] = [
                    "mensaje" => $mensaje,
                    "tipo"    => $tipo,
                    "fecha"   => $fecha,
                    "reporte" => $reporte
                ];
            }
        }
    }

    /**
     * Parsea el campo variable_concat e incorpora las variables al feature
     */
    private function parsearVariables(array &$feature, ?string $variableConcat): void
    {
        if (empty($variableConcat)) {
            return;
        }
        foreach (explode(';;', $variableConcat) as $v) {
            $partes = explode('|', $v);
            if (count($partes) === 2) {
                [$nombre, $estadoVariable] = $partes;
                $feature["properties"]["variables"][] = [
                    "nombre"          => $nombre,
                    "estado_variable" => $estadoVariable
                ];
            }
        }
    }

    /**
     * Endpoint que devuelve el historial de ejecuciones disponibles
     */
    public function ejecucionesAction()
    {
        $conexion = new \SQLite3(self::DB_PATH);

        $result = $conexion->query("
            SELECT id, fecha_ejecucion
            FROM reportes
            ORDER BY fecha_ejecucion DESC
            LIMIT 100
        ");

        $lista = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $lista[] = $row;
        }
        $conexion->close();

        return new JsonModel(['ejecuciones' => $lista]);
    }
}

