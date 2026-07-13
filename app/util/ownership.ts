import { getCurrentOwner, type Owner, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";

export function borrowOwnership<T>(
	newOwner: Owner,
	action: () => T,
	cleanup: () => void,
): T {
	if (!newOwner) return action();
	const prevOwner = getCurrentOwner();
	prevOwner?.registerCleanup(cleanup);
	newOwner.refs = prevOwner?.refs;
	newOwner.registerRef = prevOwner?.registerRef?.bind(prevOwner);
	setCurrentOwner(newOwner);
	const result = action();
	setCurrentOwner(prevOwner);
	return result;
}
