![NPM Version](https://img.shields.io/npm/v/solid-cached-resource) ![npm bundle size](https://img.shields.io/bundlephobia/min/solid-cached-resource) ![NPM License](https://img.shields.io/npm/l/solid-cached-resource)

# Solid Cached Resource

Inspired by TanStack Query, with minimal API and footprint, built only for SolidJS.
The (almost) same API as [createResource](https://www.solidjs.com/docs/latest/api#createresource).
Includes `createMutation` for easier mutation state handling.

[API references](https://yonathan06.github.io/solid-cached-resource/)

Features:

-   Create resource with the same key in multiple places - fetch once
-   Cache results for next component mount, and refresh when wanted
-   Mutate local resource by key after a successful remote mutation request

## install

```sh
pnpm add solid-barn
```

or `npm`/`yarn`

## useBarn

Inspired by [useSWR](https://swr.vercel.app/) just for Solid

```TypeScript
// useUser.tsx
import { useBarn } from "solid-barn";

function useUser({ id }: { id: () => string }) {
	const { key, data, mutate, fetchState, isReady } = useBarn({
		domain: "user",
		isReady: async () => {
			await sleep(700);
			return true;
		},
		fetcher: async (filters) => {
			await sleep(3000);
			return { id: filters.id, name: "the user name" };
		},
		filters: () => ({ id: id() }),
	});

	return { key, data, mutate, fetchState, isReady };
}

// MyComp.tsx
import { createSignal, Match, Switch } from "solid-js";
import { sleep } from "~/utils/sleep";
import { useUser } from "~/hooks/useUser";
import { useSearchParams } from "@solidjs/router";

export function ShowUser() {
	const [params, setParams] = useSearchParams();
	const { data, fetchState, isReady, key, mutate } = useUser({ id: () => params.userId?.toString() ?? "" });

	return (
		<Switch>
			<Match when={!isReady()}>
				<div class="px-6 py-2 rounded-full flex items-center justify-center bg-emerald-600">not ready!</div>
			</Match>

			<Match when={!fetchState().initialized}>
				<div class="px-6 py-2 rounded-full flex items-center justify-center bg-rose-500">initializing ...</div>
			</Match>

			<Match when={fetchState().isLoading}>
				<div class="px-6 py-2 rounded-full flex items-center justify-center bg-amber-500">isLoading ...</div>
			</Match>

			<Match when={fetchState().error}>
				<div class="px-6 py-2 rounded-full flex items-center justify-center bg-rose-950">{JSON.stringify({ error: fetchState().error })}</div>
			</Match>

			<Match when={data()}>
				<div class="px-6 py-2 rounded-full flex items-center justify-center bg-yellow-100">{JSON.stringify(data())}</div>
			</Match>

			<Match when={true}>
				<div class="px-6 py-2 rounded-full flex items-center justify-center bg-red-600">some unExpected happened!!!</div>
			</Match>
		</Switch>
	);
}
```

In the case above, if `params.userId` has the same value, the filters and then key will be the same, so even though both components are creating the same resource with the same fetcher, only one request will be made to the server.

## Mutations

```TypeScript
export function MutateUser() {
	const [params, setParams] = useSearchParams();

	const [value, setValue] = createSignal("");
	const { key, mutate } = useUser({ id: () => params.userId?.toString() ?? "" });

	return (
		<div class="flex flex-col gap-4 w-full">
			<Input value={value()} onInput={(e) => setValue(e.target.value)} type="text" />

			<Button onClick={() => mutate("name", value())}>mutate value</Button>

			<Button onClick={() => setParams?.({ x: value() })}>mutate filter</Button>

			<div class="px-6 py-2 rounded-full flex items-center justify-center bg-indigo-400">{key()}</div>
		</div>
	);
}
```
