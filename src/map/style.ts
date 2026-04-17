import Point from "ol/geom/Point.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";

const featureStyle = new Style({
  fill: new Fill({ color: "rgba(230, 57, 70, 0.22)" }),
  stroke: new Stroke({ color: "#e63946", width: 2 }),
  image: new CircleStyle({
    radius: 5,
    fill: new Fill({ color: "#e63946" }),
    stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
  }),
});

/* Style depends on feature geometry and resolution 
  to return points for large polygons and actual geometry for small ones
*/
function getStyle(feature: any, resolution: number): Style {
  const geomType = feature.getGeometry().getType();
  if (!/Point/.test(geomType)) {
    const extent = feature.getGeometry().getExtent();
    const size = Math.max(extent[2] - extent[0], extent[3] - extent[1]);
    if (size/resolution < 5) {
      const center = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
      featureStyle.setGeometry(new Point(center));
    } else {
      featureStyle.setGeometry(feature.getGeometry());
    }
  } else {
    featureStyle.setGeometry(feature.getGeometry());
  }
  return featureStyle;
}

export default getStyle;