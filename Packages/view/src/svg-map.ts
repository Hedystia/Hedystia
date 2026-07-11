/**
 * SVG support for @hedystia/view.
 *
 * Import this module (or have it imported by a component) to enable
 * SVG rendering.  It registers the SVG element/attribute maps on
 * `globalThis` so the JSX runtime can create SVG elements without
 * bundling the map into every page.
 *
 * @module @hedystia/view/svg-map
 */
export { SVG_ATTR_MAP, SVG_ELEMENTS, SVG_NS } from "./jsx/svg-map";
import "./jsx/svg-map";
