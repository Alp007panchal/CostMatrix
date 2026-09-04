# Database tests

These prove the promise CostMatrix makes to every company: **nobody else can see your data.**
They run as ordinary signed-in users against the real policies, not as an administrator, so a
policy that leaks is a failing test rather than a discovery in production.

## Running them

```sh
./supabase/tests/run-local.sh
```

It builds a throwaway PostgreSQL, applies the auth shim, applies every migration in order, then
runs each test file. Any failure stops it with a non-zero exit code. The same script runs in CI
on every push.

## The files

| File | What it covers |
|---|---|
| `00_auth_shim.sql` | A minimal stand-in for the parts of Supabase the migrations use (`auth.users`, `auth.uid()`, the `authenticated` and `anon` roles). Supabase provides these in a real project; this exists so the tests can run against plain PostgreSQL. Never applied to Supabase. |
| `01_fixture.sql` | Three companies and five people, plus the `test.ok` / `test.eq` / `test.refuses` helpers. |
| `02_tenant_isolation.sql` | One company cannot see or change another's rows; the master admin can look everywhere but not edit a company's own settings; a deactivated person sees nothing. |
| `03_numbering.sql` | Numbers are per company, per kind, per year, and cannot be rewound by hand. |
| `04_schema_guarantees.sql` | Structural rules that a later migration could break by accident: every public table has row-level security on, the security predicates stay `security definer` and `stable`, a new company gets its settings row, `updated_at` is maintained by the database. |
| `05_privilege_escalation.sql` | Attempts to climb out of one's own company. Each of these worked at some point while slice 0 was being built. |

## Adding to them

Every migration that adds a tenant-owned table should add a test that a user of one company
cannot read or write another's rows in it. `04_schema_guarantees.sql` catches a table where
row-level security was forgotten entirely, but not a policy that is merely too generous.

`test.refuses` takes the expected error text as its third argument. Always pass it: without it,
a typo in the statement looks exactly like a security control doing its job.
