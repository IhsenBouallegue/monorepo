import { renderToString } from "react-dom/server";
import { ServerRouter } from "react-router";
import routes from "./routes.js";

export default async function handleRequest(request: Request) {
	const context = {};
	const markup = renderToString(
		<ServerRouter location={request.url} context={context} routes={routes} />
	);

	return new Response(`<!DOCTYPE html>${markup}`, {
		headers: { "Content-Type": "text/html" },
	});
}
