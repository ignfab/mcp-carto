import { isEmpty } from "ol/extent.js";
import GeoJSON from "ol/format/GeoJSON.js";
import Map from "ol/Map.js";
import View from "ol/View.js";

import VectorLayer from "ol/layer/Vector.js";
import { fromLonLat } from "ol/proj.js";
import VectorSource from "ol/source/Vector.js";

import Geoportail from "ol-ext/layer/Geoportail.js";
import LayerSwitcher from "ol-ext/control/LayerSwitcher.js";
import Colorize from "ol-ext/filter/CanvasFilter.js";
import Select from "ol/interaction/Select.js";
import Popup from "ol-ext/overlay/PopupFeature.js";
import Button from "ol-ext/control/Button.js";
import Dialog from "ol-ext/control/Dialog.js";
import { click } from "ol/events/condition.js";

import getStyle from "./style.ts";
import showDebug from "./debug.ts";

import FileSaver from "file-saver";

import "ol/ol.css";
import "ol-ext/dist/ol-ext.css";
import "./map.css"

type BackgroundMode = "plan_ign_v2" | "orthophotos";

let map: Map | null = null;
let dataLayer: VectorLayer<VectorSource> | null = null;
const planIgnLayer = new Geoportail({ 
  layer: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2",
  baseLayer: true,
  visible: true,
});
planIgnLayer.set("title", "Plan IGN v2");

const dialog = new Dialog({
  closeBox: false,
});

const orthophotoLayer = new Geoportail({ 
  layer: "ORTHOIMAGERY.ORTHOPHOTOS",
  baseLayer: true,
  visible: false,
});
orthophotoLayer.set("title", "Photographies aeriennes");

const dataColorizeFilter = new Colorize({ grayscale: 100 } as any) as any;

function setBackground(background: BackgroundMode) {
  planIgnLayer.setVisible(background === "plan_ign_v2");
  orthophotoLayer.setVisible(background === "orthophotos");
}

function setDataVisualState(_background: BackgroundMode, hasData: boolean, m: Map) {
  (planIgnLayer as any).removeFilter?.(dataColorizeFilter);
  // (orthophotoLayer as any).removeFilter?.(dataColorizeFilter);
  if (hasData) {
    // (orthophotoLayer as any).addFilter?.(dataColorizeFilter);
    (planIgnLayer as any).addFilter?.(dataColorizeFilter);
    m.getTargetElement().dataset.hasData = "true";
    return;
  }
  delete m.getTargetElement().dataset.hasData;
}

function getBackgroundLabel(background: BackgroundMode): string {
  return background === "orthophotos" ? "Photographies aériennes" : "Plan IGN v2";
}

/** Get the current map
 * If not created yet, create it with the base layer and controls
 * @return the OpenLayers Map instance
 */
function getMap(): Map {
  if (map) return map;

  map = new Map({
    target: "map",
    layers: [planIgnLayer, orthophotoLayer],
    view: new View({
      center: fromLonLat([2.3522, 48.8566]),
      zoom: 12,
      maxZoom: 19,
      minZoom: 0,
    }),
  });
  map.addControl(dialog);
  // Layerswitcher
  const switcher = new LayerSwitcher();
  map.addControl(switcher);
  // Download button for vector layers
  const loaderBt = new Button({
    className: "ol-download",
    title: "Télécharger les données affichées",
    handleClick: () => {
      const source = getLayer(map as Map).getSource();
      if (!source || !source.getFeatures) return;
      const features = source.getFeatures();
      if (features.length === 0) return;
      const geoJson = new GeoJSON().writeFeatures(features, {
        featureProjection: "EPSG:3857",
      });
      const blob = new Blob([geoJson], { type: "application/json" });
      FileSaver.saveAs(blob, "data.geojson");
    }
  });
  map.addControl(loaderBt);
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

/** Get the layer
 * If not created yet, create it and add to the map
 * @param m OpenLayers Map instance
 * @return the VectorLayer for displaying GeoJSON data
 */
function getLayer(m: Map): VectorLayer<VectorSource> {
  if (dataLayer) return dataLayer;
  dataLayer = new VectorLayer({
    source: new VectorSource(),
    style: getStyle,
  });
  dataLayer.set("title", "Données GeoJSON");
  m.addLayer(dataLayer);
  return dataLayer;
}

/** Clear the data layer */
function clearDataLayer() {
  dataLayer?.getSource()?.clear(true);
}

/** Load GeoJSON from URL and display on the map, then fit view to data extent
 * @param m OpenLayers Map instance
 * @param dataUrl URL to the GeoJSON file
 * @returns true if data loaded and displayed, false if no features or invalid extent
 */
async function loadGeoJsonFromUrl(m: Map, dataUrl: string): Promise<boolean> {
  const queryParams = new URLSearchParams(dataUrl.split('?')[1]);
  const cqlFilter = queryParams.get('cql_filter');
  let response: Response;
  dialog.show("Chargement en cours");
  if (cqlFilter) {
    // Use POST request with cql_filter in body to avoid too-long GET URLs (issue #57)
    queryParams.delete('cql_filter');
    const baseUrl = dataUrl.split('?')[0] + '?' + queryParams.toString();
    const body = 'cql_filter=' + encodeURIComponent(cqlFilter);
    showDebug(`Chargement GeoJSON avec cql_filter (longueur ${cqlFilter.length})...`);
    response = await fetch(baseUrl, {
      mode: 'cors',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
  } else {
    response = await fetch(dataUrl, { mode: 'cors' });
  }
  dialog.close();
  if (!response.ok) {
    throw new Error(`Echec chargement GeoJSON (${response.status})`);
  }

  const geoJson = await response.json();
  const source = getLayer(m).getSource();
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

  return true;
}

/** New view
 * @param lon longitude
 * @param lat latitude
 * @param zoom zoom level 
 * @param data_url optional url to a GeoJSON file to load and display on the map
 * @param title optional title to display in the header
 * @param description optional description to display below the header
 */
async function applyView(
  lon: number,
  lat: number,
  zoom: number,
  background: BackgroundMode = "plan_ign_v2",
  data_url?: string,
  title?: string,
  description?: string,
) {
  const coordsLabel = document.getElementById("coords-label")!;
  const titleLabel = document.querySelector(".header h1") as HTMLElement | null;
  const descriptionLabel = document.getElementById("description-label");
  const z = Math.min(19, Math.max(0, zoom));
  const m = getMap();
  setBackground(background);
  m.getView().setCenter(fromLonLat([lon, lat]));
  m.getView().setZoom(z);

  if (titleLabel) {
    titleLabel.textContent = title || `Carte ${getBackgroundLabel(background)}`;
  }
  if (descriptionLabel) {
    descriptionLabel.textContent =
      description || `Affichage du fond ${getBackgroundLabel(background)}`;
  }

  if (!data_url) {
    clearDataLayer();
    coordsLabel.textContent = `lon ${lon.toFixed(5)} · lat ${lat.toFixed(5)} · zoom ${z}`;
    m.updateSize();
    return;
  }

  try {
    const loaded = await loadGeoJsonFromUrl(m, data_url);
    setDataVisualState(background, loaded, m);
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