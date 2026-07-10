export function stringsSufficientlySimilar(a: string, b: string, threshold: number): boolean {
	return compareStrings(a, b) <= threshold;
}

export function compareStrings(a: string, b: string): number {
	return levenshteinDistance(a.toLowerCase(), b.toLowerCase());
}

function levenshteinDistance(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

	for (let i = 0; i <= m; i++) {
		for (let j = 0; j <= n; j++) {
			if (i === 0) {
				dp[i][j] = j;
			} else if (j === 0) {
				dp[i][j] = i;
			} else {
				dp[i][j] = Math.min(
					dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
					dp[i - 1][j] + 1,
					dp[i][j - 1] + 1,
				);
			}
		}
	}

	return dp[m][n];
}
