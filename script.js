/* =========================================================
   BYDLENÍ — MAPA ČR
   PERFORMANCE + CACHE + POI SYSTEM
========================================================= */


/* =========================================================
   API
========================================================= */

const RUIAN =
    "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer";

const OSM =
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const OVERPASS =
    "https://overpass-api.de/api/interpreter";

const NOMINATIM =
    "https://nominatim.openstreetmap.org/search";


/* =========================================================
   MAPA
========================================================= */

let map;

let zoneLayer = null;

let selectedFeature = null;

let activeLayer = "price";

let currentLevelKey = "";

let currentZoom = 7.5;

let renderTimer = null;

let poiTimer = null;

let zoneRequestId = 0;

let zoneAbortController = null;

let poiAbortController = null;


/* =========================================================
   CACHE
========================================================= */

const zoneCache = new Map();

const poiCache = new Map();


/* =========================================================
   POI VRSTVY
========================================================= */

const poiLayers = {};

const poiEnabled = {};


/* =========================================================
   ADMINISTRATIVNÍ ÚROVNĚ
========================================================= */

const LEVELS = {

    region: {
        id: 17,
        name: "Kraj"
    },

    district: {
        id: 15,
        name: "Okres"
    },

    municipality: {
        id: 12,
        name: "Obec"
    },

    cadastral: {
        id: 7,
        name: "Katastrální území"
    }

};


function getLevel(zoom) {

    if (zoom <= 7.5) {
        return LEVELS.region;
    }

    if (zoom <= 10) {
        return LEVELS.district;
    }

    if (zoom <= 12.5) {
        return LEVELS.municipality;
    }

    return LEVELS.cadastral;
}


/* =========================================================
   KRAJSKÁ MĚSTA
========================================================= */

const CAPITALS = [

    {
        name: "Praha",
        region: "Hlavní město Praha",
        lat: 50.0755,
        lng: 14.4378
    },

    {
        name: "České Budějovice",
        region: "Jihočeský kraj",
        lat: 48.9745,
        lng: 14.4743
    },

    {
        name: "Brno",
        region: "Jihomoravský kraj",
        lat: 49.1951,
        lng: 16.6068
    },

    {
        name: "Karlovy Vary",
        region: "Karlovarský kraj",
        lat: 50.2319,
        lng: 12.8714
    },

    {
        name: "Hradec Králové",
        region: "Královéhradecký kraj",
        lat: 50.2092,
        lng: 15.8328
    },

    {
        name: "Liberec",
        region: "Liberecký kraj",
        lat: 50.7671,
        lng: 15.0562
    },

    {
        name: "Ostrava",
        region: "Moravskoslezský kraj",
        lat: 49.8209,
        lng: 18.2625
    },

    {
        name: "Olomouc",
        region: "Olomoucký kraj",
        lat: 49.5938,
        lng: 17.2509
    },

    {
        name: "Pardubice",
        region: "Pardubický kraj",
        lat: 50.0343,
        lng: 15.7812
    },

    {
        name: "Plzeň",
        region: "Plzeňský kraj",
        lat: 49.7384,
        lng: 13.3736
    },

    {
        name: "Ústí nad Labem",
        region: "Ústecký kraj",
        lat: 50.6607,
        lng: 14.0323
    },

    {
        name: "Jihlava",
        region: "Kraj Vysočina",
        lat: 49.3961,
        lng: 15.5912
    },

    {
        name: "Zlín",
        region: "Zlínský kraj",
        lat: 49.2265,
        lng: 17.668
    }

];


/* =========================================================
   REAL CENY 09/2026
========================================================= */

const CAPITAL_PRICES = {

    "Praha": 154338,

    "České Budějovice": 87304,

    "Brno": 123456,

    "Karlovy Vary": 69660,

    "Hradec Králové": 96898,

    "Liberec": 83642,

    "Ostrava": 71032,

    "Olomouc": 86539,

    "Pardubice": 84773,

    "Plzeň": 94816,

    "Ústí nad Labem": 51580,

    "Jihlava": 71148,

    "Zlín": 87253

};


/* =========================================================
   REAL NÁJMY 09/2026
========================================================= */

const CAPITAL_RENTS = {

    "Praha": 465,

    "České Budějovice": 276,

    "Brno": 463,

    "Karlovy Vary": 236,

    "Hradec Králové": 294,

    "Liberec": 290,

    "Ostrava": 250,

    "Olomouc": 280,

    "Pardubice": 288,

    "Plzeň": 292,

    "Ústí nad Labem": 244,

    "Jihlava": 248,

    "Zlín": 284

};


/* =========================================================
   UI
========================================================= */

function showLoading(text) {

    const box =
        document.getElementById(
            "loading"
        );

    box.textContent =
        text;

    box.classList.remove(
        "hidden"
    );

}


function hideLoading() {

    document
        .getElementById(
            "loading"
        )
        .classList.add(
            "hidden"
        );

}


function showError(text) {

    const box =
        document.getElementById(
            "errorBox"
        );

    box.textContent =
        text;

    box.classList.remove(
        "hidden"
    );

}


function hideError() {

    document
        .getElementById(
            "errorBox"
        )
        .classList.add(
            "hidden"
        );

}


function formatNumber(value) {

    return Number(value)
        .toLocaleString(
            "cs-CZ"
        );

}


/* =========================================================
   STABLE HASH
========================================================= */

