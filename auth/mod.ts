import {
  Html,
  type Infer,
  Module,
  type Schema,
  type Service,
} from "@bearmetal/router";
import { type DBServiceActions, dbToken, m, s } from "@bearmetal/db";
import { SignInPage } from "./views/SignInPage.tsx";

export type AuthState<T extends Infer<Schema<unknown>>> = {
  user: {
    alias: string;
    id: string;
  } & T;
};

let db: Service<DBServiceActions>;
export function authModule<T extends Schema<unknown>>(userSchema: T): Module<
  AuthState<Infer<T>>
> {
  const module = new Module<AuthState<T>>();
  module
    .onAdopted((parent) => {
      try {
        db = parent.getService(dbToken);
        console.log(
          "%c[BearMetal Auth]%c db service found!",
          "color: green",
          "color: white",
        );
      } catch {
        console.warn(
          "%c[BearMetal Auth]%c db service not found",
          "color: green",
          "color: red",
        );
        return false;
      }
      return true;
    })
    .onStart(async () => {
      db.invoke("registerMigrations", [
        m.create("users__0001", {
          table: "bma_users",
          schema: s.object({
            alias: s.string(),
            id: s.string().uuid(),
          }),
          primaryKey: "id",
        }),
      ]);
      try {
        await db.invoke("migrate");
      } catch (e) {
        console.log(e);
      }
    })
    .route("/__auth/login")
    .get(() => Html(SignInPage().raw));
  return module;
}
