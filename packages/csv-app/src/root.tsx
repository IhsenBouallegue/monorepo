import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "./style.css";

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<link rel="icon" type="image/svg+xml" href="/lix.svg" />
				<title>CSV App</title>
				<Meta />
				<Links />
			</head>
			<body style={{ backgroundColor: "var(--color-zinc-50)" }}>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function Root() {
	return <Outlet />;
}