function seededValue(
    name,
    min,
    max
) {

    let hash = 0;

    const text =
        String(name || "");

    for (
        let i = 0;
        i < text.length;
        i++
    ) {

        hash =
            ((hash << 5) - hash) +
            text.charCodeAt(i);

        hash |= 0;

    }

    const normalized =
        Math.abs(hash) %
        1000 /
        1000;

    return (
        min +
        normalized *
        (max - min)
    );

}


/* =========================================================
   FEATURE NAME
========================================================= */

function featureName(
    feature
) {

    const p =
        feature &&
        feature.properties
            ? feature.properties
            : {};

    return (
        p.nazev ||
        p.Nazev ||
        p.name ||
        "Neznámá lokalita"
    );

}


/* =========================================================
   METRIKY
========================================================= */

function getMetric(
    feature,
    type
) {

    const name =
        featureName(feature);


    if (type === "price") {

        if (
            CAPITAL_PRICES[name]
        ) {

            return {

                value:
                    CAPITAL_PRICES[name],

                real:
                    true,

                label:
                    "RealityMIX 09/2026"

            };

        }


        return {

            value:
                seededValue(
                    name,
                    50000,
                    120000
                ),

            real:
                false,

            label:
                "DEMO"

        };

    }


    if (type === "rent") {

        if (
            CAPITAL_RENTS[name]
        ) {

            return {

                value:
                    CAPITAL_RENTS[name],

                real:
                    true,

                label:
                    "RealityMIX 09/2026"

            };

        }


        return {

            value:
                seededValue(
                    name,
                    200,
                    420
                ),

            real:
                false,

            label:
                "DEMO"

        };

    }


    if (type === "green") {

        return {

            value:
                seededValue(
                    name,
                    15,
                    75
                ),

            real:
                false,

            label:
                "DEMO index zeleně"

        };

    }


    if (type === "noise") {

        return {

            value:
                seededValue(
                    name,
                    15,
                    90
                ),

            real:
                false,

            label:
                "DEMO index hluku"

        };

    }


    if (type === "safety") {

        return {

            value:
                seededValue(
                    name,
                    30,
                    95
                ),

            real:
                false,

            label:
                "DEMO index bezpečnosti"

        };

    }


    if (type === "air") {

        return {

            value:
                seededValue(
                    name,
                    20,
                    95
                ),

            real:
                false,

            label:
                "DEMO index ovzduší"

        };

    }


    return {
        value: 0,
        real: false,
        label: "N/A"
    };

}


/* =========================================================
   BARVY
========================================================= */

function interpolateColor(
    c1,
    c2,
    t
) {

    const r =
        Math.round(
            c1[0] +
            (c2[0] - c1[0]) *
            t
        );

    const g =
        Math.round(
            c1[1] +
            (c2[1] - c1[1]) *
            t
        );

    const b =
        Math.round(
            c1[2] +
            (c2[2] - c1[2]) *
            t
        );

    return `rgb(${r},${g},${b})`;

}


function scaleColor(
    value,
    min,
    max,
    colors
) {

    let t =
        (value - min) /
        (max - min);

    t =
        Math.max(
            0,
            Math.min(
                1,
                t
            )
        );


    const scaled =
        t *
        (colors.length - 1);


    const index =
        Math.floor(
            scaled
        );


    if (
        index >=
        colors.length - 1
    ) {

        return (
            "rgb(" +
            colors[
                colors.length - 1
            ].join(",") +
            ")"
        );

    }


    const localT =
        scaled -
        index;


    return interpolateColor(
        colors[index],
        colors[index + 1],
        localT
    );

}


/* =========================================================
   POLYGON BARVA
========================================================= */

function getPolygonColor(
    feature
) {

    const metric =
        getMetric(
            feature,
            activeLayer
        );


    if (
        activeLayer ===
        "price"
    ) {

        return scaleColor(
            metric.value,
            50000,
            160000,

            [
                [35,165,90],
                [139,207,75],
                [244,216,74],
                [242,138,53],
                [210,52,52]
            ]
        );

    }


    if (
        activeLayer ===
        "rent"
    ) {

        return scaleColor(
            metric.value,
            200,
            480,

            [
                [66,168,107],
                [229,212,92],
                [225,120,57],
                [198,59,50]
            ]
        );

    }


    if (
        activeLayer ===
        "green"
    ) {

        return scaleColor(
            metric.value,
            0,
            100,

            [
                [237,248,237],
                [185,223,184],
                [76,154,82],
                [20,83,45]
            ]
        );

    }


    if (
        activeLayer ===
        "noise"
    ) {

        return scaleColor(
            metric.value,
            0,
            100,

            [
                [40,164,90],
                [232,211,66],
                [233,121,50],
                [201,50,50]
            ]
        );

    }


    if (
        activeLayer ===
        "safety"
    ) {

        return scaleColor(
            metric.value,
            0,
            100,

            [
                [215,70,70],
                [230,198,75],
                [85,169,108]
            ]
        );

    }


    if (
        activeLayer ===
        "air"
    ) {

        return scaleColor(
            metric.value,
            0,
            100,

            [
                [57,169,219],
                [139,212,93],
                [240,211,76],
                [232,120,69],
                [184,50,50]
            ]
        );

    }


    return "#4b83d1";

}


/* =========================================================
   LEGENDA
========================================================= */

