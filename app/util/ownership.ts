import { getCurrentOwner, type Owner, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";

/**
 * Runs `action` under a fresh child `newOwner` whose refs forward to the parent,
 * registering `cleanup` on the parent so the child scope is torn down when the
 * parent is. `prevOwner` defaults to the ambient owner at call time; callers
 * invoked from inside an owner-aware effect can omit it, since getCurrentOwner()
 * already resolves to the owning component even on late re-renders.
 */
export function borrowOwnership<T>(
	newOwner: Owner,
	action: () => T,
	cleanup: () => void,
	prevOwner: Owner = getCurrentOwner(),
): T {
	if (!newOwner) return action();
	prevOwner?.registerCleanup(cleanup);
	newOwner.refs = prevOwner?.refs;
	newOwner.registerRef = prevOwner?.registerRef?.bind(prevOwner);
	setCurrentOwner(newOwner);
	const result = action();
	setCurrentOwner(prevOwner);
	return result;
}
