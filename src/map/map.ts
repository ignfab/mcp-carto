import { getTopLeft, getWidth, isEmpty } from "ol/extent.js";
import GeoJSON from "ol/format/GeoJSON.js";
import Map from "ol/Map.js";
import View from "ol/View.js";

import VectorLayer from "ol/layer/Vector.js";
import { fromLonLat, get as getProjection } from "ol/proj.js";
import VectorSource from "ol/source/Vector.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import Geoportail from "ol-ext/layer/Geoportail.js";
import LayerSwitcher from "ol-ext/control/LayerSwitcher.js";
import Colorize from "ol-ext/filter/Colorize.js";
import Select from "ol/interaction/Select.js";
import Popup from "ol-ext/overlay/PopupFeature.js";
import { click } from "ol/events/condition.js";

import FileSaver from "file-saver";

import "ol/ol.css";
import "ol-ext/dist/ol-ext.css";
import "./map.css"


let map: Map | null = null;
let dataLayer: VectorLayer<VectorSource> | null = null;
const layer = new Geoportail({ layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2' });

function getMap(): Map {
  if (map) return map;

  map = new Map({
    target: "map",
    layers: [ layer ],
    view: new View({
      center: fromLonLat([2.3522, 48.8566]),
      zoom: 12,
      maxZoom: 19,
      minZoom: 0,
    }),
  });
  // Layerswitcher
  const switcher = new LayerSwitcher();
  // Add buttons in switcher
  switcher.on("drawlist", (e:any) => {
    const layer = e.layer;
    if (layer instanceof VectorLayer) {
      const btn = document.createElement("button");
      btn.textContent = "⬇️";
      btn.addEventListener("click", () => {
        const source = layer.getSource();
        if (!source || !source.getFeatures) return;
        const features = source.getFeatures();
        if (features.length === 0) return;
        const geoJson = new GeoJSON().writeFeatures(features, {
          featureProjection: "EPSG:3857",
        });
        const blob = new Blob([geoJson], { type: "application/json" });
        FileSaver.saveAs(blob, "data.geojson");
      });
      e.li.querySelector(".ol-layerswitcher-buttons")?.appendChild(btn);
    }
  });
  map.addControl(switcher);
  // Popup
  const select = new Select({ condition: click  });
  map.addInteraction(select);
  map.addInteraction(select);
  const popup = new Popup({
    popupClass: 'default anim',
    select: select,
    canFix: true,
  });
  map.addOverlay(popup);
  return map;
}

function ensureDataLayer(m: Map): VectorLayer<VectorSource> {
  if (dataLayer) return dataLayer;
  dataLayer = new VectorLayer({
    title: "Données GeoJSON",
    source: new VectorSource(),
    style: new Style({
      fill: new Fill({ color: "rgba(230, 57, 70, 0.22)" }),
      stroke: new Stroke({ color: "#e63946", width: 2 }),
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: "#e63946" }),
        stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
      }),
    }),
  });
  m.addLayer(dataLayer);
  return dataLayer;
}

function clearDataLayer() {
  dataLayer?.getSource()?.clear(true);
}

async function loadGeoJsonFromUrl(m: Map, dataUrl: string): Promise<boolean> {
  const response = await fetch(dataUrl, { mode: "cors" });
  if (!response.ok) {
    throw new Error(`Echec chargement GeoJSON (${response.status})`);
  }

  const geoJson = await response.json();
  const source = ensureDataLayer(m).getSource();
  if (!source) return false;

  source.clear(true);
  const features = new GeoJSON().readFeatures(geoJson, {
    featureProjection: "EPSG:3857",
  });
  source.addFeatures(features);

  if (features.length === 0) return false;
  const extent = source.getExtent();
  if (!extent || isEmpty(extent)) return false;

  m.getView().fit(extent, {
    maxZoom: 19,
    padding: [40, 40, 40, 40],
    duration: 250,
  });

  layer.addFilter(new Colorize('grayscale'));

  return true;
}


async function applyView(
  lon: number,
  lat: number,
  zoom: number,
  data_url?: string,
) {
  const coordsLabel = document.getElementById("coords-label")!;
  const z = Math.min(19, Math.max(0, zoom));
  const m = getMap();
  m.getView().setCenter(fromLonLat([lon, lat]));
  m.getView().setZoom(z);

  if (!data_url) {
    clearDataLayer();
    coordsLabel.textContent = `lon ${lon.toFixed(5)} · lat ${lat.toFixed(5)} · zoom ${z}`;
    m.updateSize();
    return;
  }

  try {
    const loaded = await loadGeoJsonFromUrl(m, data_url);
    coordsLabel.textContent = loaded
      ? `lon ${lon.toFixed(5)} · lat ${lat.toFixed(5)} · GeoJSON charge et recadre`
      : `lon ${lon.toFixed(5)} · lat ${lat.toFixed(5)} · GeoJSON vide`;
  } catch (error) {
    console.error("Erreur chargement GeoJSON", error);
    clearDataLayer();
    coordsLabel.textContent = `lon ${lon.toFixed(5)} · lat ${lat.toFixed(5)} · zoom ${z} · echec GeoJSON`;
  }

  m.updateSize();
}


export default map;
export { applyView, getMap };