function updateLegend() {

    const title =
        document.getElementById(
            "legendTitle"
        );

    const bar =
        document.getElementById(
            "legendBar"
        );

    const low =
        document.getElementById(
            "legendLow"
        );

    const high =
        document.getElementById(
            "legendHigh"
        );


    bar.className =
        "legend-bar";


    const config = {

        price: [
            "Ceny nemovitostí",
            "price-gradient",
            "levnější",
            "dražší"
        ],

        rent: [
            "Nájmy",
            "rent-gradient",
            "nižší",
            "vyšší"
        ],

        green: [
            "Zeleň",
            "green-gradient",
            "méně zeleně",
            "více zeleně"
        ],

        noise: [
            "Hluk",
            "noise-gradient",
            "klid",
            "hluk"
        ],

        safety: [
            "Bezpečnost",
            "safety-gradient",
            "nižší",
            "vyšší"
        ],

        air: [
            "Ovzduší",
            "air-gradient",
            "lepší",
            "horší"
        ]

    };


    const c =
        config[activeLayer];


    if (!c) {
        return;
    }


    title.textContent =
        c[0];

    bar.classList.add(
        c[1]
    );

    low.textContent =
        c[2];

    high.textContent =
        c[3];

}


/* =========================================================
   RÚIAN DATA
========================================================= */

async function fetchRuian(
    layerId,
    cacheKey,
    useCache = true
) {

    if (
        useCache &&
        zoneCache.has(cacheKey)
    ) {

        return zoneCache.get(
            cacheKey
        );

    }


    if (
        zoneAbortController
    ) {

        zoneAbortController.abort();

    }


    zoneAbortController =
        new AbortController();


    const bounds =
        map.getBounds();


    const params =
        new URLSearchParams();


    params.set(
        "where",
        "1=1"
    );


    /*
       U krajů a okresů
       stahujeme celou vrstvu.
       Je to mnohem stabilnější
       při zoomování ven.
    */

    if (
        cacheKey ===
        "region" ||
        cacheKey ===
        "district"
    ) {

        params.set(
            "where",
            "1=1"
        );

    } else {

        params.set(
            "geometry",

            [
                bounds.getWest(),
                bounds.getSouth(),
                bounds.getEast(),
                bounds.getNorth()
            ].join(",")
        );

        params.set(
            "geometryType",
            "esriGeometryEnvelope"
        );

        params.set(
            "inSR",
            "4326"
        );

        params.set(
            "spatialRel",
            "esriSpatialRelIntersects"
        );

    }


    params.set(
        "outFields",
        "*"
    );

    params.set(
        "returnGeometry",
        "true"
    );

    params.set(
        "outSR",
        "4326"
    );

    params.set(
        "f",
        "geojson"
    );

    params.set(
        "resultRecordCount",
        "1000"
    );


    let features = [];

    let offset = 0;

    const limit =
        cacheKey === "cadastral"
            ? 2500
            : 6000;


    while (
        offset < limit
    ) {

        params.set(
            "resultOffset",
            String(offset)
        );


        const url =
            `${RUIAN}/${layerId}/query?${params.toString()}`;


        const response =
            await fetch(
                url,
                {
                    signal:
                        zoneAbortController.signal
                }
            );


        if (!response.ok) {

            throw new Error(
                "ČÚZK RÚIAN API není dostupné."
            );

        }


        const data =
            await response.json();


        if (data.error) {

            throw new Error(
                data.error.message ||
                "Chyba RÚIAN."
            );

        }


        const batch =
            data.features ||
            [];


        features =
            features.concat(
                batch
            );


        if (
            !data.exceededTransferLimit ||
            batch.length === 0
        ) {

            break;

        }


        offset +=
            batch.length;

    }


    const result = {

        type:
            "FeatureCollection",

        features:
            features

    };


    if (
        useCache
    ) {

        zoneCache.set(
            cacheKey,
            result
        );

    }


    return result;

}


/* =========================================================
   RENDER ZÓN
========================================================= */

async function renderZones(
    force = false
) {

    const level =
        getLevel(
            currentZoom
        );


    const levelKey =
        Object.keys(
            LEVELS
        ).find(
            key =>
                LEVELS[key] === level
        );


    /*
       Pokud jsme stále
       ve stejné úrovni
       a jen se hýbeme,
       nemusíme mapu znovu
       načítat.
    */

    if (
        !force &&
        currentLevelKey ===
        levelKey
    ) {

        return;

    }


    currentLevelKey =
        levelKey;


    const requestId =
        ++zoneRequestId;


    showLoading(
        `Načítám ${level.name.toLowerCase()}...`
    );


    try {

        const data =
            await fetchRuian(
                level.id,
                levelKey,
                true
            );


        if (
            requestId !==
            zoneRequestId
        ) {

            return;

        }


        if (zoneLayer) {

            map.removeLayer(
                zoneLayer
            );

            zoneLayer =
                null;

        }


        zoneLayer =
            L.geoJSON(
                data,
                {

                    style:
                        function(feature) {

                            return {

                                color:
                                    "#ffffff",

                                weight:
                                    currentZoom > 12.5
                                        ? 0.5
                                        : 1,

                                opacity:
                                    0.8,

                                fillColor:
                                    getPolygonColor(
                                        feature
                                    ),

                                fillOpacity:
                                    currentZoom > 12.5
                                        ? 0.52
                                        : 0.62

                            };

                        },


                    onEachFeature:
                        function(
                            feature,
                            layer
                        ) {

                            const name =
                                featureName(
                                    feature
                                );


                            layer.bindTooltip(
                                name,
                                {
                                    sticky:
                                        true
                                }
                            );


                            layer.on(
                                "mouseover",
                                function() {

                                    layer.setStyle({

                                        weight: 2,

                                        color:
                                            "#111827",

                                        fillOpacity:
                                            0.78

                                    });

                                }
                            );


                            layer.on(
                                "mouseout",
                                function() {

                                    zoneLayer
                                        .resetStyle(
                                            layer
                                        );

                                }
                            );


                            layer.on(
                                "click",
                                function() {

                                    openFeatureDetail(
                                        feature,
                                        level.name
                                    );

                                }
                            );

                        }

                }
            );


        zoneLayer.addTo(
            map
        );


        hideLoading();
        hideError();


    } catch (error) {

        if (
            error.name ===
            "AbortError"
        ) {

            return;

        }


        console.error(
            error
        );


        hideLoading();


        showError(
            "Mapová data se nepodařilo načíst. Zkus chvíli počkat nebo změnit zoom."
        );

    }

}


