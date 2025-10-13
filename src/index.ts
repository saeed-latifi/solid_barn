import { batch, createEffect, createMemo, createSignal } from "solid-js";
import { createStore, SetStoreFunction, Store } from "solid-js/store";
import { keyGenerator } from "./utils";

export const utils = { keyGenerator };

// export const keyGenerator

interface IDataState {
	isLoading: boolean;
	isValidating: boolean;
	initialized: boolean;
	error?: any;
}

interface IBarnSection {
	base: {
		[filterKey: string]: {
			data: [get: Store<any>, set: SetStoreFunction<any>];
			dataState: [get: Store<IDataState>, set: SetStoreFunction<IDataState>];
		};
	};
	freeze: boolean;
}

// TODO implement Freeze actions on global, domain and record state
// TODO add isValidating
interface IBarn {
	[domain: string]: {
		list?: IBarnSection;
		record?: IBarnSection;
		base?: IBarnSection;
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

const Barn: IBarn = {};
const globalFetchMap = new Map<string, Promise<any>>();

export function useBarn<T extends object, F extends Record<string, any> = Record<string, any>>({ domain, fetcher, filters, isReady = () => true, storeType = "base", devLog }: IStoreArgs<T, F>) {
	const purgedFilters = createMemo(() => keyGenerator(filters?.()) as Partial<F>);
	const key = createMemo(() => JSON.stringify(purgedFilters()));

	const storeSection = createMemo(() => {
		const currentKey = key();

		if (!Barn[domain]) Barn[domain] = { freeze: false };
		if (!Barn[domain][storeType]) Barn[domain][storeType] = { base: {}, freeze: false };

		let store = Barn[domain][storeType]?.base[currentKey];
		if (!store) {
			store = {
				data: createStore<T>({} as T),
				dataState: createStore<IDataState>({ initialized: false, isLoading: false, isValidating: false }),
			};
		}

		return {
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
		const fetchKey = `:${domain}:${storeType}:${key()}:`;
		if (globalFetchMap.has(fetchKey)) return globalFetchMap.get(fetchKey)!;

		if (devLog) console.log("fetch ", fetchKey);

		batch(() => {
			storeSection().setDataState("isLoading", true);
			storeSection().setDataState("initialized", true);
		});

		const promise = fetcher(purgedFilters());
		try {
			globalFetchMap.set(fetchKey, promise);
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
		dataState: () => storeSection().dataState,
		isReady: isReadyState,
		onValidate: (v: boolean) => storeSection().setDataState("isValidating", v),
		mutate,
	};
}
