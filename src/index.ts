import { batch, createEffect, createMemo, createSignal } from "solid-js";
import { createStore, SetStoreFunction, Store } from "solid-js/store";
import { keyGenerator } from "./utils";

export const utils = { keyGenerator };

interface IBarnDataState {
	isLoading: boolean;
	isValidating: boolean;
	initialized: boolean;
	error?: any;
}

interface IBarnSection<T> {
	data: [get: Store<T>, set: SetStoreFunction<T>];
	dataState: [get: Store<IBarnDataState>, set: SetStoreFunction<IBarnDataState>];
}

// TODO implement Freeze actions on global, domain and record state
interface IBarnRecord<T> {
	[domain: string]: {
		records?: { [filterKey: string]: IBarnSection<T> };
		freeze: boolean;
	};
}

interface IBarnArgs<T, F> {
	domain: string;
	fetcher: (filters: Partial<F>) => Promise<T>;
	filters?: () => F;
	isReady?: () => boolean | Promise<boolean>;
	devLog?: boolean;
}

const Barn: IBarnRecord<any> = {};
const barnRecordsFetchMap = new Map<string, Promise<any>>();

export function useBarnRecord<T extends object, F extends Record<string, any> = Record<string, any>>({ domain, fetcher, filters, isReady = () => true, devLog }: IBarnArgs<T, F>) {
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
