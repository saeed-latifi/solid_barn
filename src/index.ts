import { batch, createEffect, createMemo, createSignal } from "solid-js";
import { createStore, SetStoreFunction, Store } from "solid-js/store";

export interface IBarnDataState {
	isLoading: boolean;
	isValidating: boolean;
	initialized: boolean;
	error?: any;
}

export interface IBarnSection<T> {
	data: [get: Store<T>, set: SetStoreFunction<T>];
	dataState: [get: Store<IBarnDataState>, set: SetStoreFunction<IBarnDataState>];
}

// TODO implement Freeze actions on global, domain and record state
export interface IBarnRecord<T> {
	[domain: string]: {
		records?: { [filterKey: string]: IBarnSection<T> };
		freeze: boolean;
	};
}

// TODO options for refetch on connection! page-load! stale!
export interface IBarnArgs<T, F> {
	domain: string;
	fetcher: (filters: Partial<F>) => Promise<T>;
	filters?: () => F;
	isReady?: () => boolean | Promise<boolean>;
	devLog?: boolean;
}

const Barn: IBarnRecord<any> = {};
const barnRecordsFetchMap = new Map<string, Promise<any>>();

export function useBarn<T extends object, F extends Record<string, any> = Record<string, any>>({ domain, fetcher, filters, isReady = () => true, devLog }: IBarnArgs<T, F>) {
	const purgedFilters = createMemo(() => keyGenerator(filters?.()) as Partial<F>);
	const key = createMemo(() => JSON.stringify(purgedFilters()));

	const storeSection = createMemo(() => {
		const currentKey = key();

		if (!Barn[domain]) Barn[domain] = { freeze: false };
		if (!Barn[domain].records) Barn[domain].records = {};
		if (!Barn[domain].records[currentKey]) {
			Barn[domain].records[currentKey] = {
				data: createStore<T>({} as T),
				dataState: createStore<IBarnDataState>({ initialized: false, isLoading: false, isValidating: false }),
			};
		}

		const store: IBarnSection<T> = Barn[domain].records[currentKey];

		return {
			// TODO reactive domain and freeze
			domain: Barn[domain],
			data: store.data[0],
			setData: store.data[1],
			dataState: store.dataState[0],
			setDataState: store.dataState[1],
		};
	});

	const [isReadyState, setReady] = createSignal(isReady.constructor.name === "AsyncFunction" ? false : isReady());
	const canAct = createMemo(() => isReadyState() && storeSection().dataState.initialized && !storeSection().dataState.isLoading && !storeSection().dataState.isValidating);

	createEffect(async () => {
		try {
			setReady(await isReady());
		} catch {
			setReady(false);
		}
	});

	createEffect(() => {
		const { dataState } = storeSection();
		const ready = isReadyState();

		if (ready && !dataState.initialized) {
			executeFetch();
		}
	});

	async function executeFetch(): Promise<T | undefined> {
		const fetchKey = `:${domain}:${key()}:`;
		if (barnRecordsFetchMap.has(fetchKey)) return barnRecordsFetchMap.get(fetchKey)!;

		if (devLog) console.log("fetch ", fetchKey);

		batch(() => {
			storeSection().setDataState("isLoading", true);
			storeSection().setDataState("initialized", true);
		});

		const promise = fetcher(purgedFilters());
		try {
			barnRecordsFetchMap.set(fetchKey, promise);
			const res: T = await promise;

			batch(() => {
				storeSection().setData(res);
				storeSection().setDataState("isLoading", false);
				storeSection().setDataState("error", undefined);
			});

			return res;
		} catch (error) {
			batch(() => {
				storeSection().setDataState("isLoading", false);
				storeSection().setDataState("error", error);
			});
		} finally {
			if (barnRecordsFetchMap.get(fetchKey) === promise) {
				barnRecordsFetchMap.delete(fetchKey);
			}
		}
	}

	const mutate: SetStoreFunction<T> = ((...args: any[]) => {
		if (!canAct()) return;
		return (storeSection().setData as any)(...args);
	}) as SetStoreFunction<T>;

	async function asyncMutate(updater: (mutator: SetStoreFunction<T>, data: T, filters: Partial<F>) => Promise<T | void> | T | void) {
		if (!updater || !canAct()) return;

		storeSection().setDataState("isValidating", true);
		await updater(storeSection().setData, storeSection().data, purgedFilters());
		storeSection().setDataState("isValidating", false);
	}

	return {
		key,
		canAct,
		storeSection,
		filters: purgedFilters,
		data: () => storeSection().data,
		dataState: () => storeSection().dataState,
		isReady: isReadyState,
		refetch: executeFetch,
		mutate,
		asyncMutate,
	};
}

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
