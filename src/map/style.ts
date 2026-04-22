import Point from "ol/geom/Point.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import { asArray, asString } from "ol/color";

const colorCache: Record<string, Style> = {};

/* Style for features, 
  with caching based on color to optimize performance 
*/
function getFeatureStyle(color: string|Array<number>): Style {
  color = asArray(color);
  const colorKey = color.join(",");
  let style = colorCache[colorKey];
  if (!style) {
    const colorAlpha = [...color];
    colorAlpha[3] = 0.2;
    style = colorCache[colorKey] = new Style({
      fill: new Fill({ color: asString(colorAlpha) }),
      stroke: new Stroke({ color: asString(color), width: 2 }),
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: asString(color) }),
        stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
      }),
    });
  }
  return style
};

/* Style depends on feature geometry and resolution 
  to return points for large polygons and actual geometry for small ones
*/
function getStyle(feature: any, resolution: number, select=false): Style {
  const geomType = feature.getGeometry().getType();
  const color = asArray(feature._layer?.get('color') || "#e63946"); 
  const style = getFeatureStyle(color);
  // Show points for small features
  if (!/Point/.test(geomType)) {
    const extent = feature.getGeometry().getExtent();
    const size = Math.max(extent[2] - extent[0], extent[3] - extent[1]);
    if (resolution && size/resolution < 5) {
      const center = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
      style.setGeometry(new Point(center));
    } else {
      style.setGeometry(feature.getGeometry());
    }
  } else {
    style.setGeometry(feature.getGeometry());
  }
  // Selection
  if (select===true) {
    style.setZIndex(1);
    style.getImage()?.setScale(1.2);
    style.getStroke()?.setWidth(4);
  } else {
    style.setZIndex(0);
    style.getImage()?.setScale(1);
    style.getStroke()?.setWidth(1.5);
  }
  return style;
}

export { getFeatureStyle };
export default getStyle;