import { Router } from "@bearmetal/router";

const app = new Router();
app.use(async (_, __, next) => {
	const res = await next();
	res.headers.set("Access-Control-Allow-Origin", "*");
	return res;
});
app.serveDirectory("./public", "/public", { showIndex: true, flatten: false });
app.serveDirectory("./icons", "/icons");
app.serveDirectory("./dist", "/", { showIndex: true, flatten: false });
app.logALot();
Deno.serve({ port: 3001 }, app.handle.bind(app));
