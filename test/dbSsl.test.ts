// SLF_DB_SSL_EXPLICIT_v1
import { describe, expect, it } from "vitest";
import { withExplicitSslMode } from "../src/db/sslMode";

describe("explicit sslmode", () => {
  it("pins the weaker aliases to the behaviour pg gives today", () => {
    for (const weak of ["require", "prefer", "verify-ca"]) {
      expect(withExplicitSslMode(`postgres://h/db?sslmode=${weak}`))
        .toBe("postgres://h/db?sslmode=verify-full");
    }
  });

  it("keeps the rest of the connection string intact", () => {
    expect(withExplicitSslMode("postgres://u:p@h:5432/db?sslmode=require&sslrootcert=system"))
      .toBe("postgres://u:p@h:5432/db?sslmode=verify-full&sslrootcert=system");
  });

  it("leaves verify-full and a deliberate disable alone", () => {
    expect(withExplicitSslMode("postgres://h/db?sslmode=verify-full"))
      .toBe("postgres://h/db?sslmode=verify-full");
    expect(withExplicitSslMode("postgres://h/db?sslmode=disable"))
      .toBe("postgres://h/db?sslmode=disable");
  });

  it("does not invent an sslmode where none was given", () => {
    expect(withExplicitSslMode("postgres://h/db")).toBe("postgres://h/db");
    expect(withExplicitSslMode("")).toBe("");
  });
});
