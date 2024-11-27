import React, { useEffect, useState } from "react";

export function ShoelaceProvider({ children }: { children: React.ReactNode }) {
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		import("@shoelace-style/shoelace/dist/themes/light.css");
		import("@shoelace-style/shoelace/dist/utilities/base-path.js").then(
			({ setBasePath }) => {
				setBasePath(
					"https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.16.0/cdn/"
				);
			}
		);
		setIsClient(true);
	}, []);

	if (!isClient) {
		return null;
	}

	return <>{children}</>;
}

export const ShoelaceComponents = React.lazy(
	async () => import("./ShoelaceComponents.tsx")
);
