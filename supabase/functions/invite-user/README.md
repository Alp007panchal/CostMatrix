# invite-user

Creates a login, a profile and the roles for a new person, and emails them a link to set their
own password.

It exists as an Edge Function rather than app code because creating a login needs the **service
role key**, which bypasses every security rule in the database. That key must never reach a
browser. The browser calls this function; the function checks the caller is the master admin, or
a company administrator inviting into their own company, before it uses the key.

## Deploying

```sh
supabase functions deploy invite-user
supabase secrets set SITE_URL=https://your-app.vercel.app
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase
automatically. `SITE_URL` is where the invitation link sends people; without it they land on the
Supabase default page.

## Checking it

Invite somebody from the People screen. They should receive an email within a minute or two. If
nothing arrives, look at Authentication → Users in the Supabase dashboard: if the account is
there but the email is not, the project is still on Supabase's built-in mail, which is rate
limited and often lands in spam. Configuring your own SMTP sender is part of slice 6.
