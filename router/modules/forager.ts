/**
 * @module
 * Forager - a built-in Forager (route explorer) module for BearMetal Router.
 *
 * Mounts a single route that renders an HTML page listing all registered
 * routes and their HTTP methods. Intended as a starting point for a full
 * OpenAPI/Swagger implementation.
 *
 * @example
 * ```ts
 * import { ForagerModule } from "@bearmetal/router/modules/forager";
 *
 * const app = new Router()
 *   .use(authModule())
 *   .use(new ForagerModule());
 * // Visit /@bearmetal/forager to see the route list.
 * ```
 */

import { escapeHtml, html } from "@bearmetal/miscellanea";
import { Module } from "../module.ts";
import { markInternal } from "@bearmetal/internal";

export class ForagerModule extends Module {
	constructor({ path = "/@bearmetal/forager" }: { path?: string } = {}) {
		super();
		this.route(path).get(() => this.#render());
		markInternal(this);
	}

	#render(): Response {
		if (!this.parent) {
			return new Response("ForagerModule is not mounted on a router.", {
				status: 500,
			});
		}

		const rows = [...this.parent.routeRegistry]
			.filter(([, entry]) => entry.methods.length > 0)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([path, entry]) =>
				`      <tr><td>${escapeHtml(path)}</td><td>${
					escapeHtml(entry.methods.join(", "))
				}</td><td>${
					JSON.stringify(entry.schemas[entry.methods[0]]?.toJSONSchema()) ??
						"No docs"
				}</td></tr>`
			)
			.join("\n");

		const htm = html`
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1">
					<title>Forager</title>
					<style>
			                *, *::before, *::after { box-sizing: border-box; }
			                body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1.5rem; color: #1e293b; }
			                h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 1.5rem; }
			                table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
			                th { text-align: left; padding: 0.5rem 0.75rem; background: #f1f5f9; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
			                td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #e2e8f0; }
			                td:first-child { font-family: monospace; font-size: 0.85rem; }
			                td:last-child { color: #64748b; font-size: 0.8rem; }
			                tr:last-child td { border-bottom: none; }
			            </style>
				</head>
				<body>
					<h1>Forager</h1>
					<table>
						<thead>
							<tr>
								<th>Path</th>
								<th>Methods</th>
								<th>Docs</th>
							</tr>
						</thead>
						<tbody>
			            ${rows}
			                </tbody>
					</table>
				</body>
			</html>
		`;

		return new Response(htm, {
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}
}
