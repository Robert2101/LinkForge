# ADR 003: Random Base62 short codes

**Status:** accepted

## Context

A short code is the part after the slash. Three ways to produce one:

1. **Counter encoded in Base62.** Never collides, but codes are guessable: anyone can walk `/1`, `/2`, `/3` and read every link, and the latest code reveals how many links exist. A counter is also a point of coordination between servers.
2. **Hash of the long URL, truncated.** Two people shortening the same URL would get the same code and share one link, with shared analytics and shared ownership problems.
3. **Random characters.**

## Decision

Seven random characters from `0-9 a-z A-Z`, generated with `crypto.randomBytes`.

- **Size of the space:** 62⁷ ≈ 3.5 trillion codes.
- **No modulo bias:** a random byte is 0–255 and 256 is not a multiple of 62, so `byte % 62` would favour the first eight characters. Bytes of 248 and above are discarded (248 = 62 × 4).
- **Uniqueness is the database's job.** The code is inserted with `INSERT … ON CONFLICT (short_code) DO NOTHING RETURNING`. No row back means the code was taken, so a new one is generated, up to five times. There is no "check if free, then insert" step for another request to slip between.
- **Custom aliases** go through the same insert. A conflict there is reported as `409` because the user chose that name. Aliases are 3–30 characters of letters, digits, `-` and `_`, and may not be one of the reserved names the app itself uses (`api`, `login`, `dashboard`, …).

## How likely is a collision?

With *n* links stored, one new random code collides with probability *n* / 62⁷. At one million links that is about 1 in 3.5 million per insert; at one billion links, about 1 in 3,500. Five attempts make failure at realistic sizes practically impossible, and the code length can be raised to 8 (218 trillion) when the table grows.

## Consequences

- Codes cannot be enumerated, and they reveal nothing about volume.
- A rare extra insert on collision, instead of a guaranteed-unique counter.
- Codes are case-sensitive.