/* =========================================================
   DEBOUNCE MAPY
========================================================= */

function scheduleMapUpdate() {

    clearTimeout(
        renderTimer
    );


    renderTimer =
        setTimeout(
            function() {

                currentZoom =
                    map.getZoom();


                renderZones();


                /*
                   POI aktualizujeme
                   zvlášť.
                */

                schedulePoiUpdate();

            },
            350
        );

}


/* =========================================================
   DETAIL
========================================================= */

function getLayerTitle(
    layer
) {

    const titles = {

        price:
            "Průměrná nabídková cena",

        rent:
            "Nájem za 1 m² / měsíc",

        green:
            "Podíl zeleně",

        noise:
            "Index hluku",

        safety:
            "Index bezpečnosti",

        air:
            "Index kvality ovzduší"

    };


    return (
        titles[layer] ||
        "Hodnota"
    );

}


function formatMetric(
    value,
    layer
) {

    if (
        layer ===
        "price"
    ) {

        return (
            formatNumber(
                Math.round(value)
            ) +
            " Kč/m²"
        );

    }


    if (
        layer ===
        "rent"
    ) {

        return (
            formatNumber(
                Math.round(value)
            ) +
            " Kč/m²/měsíc"
        );

    }


    if (
        layer ===
        "green"
    ) {

        return (
            Math.round(value) +
            " %"
        );

    }


    return (
        Math.round(value) +
        " / 100"
    );

}


function openFeatureDetail(
    feature,
    levelName
) {

    selectedFeature =
        feature;


    const name =
        featureName(
            feature
        );


    document
        .getElementById(
            "detailLevel"
        )
        .textContent =
            levelName.toUpperCase();


    document
        .getElementById(
            "detailName"
        )
        .textContent =
            name;


    const metric =
        getMetric(
            feature,
            activeLayer
        );


    let html = `

        <div class="hero-metric">

            <span>
                ${getLayerTitle(
                    activeLayer
                )}
            </span>

            <strong>
                ${formatMetric(
                    metric.value,
                    activeLayer
                )}
            </strong>

            <small>
                ${metric.label}
            </small>

        </div>

    `;


    if (
        !metric.real
    ) {

        html += `

            <div class="data-warning">

                <strong>
                    DEMO DATA.
                </strong>

                Tato hodnota slouží
                pouze pro vizualizaci
                mapového systému.

                Nejde o oficiální
                statistiku daného území.

            </div>

        `;

    }


    html += `

        <div class="score-grid">

            <div class="score">

                <span>
                    Zeleň
                </span>

                <strong>
                    ${Math.round(
                        getMetric(
                            feature,
                            "green"
                        ).value
                    )} %
                </strong>

            </div>


            <div class="score">

                <span>
                    Hluk
                </span>

                <strong>
                    ${Math.round(
                        getMetric(
                            feature,
                            "noise"
                        ).value
                    )}/100
                </strong>

            </div>


            <div class="score">

                <span>
                    Bezpečnost
                </span>

                <strong>
                    ${Math.round(
                        getMetric(
                            feature,
                            "safety"
                        ).value
                    )}/100
                </strong>

            </div>


            <div class="score">

                <span>
                    Ovzduší
                </span>

                <strong>
                    ${Math.round(
                        getMetric(
                            feature,
                            "air"
                        ).value
                    )}/100
                </strong>

            </div>

        </div>


        <div class="detail-section">

            <h3>
                Územní úroveň
            </h3>

            <p>
                ${levelName}
            </p>

        </div>


        <div class="detail-section">

            <h3>
                Data
            </h3>

            <p>
                Hranice území jsou
                poskytovány prostřednictvím
                RÚIAN od ČÚZK.
            </p>

        </div>


        <div class="source">

            Hranice:
            ČÚZK / RÚIAN

            <br>

            Ceny a nájmy:
            RealityMIX 09/2026

            <br>

            Body zájmu:
            OpenStreetMap / Overpass

        </div>

    `;


    document
        .getElementById(
            "detailContent"
        )
        .innerHTML =
            html;


    document
        .getElementById(
            "detailPanel"
        )
        .classList.remove(
            "hidden"
        );

}


/* =========================================================
   POI SYSTÉM
========================================================= */

