import { css } from "@bearmetal/miscellanea";

export function SignInPage() {
  return (
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Sign In</title>
        <script defer src="https://cdn.bear-metal.dev/webbies/0.0.1/fullFat.js">
        </script>
        <style raw>
          {css`
            body {
              width: 100vw;
              height: 100vh;
              display: grid;
            }
            .form {
              color: var(--color-text);
              background-color: var(--color-brand-800);
              place-self: center;
              min-width: 200px;
              padding: 1rem;
              border-radius: var(--modal-radius);
              box-shadow: var(--modal-shadow);
            }
            div > form > fieldset {
              grid-template-columns: 1fr;
              border: none;
              padding: 1rem 0 0;
            }
            .dividery {
              display: flex;
              align-items: center;
              gap: 0.5rem;
              margin: 0.5rem;

              &::before, &::after {
                content: "";
                flex: 1;
                border-top: 1px solid currentColor;
              }
            }
            .wide {
              width: 100%;
              & bm-icon {
                margin-right: 0.5rem;
              }
            }
          `}
        </style>
      </head>
      <body>
        <div class="form">
          <form>
            <fieldset>
              <legend>Sign in</legend>
              <label>
                <input type="text" name="username" placeholder="Username" />
              </label>
              <br />
              <label>
                <input type="password" name="password" placeholder="Password" />
              </label>
              <br />
              <button type="submit">Sign In</button>
            </fieldset>
          </form>
          <div class="dividery">
            OR
          </div>
          <bm-grid columns="1" gap=".5rem">
            <form>
              <button class="secondary wide" type="submit">
                <bm-icon
                  icon="google-logo"
                  sheet="https://cdn.bear-metal.dev/icons/phosphor/bold.svg"
                >
                </bm-icon>
                Sign In with Google
              </button>
            </form>
            <form>
              <button class="secondary wide" type="submit">
                <bm-icon icon="discord-logo">
                </bm-icon>
                Sign In with Discord
              </button>
            </form>
            <form>
              <button class="secondary wide" type="submit">
                <bm-icon icon="github-logo">
                </bm-icon>
                Sign In with GitHub
              </button>
            </form>
          </bm-grid>
        </div>
      </body>
    </html>
  );
}
