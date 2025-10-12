import { batch, createEffect, createMemo, createSignal } from "solid-js";
import { createStore, SetStoreFunction, Store } from "solid-js/store";
import { keyGenerator } from "./keyGenerator";
// export const keyGenerator

interface IFetchState {
	isLoading: boolean;
	isValidating: boolean;
	initialized: boolean;
	error?: any;
}

interface IGStoreSection {
	base: {
		[filterKey: string]: {
			data: [get: Store<any>, set: SetStoreFunction<any>];
			fetchState: [get: Store<IFetchState>, set: SetStoreFunction<IFetchState>];
		};
	};
	freeze: boolean;
}

// TODO implement Freeze actions on global, domain and record state
// TODO add isValidating
interface GStore {
	[domain: string]: {
		list?: IGStoreSection;
		record?: IGStoreSection;
		base?: IGStoreSection;
		freeze: boolean;
	};
}

interface IStoreArgs<T, F> {
	domain: string;
	fetcher: (filters: Partial<F>) => Promise<T>;
	filters?: () => F;
	isReady?: () => boolean | Promise<boolean>;
	storeType?: "list" | "record" | "base";
	devLog: boolean;
}

const gStore: GStore = {};
const globalFetchMap = new Map<string, Promise<any>>();

export function useGStore<T extends object, F extends Record<string, any> = Record<string, any>>({ domain, fetcher, filters, isReady = () => true, storeType = "base", devLog }: IStoreArgs<T, F>) {
	const purgedFilters = createMemo(() => keyGenerator(filters?.()) as Partial<F>);
	const key = createMemo(() => JSON.stringify(purgedFilters()));

	const storeSection = createMemo(() => {
		const currentKey = key();

		if (!gStore[domain]) gStore[domain] = { freeze: false };
		if (!gStore[domain][storeType]) gStore[domain][storeType] = { base: {}, freeze: false };
		if (!gStore[domain][storeType].base[currentKey]) {
			gStore[domain][storeType].base[currentKey] = {
				data: createStore<T>({} as T),
				fetchState: createStore<IFetchState>({ initialized: false, isLoading: false, isValidating: false }),
			};
		}

		const store = gStore[domain][storeType].base[currentKey];

		return {
			data: store.data[0],
			setData: store.data[1],
			fetchState: store.fetchState[0],
			setFetchState: store.fetchState[1],
		};
	});

	const [isReadyState, setReady] = createSignal(isReady.constructor.name === "AsyncFunction" ? false : isReady());
	const canAct = createMemo(() => isReadyState() && storeSection().fetchState.initialized && !storeSection().fetchState.isLoading && !storeSection().fetchState.isValidating);

	createEffect(async () => {
		try {
			setReady(await isReady());
		} catch {
			setReady(false);
		}
	});

	createEffect(() => {
		const { fetchState } = storeSection();
		const ready = isReadyState();

		if (ready && !fetchState.initialized) {
			executeFetch();
		}
	});

	async function executeFetch(): Promise<T | undefined> {
		const fetchKey = `:${domain}:${storeType}:${key()}:`;
		if (globalFetchMap.has(fetchKey)) return globalFetchMap.get(fetchKey)!;

		if (devLog) console.log("fetch ", fetchKey);

		batch(() => {
			storeSection().setFetchState("isLoading", true);
			storeSection().setFetchState("initialized", true);
		});

		const promise = fetcher(purgedFilters());
		try {
			globalFetchMap.set(fetchKey, promise);
			const res: T = await promise;

			batch(() => {
				storeSection().setData(res);
				storeSection().setFetchState("isLoading", false);
				storeSection().setFetchState("error", undefined);
			});

			return res;
		} catch (error) {
			batch(() => {
				storeSection().setFetchState("isLoading", false);
				storeSection().setFetchState("error", error);
			});
		} finally {
			if (globalFetchMap.get(fetchKey) === promise) {
				globalFetchMap.delete(fetchKey);
			}
		}
	}

	const mutate: SetStoreFunction<T> = ((...args: any[]) => {
		if (!canAct()) return;
		return (storeSection().setData as any)(...args);
	}) as SetStoreFunction<T>;

	return {
		key,
		data: () => storeSection().data,
		fetchState: () => storeSection().fetchState,
		isReady: isReadyState,
		onValidate: (v: boolean) => storeSection().setFetchState("isValidating", v),
		mutate,
	};
}