const POI_CONFIG = {

    schools: {

        name:
            "Školy",

        color:
            "#2563eb",

        query:
            `node["amenity"="school"];way["amenity"="school"];relation["amenity"="school"];`

    },


    hospitals: {

        name:
            "Nemocnice",

        color:
            "#dc2626",

        query:
            `node["amenity"="hospital"];way["amenity"="hospital"];relation["amenity"="hospital"];`

    },


    police: {

        name:
            "Policie",

        color:
            "#111827",

        query:
            `node["amenity"="police"];way["amenity"="police"];relation["amenity"="police"];`

    },


    fire: {

        name:
            "Hasiči",

        color:
            "#ea580c",

        query:
            `node["amenity"="fire_station"];way["amenity"="fire_station"];relation["amenity"="fire_station"];`

    },


    pharmacy: {

        name:
            "Lékárny",

        color:
            "#15803d",

        query:
            `node["amenity"="pharmacy"];way["amenity"="pharmacy"];relation["amenity"="pharmacy"];`

    },


    post: {

        name:
            "Pošty",

        color:
            "#7c3aed",

        query:
            `node["amenity"="post_office"];way["amenity"="post_office"];relation["amenity"="post_office"];`

    },


    courthouse: {

        name:
            "Soudy",

        color:
            "#111827",

        query:
            `node["amenity"="courthouse"];way["amenity"="courthouse"];relation["amenity"="courthouse"];`

    },


    university: {

        name:
            "Univerzity",

        color:
            "#6d28d9",

        query:
            `node["amenity"="university"];way["amenity"="university"];relation["amenity"="university"];`

    },


    kindergarten: {

        name:
            "Mateřské školy",

        color:
            "#a16207",

        query:
            `node["amenity"="kindergarten"];way["amenity"="kindergarten"];relation["amenity"="kindergarten"];`

    },


    railway: {

        name:
            "Nádraží",

        color:
            "#455a64",

        query:
            `node["railway"="station"];way["railway"="station"];relation["railway"="station"];`

    },


    bus: {

        name:
            "Autobusová nádraží",

        color:
            "#087f8c",

        query:
            `node["amenity"="bus_station"];way["amenity"="bus_station"];relation["amenity"="bus_station"];`

    },


    fuel: {

        name:
            "Čerpací stanice",

        color:
            "#ea580c",

        query:
            `node["amenity"="fuel"];way["amenity"="fuel"];relation["amenity"="fuel"];`

    },


    parking: {

        name:
            "Parkoviště",

        color:
            "#2563eb",

        query:
            `node["amenity"="parking"];way["amenity"="parking"];relation["amenity"="parking"];`

    },


    supermarket: {

        name:
            "Supermarkety",

        color:
            "#15803d",

        query:
            `node["shop"="supermarket"];way["shop"="supermarket"];relation["shop"="supermarket"];`

    }

};


/* =========================================================
   POI ZOOM
========================================================= */

function canLoadPois() {

    return (
        map.getZoom() >= 9
    );

}


/* =========================================================
   POI BBOX KEY
========================================================= */

function getPoiCacheKey() {

    const bounds =
        map.getBounds();


    /*
       Zaokrouhlení znamená,
       že malý pohyb myší
       nevytvoří nový request.
    */

    const south =
        Math.round(
            bounds.getSouth() * 20
        ) / 20;

    const west =
        Math.round(
            bounds.getWest() * 20
        ) / 20;

    const north =
        Math.round(
            bounds.getNorth() * 20
        ) / 20;

    const east =
        Math.round(
            bounds.getEast() * 20
        ) / 20;


    return [
        south,
        west,
        north,
        east
    ].join("_");

}


/* =========================================================
   VYTVÁŘENÍ POI IKONY
========================================================= */

function createPoiMarker(
    lat,
    lng,
    name,
    config,
    tags
) {

    const marker =
        L.circleMarker(
            [lat,lng],
            {

                radius:
                    5.5,

                color:
                    "#ffffff",

                weight:
                    1.5,

                fillColor:
                    config.color,

                fillOpacity:
                    .92

            }
        );


    marker.bindTooltip(
        name,
        {
            sticky:
                true
        }
    );


    marker.on(
        "click",
        function() {

            openPoiDetail(
                name,
                config.name,
                tags
            );

        }
    );


    return marker;

}


/* =========================================================
   POI DETAIL
========================================================= */

function openPoiDetail(
    name,
    type,
    tags
) {

    document
        .getElementById(
            "detailLevel"
        )
        .textContent =
            type.toUpperCase();


    document
        .getElementById(
            "detailName"
        )
        .textContent =
            name;


    const address =
        tags &&
        (
            tags["addr:street"] ||
            tags["addr:city"] ||
            tags["addr:postcode"]
        )
            ? [
                tags["addr:street"],
                tags["addr:housenumber"],
                tags["addr:postcode"],
                tags["addr:city"]
            ]
            .filter(Boolean)
            .join(" ")
            : "Adresa není v datech uvedena";


    document
        .getElementById(
            "detailContent"
        )
        .innerHTML = `

            <div class="hero-metric">

                <span>
                    Typ služby
                </span>

                <strong>
                    ${type}
                </strong>

                <small>
                    OpenStreetMap
                </small>

            </div>


            <div class="detail-section">

                <h3>
                    Adresa
                </h3>

                <p>
                    ${address}
                </p>

            </div>


            <div class="source">

                Zdroj:
                OpenStreetMap /
                Overpass API

            </div>

        `;


    document
        .getElementById(
            "detailPanel"
        )
        .classList.remove(
            "hidden"
        );

}


