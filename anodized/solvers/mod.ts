/**
 * @module
 * Line solvers: series curve fitting, node anchors and connector routing. All pure functions
 * over world coordinates, usable without a GPU.
 */

export { appendCurve, areaPath, curvePath, monotoneTangents } from "./curves.ts";
export {
	autoPorts,
	center,
	type NodeGeometry,
	perimeterPoint,
	PORT_NORMALS,
	portPoint,
} from "./anchors.ts";
export {
	countBends,
	orthogonal,
	resolvePorts,
	type Route,
	routeMidpoint,
	routePath,
	type RouteRequest,
	simplify,
	solveRoute,
	trimRoute,
} from "./route.ts";
