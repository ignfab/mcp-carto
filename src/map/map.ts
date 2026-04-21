import { isEmpty } from "ol/extent.js";
import GeoJSON from "ol/format/GeoJSON.js";
import Map from "ol/Map.js";
import View from "ol/View.js";

import VectorLayer from "ol/layer/Vector.js";
import { fromLonLat } from "ol/proj.js";
import VectorSource from "ol/source/Vector.js";

import Geoportail from "ol-ext/layer/Geoportail.js";
import LayerSwitcher from "ol-ext/control/LayerShop.js";
import InputSlider from "ol-ext/util/input/Slider.js";
import Colorize from "ol-ext/filter/CanvasFilter.js";
import Select from "ol/interaction/Select.js";
import Popup from "ol-ext/overlay/PopupFeature.js";
import Dialog from "ol-ext/control/Dialog.js";
import Hover from "ol-ext/interaction/Hover.js";
import { click } from "ol/events/condition.js";
import getStyle from "./style.ts";
import showDebug from "./debug.ts";
import FileSaver from "file-saver";

import "ol/ol.css";
import "ol-ext/dist/ol-ext.css";
import "./map.css"

type BackgroundMode = "plan_ign_v2" | "orthophotos";

let map: Map | null = null;
const dataLayers: Record<string, VectorLayer<VectorSource>> = {};
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
  // Hover interaction to show pointer cursor on hover and potential for future hover info
  const hover = new Hover({ 
    cursor: 'pointer'
  });
  map.addInteraction(hover);
  // Layerswitcher
  const switcher = new LayerSwitcher({
    minibar: true,
    counter: true,
    selection: false,
  });
  // Opacity slider
  const opacity = new InputSlider({
    className: 'opacity',
    align: 'right',
    type: 'number',
    min: 0,
    max: 100,
    parent: switcher.getBarElement()
  });
  opacity.getInputElement().setAttribute('aria-label', 'Opacité de la couche');
  opacity.getInputElement().setAttribute('title', 'Opacité de la couche');
  opacity.on('change:value', function(e: any) {
    switcher.getSelection().setOpacity(e.value/100);
  })
  switcher.on(['layer:opacity', 'select'], function(e: any) {
    if (e.layer === switcher.getSelection()) {
      opacity.setValue(Math.round(e.layer.getOpacity()*100));
    }
  });
  map.addControl(switcher);
  // Download button for vector layers
  switcher.on("drawlist", (e:any) => {
    const layer = e.layer;
    if (layer instanceof VectorLayer) {
      const btn = document.createElement("button");
      btn.textContent = "⬇️";
      btn.title = "Télécharger les données";
      btn.addEventListener("click", () => {
        const source = layer.getSource();
        if (!source || !source.getFeatures) return;
        const features = source.getFeatures();
        if (features.length === 0) return;
        const geoJson = new GeoJSON().writeFeatures(features, {
          featureProjection: "EPSG:3857",
        });
        const blob = new Blob([geoJson], { type: "application/json" });
        FileSaver.saveAs(blob, (layer.get('title') || 'data') + ".geojson");
      });
      e.li.querySelector(".ol-layerswitcher-buttons")?.appendChild(btn);
    }
  });
  // Popup for feature info
  const select = new Select({ 
    condition: click,
    style: (feature, resolution) => getStyle(feature, resolution, true),
  });
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

/** Get or create a layer by title
 * If not created yet, create it and add to the map
 * @param m OpenLayers Map instance
 * @param layerTitle Title of the layer
 * @param color Color to use for the layer (default: red)
 * @return the VectorLayer for displaying GeoJSON data
 */
function getLayerByTitle(m: Map, layerTitle: string, color: string = "#f00"): VectorLayer<VectorSource> {
  const existing = dataLayers[layerTitle];
  if (existing) return existing;

  const newLayer = new VectorLayer({
    source: new VectorSource(),
    style: getStyle,
  });
  newLayer.getSource()?.on("addfeature", (e:any) => {
    e.feature._layer = newLayer;
  });
  newLayer.set("title", layerTitle);
  newLayer.set("color", color);
  dataLayers[layerTitle] = newLayer;
  m.addLayer(newLayer);
  return newLayer;
}

/** Clear all data layers */
function clearAllDataLayers() {
  const m = getMap();
  Object.entries(dataLayers).forEach(([, layer]) => {
    if (layer) {
      layer.getSource()?.clear(true);
      m.removeLayer(layer);
    }
  });
  Object.keys(dataLayers).forEach((key) => {
    delete dataLayers[key];
  });
}

/** Load GeoJSON from URL and display on the map, then fit view to data extent
 * @param m OpenLayers Map instance
 * @param dataUrl URL to the GeoJSON file
 * @param targetLayer optional target VectorLayer to load data into
 * @returns true if data loaded and displayed, false if no features or invalid extent
 */
async function loadGeoJsonFromUrl(m: Map, dataUrl: string, targetLayer?: VectorLayer<VectorSource>): Promise<boolean> {
  dataUrl = dataUrl.replace(/\bcql_filter=/gi, 'cql_filter=');
  const queryParams = new URLSearchParams(dataUrl.split('?')[1]);
  const cqlFilter = queryParams.get('cql_filter');
  let response: Response;
  dialog.show("Chargement en cours"); 
  if (cqlFilter) {
    // Use POST request with cql_filter in body to avoid too-long GET URLs (issue #57)
    queryParams.delete('cql_filter');
    const baseUrl = dataUrl.split('?')[0] + '?' + queryParams.toString();
    const body = 'cql_filter=' + encodeURIComponent(cqlFilter);
    // showDebug(`Chargement GeoJSON avec cql_filter (longueur ${cqlFilter.length})...`);
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
    showDebug(`Echec chargement GeoJSON (${response.status})`);
    throw new Error(`Echec chargement GeoJSON (${response.status})`);
  }

  const geoJson = await response.json();
  const layer = targetLayer || getLayerByTitle(m, "Données GeoJSON");
  const source = layer.getSource();
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
 * @param background background map type
 * @param layers optional array of layers with title, color and data_url to load and display on the map
 * @param title optional title to display in the header
 * @param description optional description to display below the header
 */
async function applyView(
  lon: number,
  lat: number,
  zoom: number,
  background: BackgroundMode = "plan_ign_v2",
  layers?: Array<{ title: string; color: string, data_url: string }>,
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

  if (!layers || layers.length === 0) {
    clearAllDataLayers();
    coordsLabel.textContent = `lon ${lon.toFixed(5)} · lat ${lat.toFixed(5)} · zoom ${z}`;
    m.updateSize();
    return;
  }

  try {
    let hasData = false;
    clearAllDataLayers();

    for (const layer of layers) {
      const targetLayer = getLayerByTitle(m, layer.title, layer.color);
      const loaded = await loadGeoJsonFromUrl(m, layer.data_url, targetLayer);
      hasData = hasData || loaded;
    }

    setDataVisualState(background, hasData, m);
    coordsLabel.textContent = hasData
      ? `lon ${lon.toFixed(5)} · lat ${lat.toFixed(5)} · ${layers.length} couche(s) chargée(s)`
      : `lon ${lon.toFixed(5)} · lat ${lat.toFixed(5)} · couche(s) vide(s)`;
  } catch (error) {
    console.error("Erreur chargement GeoJSON", error);
    clearAllDataLayers();
    coordsLabel.textContent = `lon ${lon.toFixed(5)} · lat ${lat.toFixed(5)} · zoom ${z} · echec GeoJSON`;
  }

  m.updateSize();
}


export default map;
export { applyView, getMap };