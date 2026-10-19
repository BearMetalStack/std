# @bearmetal/auth

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fauth&valueColor=info)](https://jsr.io/@bearmetal/auth)

Token-based authentication as a `@bearmetal/router` module. Mounting `authModule()` registers
session cookie handling, user/session tables against `@bearmetal/db`, and a set of login routes
under `/__auth` for whichever methods are configured — alias/password today, with OAuth (Google,
Discord, GitHub) and passkeys planned.

The module depends on a `db` service being available in the router tree and defers its own setup via
`onAdopted` until one is found. What gets embedded in the issued auth token is configurable per
project through `AuthConfig`.

## Usage

```ts
router
	.use(dbModule("sqlite", { path: "./data/app.sqlite" }))
	.use(authModule({
		secret: await loadOrCreateSecret(), // or BM_TOKEN_SECRET
		includeInToken: ["role"],
		user: {
			schema: s.object({ role: s.optional(s.string()) }),
			onSignup: ({ hasUsers }) => ({ role: hasUsers ? "user" : "admin" }),
		},
		allowSignup: ({ hasUsers }) => !hasUsers, // first account only, then invite-only
		pages: false, // render your own forms that post to /__auth/login and /__auth/signup
		paths: { login: "/login", signup: "/setup", afterLogout: "/login" },
	}));
```

| Option           | Default            | Notes                                                                            |
| ---------------- | ------------------ | -------------------------------------------------------------------------------- |
| `secret`         | `BM_TOKEN_SECRET`  | Without either, a random per-process secret is used and sessions end on restart. |
| `secureCookies`  | `"auto"`           | `Secure` only when the request came over https (or `X-Forwarded-Proto: https`).  |
| `allowSignup`    | `true`             | A boolean, or a function of `{ ctx, hasUsers }`. A refused signup is a `403`.    |
| `user.schema`    | —                  | Extra `bma_users` columns. Keep them optional.                                   |
| `user.onSignup`  | —                  | Values for those columns when someone signs up.                                  |
| `includeInToken` | `[]`               | User fields the token carries into `ctx.state.user`.                             |
| `pages`          | `true`             | Serve the built-in `GET /__auth/login` and `/__auth/signup` pages.               |
| `paths`          | `/__auth/login`, … | Where redirects land. A failed sign-in goes to `paths.login?error=invalid`.      |

Sign-in, sign-up and sign-out answer form posts with `303 See Other`. Tokens are signed and checked
against `bma_sessions` on every request.

### Managing users

For invites, admin screens and first-run setup, the module exports helpers that take the `db`
service: `hasUsers`, `listUsers`, `getUser`, `createUser`, `updateUser`, `setPassword`,
`verifyPassword`, `deleteUser`, `revokeSessions` and `startSession`. `updateUser`, `setPassword` and
`deleteUser` end that user's sessions, since a token carries the fields it was issued with.