/* =========================================================
   LOAD POI
========================================================= */

async function loadPoiType(
    type
) {

    if (
        !poiEnabled[type]
    ) {

        return;

    }


    if (
        !canLoadPois()
    ) {

        return;

    }


    const config =
        POI_CONFIG[type];


    const cacheKey =
        type +
        "|" +
        getPoiCacheKey();


    if (
        poiCache.has(
            cacheKey
        )
    ) {

        drawPoiData(
            type,
            poiCache.get(
                cacheKey
            )
        );

        return;

    }


    if (
        poiAbortController
    ) {

        poiAbortController.abort();

    }


    poiAbortController =
        new AbortController();


    const bounds =
        map.getBounds();


    const south =
        bounds.getSouth();

    const west =
        bounds.getWest();

    const north =
        bounds.getNorth();

    const east =
        bounds.getEast();


    /*
       Jeden typ POI = jeden
       menší Overpass request.
    */

    const query = `

        [out:json][timeout:15];

        (
            ${config.query}
        )

        (${south},${west},${north},${east});

        out center tags;

    `;


    try {

        const response =
            await fetch(
                OVERPASS +
                "?data=" +
                encodeURIComponent(
                    query
                ),
                {
                    signal:
                        poiAbortController.signal
                }
            );


        if (!response.ok) {

            throw new Error(
                "POI API není dostupné."
            );

        }


        const data =
            await response.json();


        poiCache.set(
            cacheKey,
            data.elements || []
        );


        drawPoiData(
            type,
            data.elements || []
        );


    } catch (error) {

        if (
            error.name ===
            "AbortError"
        ) {

            return;

        }

        console.error(
            error
        );

    }

}


/* =========================================================
   DRAW POI
========================================================= */

function drawPoiData(
    type,
    elements
) {

    const config =
        POI_CONFIG[type];


    if (
        !poiLayers[type]
    ) {

        poiLayers[type] =
            L.layerGroup();

    }


    poiLayers[type].clearLayers();


    /*
       Ochrana proti příliš
       velkému počtu markerů.
    */

    const max =
        map.getZoom() >= 12
            ? 1200
            : 500;


    elements
        .slice(0,max)
        .forEach(
            function(element) {

                let lat;
                let lng;


                if (
                    element.lat &&
                    element.lon
                ) {

                    lat =
                        element.lat;

                    lng =
                        element.lon;

                } else if (
                    element.center
                ) {

                    lat =
                        element.center.lat;

                    lng =
                        element.center.lon;

                } else {

                    return;

                }


                const tags =
                    element.tags ||
                    {};


                const name =
                    tags.name ||
                    config.name;


                const marker =
                    createPoiMarker(
                        lat,
                        lng,
                        name,
                        config,
                        tags
                    );


                marker.addTo(
                    poiLayers[type]
                );

            }
        );


    /*
       Pokud je checkbox
       zapnutý, vrstva je
       skutečně na mapě.
    */

    if (
        poiEnabled[type]
    ) {

        if (
            !map.hasLayer(
                poiLayers[type]
            )
        ) {

            poiLayers[type]
                .addTo(map);

        }

    }

}


/* =========================================================
   POI UPDATE
========================================================= */

function updateAllPois() {

    if (
        !canLoadPois()
    ) {

        /*
           Při oddálení
           všechny POI odstraníme.
        */

        Object.keys(
            poiLayers
        ).forEach(
            function(type) {

                if (
                    poiLayers[type] &&
                    map.hasLayer(
                        poiLayers[type]
                    )
                ) {

                    map.removeLayer(
                        poiLayers[type]
                    );

                }

            }
        );

        return;

    }


    Object.keys(
        POI_CONFIG
    ).forEach(
        function(type) {

            if (
                poiEnabled[type]
            ) {

                loadPoiType(
                    type
                );

            }

        }
    );

}


/* =========================================================
   DEBOUNCE POI
========================================================= */

function schedulePoiUpdate() {

    clearTimeout(
        poiTimer
    );


    poiTimer =
        setTimeout(
            function() {

                updateAllPois();

            },
            500
        );

}


/* =========================================================
   POI CHECKBOX
========================================================= */

function initializePoiControls() {

    Object.keys(
        POI_CONFIG
    ).forEach(
        function(type) {

            const checkbox =
                document.getElementById(
                    "poi-" + type
                );


            if (!checkbox) {
                return;
            }


            poiEnabled[type] =
                false;


            checkbox.addEventListener(
                "change",
                function(event) {

                    const enabled =
                        event.target.checked;


                    poiEnabled[type] =
                        enabled;


                    /*
                       TADY JE OPRAVA
                       PROTI PŮVODNÍMU BUGU.
                    */

                    if (!enabled) {

                        if (
                            poiLayers[type] &&
                            map.hasLayer(
                                poiLayers[type]
                            )
                        ) {

                            map.removeLayer(
                                poiLayers[type]
                            );

                        }

                        return;

                    }


                    if (
                        !canLoadPois()
                    ) {

                        showError(
                            "Pro zobrazení služeb přibliž mapu alespoň na úroveň města."
                        );

                        event.target.checked =
                            false;

                        poiEnabled[type] =
                            false;

                        return;

                    }


                    loadPoiType(
                        type
                    );

                }
            );

        }
    );

}


