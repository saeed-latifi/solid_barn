export function keyGenerator(filters?: Record<string, any>): Record<string, any> {
	if (!filters) return {};

	const purgedFilters = objectPurger(filters);
	if (purgedFilters === undefined || Object.keys(purgedFilters).length === 0) {
		return {};
	}

	return objectSorter(purgedFilters);
}

export function objectPurger(obj: any): any {
	// Handle primitive empty values
	if (obj === null || obj === undefined || Number.isNaN(obj)) {
		return undefined;
	}

	// Handle non-object types (including empty string)
	if (typeof obj !== "object") {
		return obj === "" ? undefined : obj;
	}

	// Handle arrays
	if (Array.isArray(obj)) {
		const purgedArray = obj.map(objectPurger).filter((item) => item !== undefined);
		return purgedArray.length > 0 ? purgedArray : undefined;
	}

	// Handle objects
	const purgedObject: Record<string, any> = {};
	let hasValidProperties = false;

	for (const [key, value] of Object.entries(obj)) {
		const purgedValue = objectPurger(value);
		if (purgedValue !== undefined) {
			purgedObject[key] = purgedValue;
			hasValidProperties = true;
		}
	}

	return hasValidProperties ? purgedObject : undefined;
}

export function objectSorter(obj: any): any {
	// Return primitives as-is
	if (obj === null || typeof obj !== "object") {
		return obj;
	}

	// Sort arrays
	if (Array.isArray(obj)) {
		return obj.map(objectSorter).sort((a, b) => {
			const aStr = JSON.stringify(a);
			const bStr = JSON.stringify(b);
			return aStr.localeCompare(bStr);
		});
	}

	// Sort objects
	const sortedObj: Record<string, any> = {};
	const sortedKeys = Object.keys(obj).sort();

	for (const key of sortedKeys) {
		sortedObj[key] = objectSorter(obj[key]);
	}

	return sortedObj;
}
