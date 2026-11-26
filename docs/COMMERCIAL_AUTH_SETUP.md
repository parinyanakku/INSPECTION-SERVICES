# Commercial access: Supabase Free setup (prepared, not enabled)

The current GitHub Pages site is unchanged. This migration is a server-side license foundation, not a completed login system. Do not advertise commercial protection until frontend authentication and protected backend operations are implemented and verified.

## Setup
1. Create or select a Supabase project on the Free plan. Do not upgrade billing.
2. Apply the SQL migration using the project SQL editor or migration tooling after reviewing it.
3. Configure Supabase Auth for email/password, disable public sign-up if selling invite-only licenses, and configure allowed redirect URLs for the existing Pages site. Invite/create the initial admin using the Supabase dashboard. Set up password reset/email delivery and test it.
4. Bootstrap the first administrator from the SQL editor using that user's actual Auth UUID (not a password):
```sql
insert into public.inspection_licenses(user_id,display_name,role,plan,active,expires_at)
values ('REPLACE_WITH_AUTH_USER_UUID','Administrator','admin','lifetime',true,null);
```
5. The frontend should use only the project URL and publishable/anon key, never a service_role or secret key. Integrate Auth, the license check RPC, admin list/set RPC, and logout/reset UI. Keep login enforcement off in production until the admin and customer flows pass testing.
6. Before selling, move paid operations/data that require access protection behind a backend which validates the user's JWT and checks the current license on every request. Apply RLS to any protected customer data, scoped to the owning user. Public GitHub Pages JavaScript and local-only report functions can be copied or bypassed; a frontend login gate alone cannot protect them. Keep the existing local project data intact; design an explicit migration or per-user data separation before enabling accounts on shared devices.
7. Test active, inactive, expired, lifetime, unauthorized and cross-account cases, account reset and admin recovery before rollout.

## Prepared license policies
- Customer can read their own license, cannot grant or renew it.
- Admin RPCs list accounts and control customer licenses, without allowing customers to escalate roles.
- Expiry is checked against the database server clock.
- Trial/monthly/yearly/custom use explicit expiry timestamps; lifetime has no expiry.
- Admin changes are audited.
- Account creation is initially through the Supabase Auth dashboard; no privileged secret is shipped to the browser.
- Device limits and automated payments are not implemented by this migration.

No project credentials or customer data are committed to this repository.
