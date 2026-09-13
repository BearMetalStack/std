/** Tag builders for `head.test.ts`. Separate because the test file is `.ts`. */

export const meta = (name: string, content: string) => <meta name={name} content={content} />;
