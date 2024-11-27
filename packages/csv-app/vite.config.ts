import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { reactRouter } from "@react-router/dev/vite";

export default defineConfig({
	plugins: [reactRouter(), tailwindcss()],
	envPrefix: "PUBLIC_",
	server: {
		port: 3008,
		headers: {
			"Cross-Origin-Opener-Policy": "*",
			"Cross-Origin-Embedder-Policy": "*",
		},
	},
	build: {
		target: "es2022",
	},
	optimizeDeps: {
		exclude: [
			"@lix-js/sdk",
			"@sqlite.org/sqlite-wasm",
			"@eliaspourquoi/sqlite-node-wasm",
		],
	},
});
