import type { RouteConfig } from "@react-router/dev/routes";

export default [
	{
		path: "/",
		file: "./layouts/RootLayout.tsx",
		children: [
			{
				index: true,
				file: "./routes/index/Page.tsx",
			},
			{
				path: "editor",
				file: "./routes/editor/Page.tsx",
			},
			{
				path: "changes",
				file: "./routes/changes/Page.tsx",
			},
			{
				path: "conflicts",
				file: "./routes/conflicts/Page.tsx",
			},
			{
				path: "graph",
				file: "./routes/graph/Page.tsx",
			},
		],
	},
] satisfies RouteConfig;