/* =========================================================
   SEARCH
========================================================= */

function searchLocal(
    text
) {

    const value =
        text
            .trim()
            .toLowerCase();


    if (!value) {
        return [];
    }


    return CAPITALS
        .filter(
            function(item) {

                return (
                    item.name
                        .toLowerCase()
                        .includes(value) ||

                    item.region
                        .toLowerCase()
                        .includes(value)
                );

            }
        )
        .slice(0,7);

}


function renderSearchResults(
    results
) {

    const container =
        document.getElementById(
            "searchResults"
        );


    if (
        !results.length
    ) {

        container.style.display =
            "none";

        return;

    }


    container.innerHTML =
        results
            .map(
                function(item) {

                    return `

                        <div
                            class="search-result"
                            data-city="${item.name}"
                        >

                            <strong>
                                ${item.name}
                            </strong>

                            <span>
                                ${item.region}
                            </span>

                        </div>

                    `;

                }
            )
            .join("");


    container.style.display =
        "block";


    container
        .querySelectorAll(
            ".search-result"
        )
        .forEach(
            function(element) {

                element.addEventListener(
                    "mousedown",
                    function() {

                        const name =
                            element.dataset.city;


                        const city =
                            CAPITALS.find(
                                function(item) {

                                    return (
                                        item.name ===
                                        name
                                    );

                                }
                            );


                        if (city) {

                            selectCapital(
                                city
                            );

                        }

                    }
                );

            }
        );

}


async function searchNominatim(
    query
) {

    showLoading(
        "Hledám místo..."
    );


    try {

        const params =
            new URLSearchParams({

                q:
                    query +
                    ", Česko",

                format:
                    "jsonv2",

                countrycodes:
                    "cz",

                limit:
                    "1",

                "accept-language":
                    "cs"

            });


        const response =
            await fetch(
                NOMINATIM +
                "?" +
                params.toString()
            );


        const data =
            await response.json();


        if (
            !data.length
        ) {

            throw new Error(
                "Místo nebylo nalezeno."
            );

        }


        const result =
            data[0];


        map.flyTo(
            [
                Number(result.lat),
                Number(result.lon)
            ],
            14,
            {
                duration:
                    1
            }
        );


        document
            .getElementById(
                "detailLevel"
            )
            .textContent =
                "VYHLEDANÉ MÍSTO";


        document
            .getElementById(
                "detailName"
            )
            .textContent =
                result.display_name;


        document
            .getElementById(
                "detailContent"
            )
            .innerHTML = `

                <div class="hero-metric">

                    <span>
                        Vyhledávání
                    </span>

                    <strong>
                        Nalezeno
                    </strong>

                    <small>
                        OpenStreetMap / Nominatim
                    </small>

                </div>

            `;


        document
            .getElementById(
                "detailPanel"
            )
            .classList.remove(
                "hidden"
            );


        hideLoading();


    } catch (error) {

        hideLoading();

        showError(
            error.message
        );

    }

}


function selectCapital(
    capital
) {

    document
        .getElementById(
            "searchInput"
        )
        .value =
            capital.name;


    document
        .getElementById(
            "searchResults"
        )
        .style.display =
            "none";


    map.flyTo(
        [
            capital.lat,
            capital.lng
        ],
        11.5,
        {
            duration:
                1
        }
    );


    openFeatureDetail(
        {
            properties: {
                nazev:
                    capital.name
            }
        },
        "Krajské město"
    );

}


/* =========================================================
   KRAJE
========================================================= */

const REGION_CENTERS = {

    all:
        [49.7437,15.3386],

    praha:
        [50.0755,14.4378],

    stredocesky:
        [50.0755,14.4378],

    jihocesky:
        [48.9745,14.4743],

    plzensky:
        [49.7384,13.3736],

    karlovarsky:
        [50.2319,12.8714],

    ustecky:
        [50.6607,14.0323],

    liberecky:
        [50.7671,15.0562],

    kralovehradecky:
        [50.2092,15.8328],

    pardubicky:
        [50.0343,15.7812],

    vysocina:
        [49.3961,15.5912],

    jihomoravsky:
        [49.1951,16.6068],

    olomoucky:
        [49.5938,17.2509],

    zlinsky:
        [49.2265,17.668],

    moravskoslezsky:
        [49.8209,18.2625]

};


function selectRegion(
    value
) {

    const center =
        REGION_CENTERS[value];


    if (!center) {
        return;
    }


    if (
        value ===
        "all"
    ) {

        map.flyTo(
            center,
            7.5,
            {
                duration:
                    1
            }
        );

        return;

    }


    map.flyTo(
        center,
        9.5,
        {
            duration:
                1
        }
    );

}


/* =========================================================
   EVENTY
========================================================= */

