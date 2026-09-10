# remove-user

Deletes the login, profile and roles of a person who was added by mistake.

Narrow on purpose. Somebody who has built a costing, approved one or released a quotation is
**deactivated, never deleted**, because their name belongs on that work and the history log
would otherwise point at nobody. This function refuses anyone with a single record to their
name: it asks the database first (`app.person_footprint`, migration 0012), and that counts every
column anywhere in the schema that names a person.

It exists as an Edge Function rather than app code because deleting a login needs the **secret
key** (Supabase used to call this the service role key), which bypasses every security rule in
the database and must never reach a browser. The browser calls this function; the function
checks the caller is the master administrator before it uses the key.

## Deploying

```sh
supabase functions deploy remove-user
```

Deployed automatically by the **Deploy functions** workflow when anything under
`supabase/functions/` reaches `main`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided
by Supabase.

## Checking it

Invite somebody into a test company, then press **Remove** on their row. They disappear from
People, and from Authentication → Users in the Supabase dashboard. Press Remove on somebody who
has built a costing and the screen says how many records they have and to deactivate instead.
