import * as vscode from "vscode"
import { state } from "../state.js"
import { CONFIGURATION } from "../../configuration.js"
import { getSelectedBundleByBundleIdOrAlias } from "../helper.js"
import { msg } from "../messages/msg.js"
import type { BundleNested } from "@inlang/sdk2"
import * as path from "node:path"
import * as fs from "node:fs"

export async function editorView(args: { bundleId: string; context: vscode.ExtensionContext }) {
	const bundle = await getSelectedBundleByBundleIdOrAlias(args.bundleId)

	if (!bundle) {
		return msg("Bundle with id " + args.bundleId + " not found.", "error")
	}

	const panel = vscode.window.createWebviewPanel(
		"bundlePanel",
		state().selectedProjectPath.split("/").pop() ?? "Bundle",
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.joinPath(args.context.extensionUri, "dist")],
		}
	)

	panel.webview.html = await getWebviewContent({
		bundle,
		context: args.context,
		webview: panel.webview,
	})

	panel.webview.onDidReceiveMessage(async (message) => {
		console.log("message", message)
		switch (message.command) {
			case "updateBundle":
				// Handle bundle updates here
				CONFIGURATION.EVENTS.ON_DID_EDITOR_VIEW_CHANGE.fire()
				break
		}
	})
}

async function getWebviewContent(args: {
	bundle: BundleNested
	context: vscode.ExtensionContext
	webview: vscode.Webview
}): Promise<string> {
	const { context, webview, bundle } = args

	const isDevelopment = process.env.NODE_ENV === "development"

	let scriptUri: vscode.Uri
	let styleUri: vscode.Uri

	if (isDevelopment) {
		const port = 3000
		const host = "localhost"

		scriptUri = vscode.Uri.parse(`http://${host}:${port}/src/main.tsx`)
		styleUri = vscode.Uri.parse(`http://${host}:${port}/src/index.css`)
	} else {
		const manifestPath = path.join(
			context.extensionPath,
			"dist",
			"bundle-component",
			".vite",
			"manifest.json"
		)
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))

		const mainManifestEntry = manifest["src/main.tsx"]

		const scriptFileName = mainManifestEntry.file
		const cssFileName = mainManifestEntry.css ? mainManifestEntry.css[0] : ""

		scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(context.extensionUri, "dist", "bundle-component", scriptFileName)
		)
		styleUri = cssFileName
			? webview.asWebviewUri(
					vscode.Uri.joinPath(context.extensionUri, "dist", "bundle-component", cssFileName)
				)
			: vscode.Uri.parse("CSS file not found in manifest")
	}

	const initialData = {
		bundle,
	}

	let csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src ${webview.cspSource};`

	if (isDevelopment) {
		csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval'; connect-src ws://localhost:3000;`
	}

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Inlang Bundle</title>
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${styleUri ? `<link href="${styleUri}" rel="stylesheet">` : ""}
</head>
<body>
  <div id="root"></div>
  <script>
    window.acquireVsCodeApi = acquireVsCodeApi;
    window.initialData = ${JSON.stringify(initialData)};
  </script>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`
}