function initializeEvents() {


    /* -------------------------
       MAP LAYERS
    ------------------------- */

    document
        .querySelectorAll(
            ".layer-row"
        )
        .forEach(
            function(row) {

                row.addEventListener(
                    "click",
                    function() {

                        const layer =
                            row.dataset.layer;


                        activeLayer =
                            layer;


                        document
                            .querySelectorAll(
                                ".layer-row"
                            )
                            .forEach(
                                function(item) {

                                    item.classList.remove(
                                        "active"
                                    );

                                }
                            );


                        row.classList.add(
                            "active"
                        );


                        const radio =
                            row.querySelector(
                                "input"
                            );


                        if (radio) {

                            radio.checked =
                                true;

                        }


                        updateLegend();


                        /*
                           Pokud se mění pouze
                           barevná analytická vrstva,
                           nemusíme znovu stahovat
                           data z API.
                        */

                        if (
                            zoneLayer
                        ) {

                            zoneLayer
                                .setStyle(
                                    function(feature) {

                                        return {

                                            fillColor:
                                                getPolygonColor(
                                                    feature
                                                )

                                        };

                                    }
                                );

                        }

                    }
                );

            }
        );


    /* -------------------------
       ZOOM
    ------------------------- */

    map.on(
        "zoomend",
        function() {

            currentZoom =
                map.getZoom();

            scheduleMapUpdate();

        }
    );


    /* -------------------------
       MOVE
    ------------------------- */

    map.on(
        "moveend",
        function() {

            schedulePoiUpdate();

        }
    );


    /* -------------------------
       CLOSE DETAIL
    ------------------------- */

    document
        .getElementById(
            "closeDetail"
        )
        .addEventListener(
            "click",
            function() {

                document
                    .getElementById(
                        "detailPanel"
                    )
                    .classList.add(
                        "hidden"
                    );

            }
        );


    /* -------------------------
       ERROR
    ------------------------- */

    document
        .getElementById(
            "errorBox"
        )
        .addEventListener(
            "click",
            hideError
        );


    /* -------------------------
       REGION
    ------------------------- */

    document
        .getElementById(
            "regionSelect"
        )
        .addEventListener(
            "change",
            function(event) {

                selectRegion(
                    event.target.value
                );

            }
        );


    /* -------------------------
       SEARCH
    ------------------------- */

    const searchInput =
        document.getElementById(
            "searchInput"
        );


    searchInput.addEventListener(
        "input",
        function(event) {

            renderSearchResults(
                searchLocal(
                    event.target.value
                )
            );

        }
    );


    document
        .getElementById(
            "searchForm"
        )
        .addEventListener(
            "submit",
            async function(event) {

                event.preventDefault();


                const value =
                    searchInput
                        .value
                        .trim();


                if (!value) {
                    return;
                }


                const capital =
                    CAPITALS.find(
                        function(item) {

                            return (
                                item.name
                                    .toLowerCase() ===
                                value.toLowerCase()
                            );

                        }
                    );


                if (capital) {

                    selectCapital(
                        capital
                    );

                    return;

                }


                await searchNominatim(
                    value
                );

            }
        );


    /* -------------------------
       OUTSIDE SEARCH
    ------------------------- */

    document.addEventListener(
        "click",
        function(event) {

            if (
                !event.target.closest(
                    ".search"
                )
            ) {

                document
                    .getElementById(
                        "searchResults"
                    )
                    .style.display =
                        "none";

            }

        }
    );


    /* -------------------------
       OVERVIEW
    ------------------------- */

    document
        .getElementById(
            "overviewButton"
        )
        .addEventListener(
            "click",
            function() {

                document
                    .getElementById(
                        "detailLevel"
                    )
                    .textContent =
                        "PŘEHLED ČR";


                document
                    .getElementById(
                        "detailName"
                    )
                    .textContent =
                        "Mapa bydlení ČR";


                document
                    .getElementById(
                        "detailContent"
                    )
                    .innerHTML = `

                        <div class="hero-metric">

                            <span>
                                Systém
                            </span>

                            <strong>
                                Celá Česká republika
                            </strong>

                            <small>
                                kraje · okresy · obce · katastry
                            </small>

                        </div>


                        <div class="detail-section">

                            <h3>
                                Dostupné vrstvy
                            </h3>

                            <p>
                                Ceny, nájmy,
                                zeleň, hluk,
                                bezpečnost a
                                ovzduší.
                            </p>

                        </div>


                        <div class="detail-section">

                            <h3>
                                Služby
                            </h3>

                            <p>
                                Školy, nemocnice,
                                policie, hasiči,
                                lékárny, pošty,
                                soudy, univerzity,
                                školky, nádraží,
                                parkoviště a další.
                            </p>

                        </div>

                    `;


                document
                    .getElementById(
                        "detailPanel"
                    )
                    .classList.remove(
                        "hidden"
                    );

            }
        );

}


/* =========================================================
   MAP INIT
========================================================= */

function initializeMap() {

    if (
        typeof L ===
        "undefined"
    ) {

        showError(
            "Leaflet se nepodařilo načíst. Zkontroluj internetové připojení."
        );

        return;

    }


    map =
        L.map(
            "map",
            {

                center:
                    [49.7437,15.3386],

                zoom:
                    7.5,

                minZoom:
                    6,

                maxZoom:
                    17,

                zoomControl:
                    false,

                preferCanvas:
                    true

            }
        );


    L.control
        .zoom(
            {
                position:
                    "bottomright"
            }
        )
        .addTo(map);


    L.tileLayer(
        OSM,
        {

            maxZoom:
                19,

            attribution:
                "&copy; OpenStreetMap contributors"

        }
    )
    .addTo(map);


    currentZoom =
        map.getZoom();


    /*
       První render.
    */

    renderZones(
        true
    );

}


/* =========================================================
   START
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function() {

        updateLegend();

        initializeMap();

        initializePoiControls();

        initializeEvents();

    }
);
