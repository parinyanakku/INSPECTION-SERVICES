-- Prepared for Supabase Auth. Apply in the owner's Supabase project, not in GitHub.
begin;
create table public.inspection_licenses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'customer' check (role in ('admin','customer')),
  plan text not null default 'trial' check (plan in ('trial','monthly','yearly','lifetime','custom')),
  active boolean not null default false,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint license_expiry_required check (plan = 'lifetime' or expires_at is not null)
);
alter table public.inspection_licenses enable row level security;
revoke all on public.inspection_licenses from anon, authenticated;
grant select on public.inspection_licenses to authenticated;
create policy "Read own license" on public.inspection_licenses
  for select to authenticated using (auth.uid() = user_id);

create function public.inspection_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.inspection_licenses l
  where l.user_id = auth.uid() and l.role = 'admin' and l.active
  and (l.expires_at is null or l.expires_at > now()));
$$;
revoke all on function public.inspection_is_admin() from public, anon;
grant execute on function public.inspection_is_admin() to authenticated;

create function public.inspection_has_access()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.inspection_licenses l
  where l.user_id = auth.uid() and l.active
  and (l.expires_at is null or l.expires_at > now()));
$$;
revoke all on function public.inspection_has_access() from public, anon;
grant execute on function public.inspection_has_access() to authenticated;

create table public.inspection_license_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  customer_id uuid,
  action text not null,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz not null default now()
);
alter table public.inspection_license_audit enable row level security;
revoke all on public.inspection_license_audit from anon, authenticated;
grant select on public.inspection_license_audit to authenticated;
create policy "Admin reads license audit" on public.inspection_license_audit
for select to authenticated using (public.inspection_is_admin());

create function public.inspection_admin_list_users()
returns table (user_id uuid, email text, last_sign_in_at timestamptz,
 display_name text, role text, plan text, active boolean, expires_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
 if not public.inspection_is_admin() then
   raise exception 'Administrator access required' using errcode = '42501';
 end if;
 return query select u.id, u.email::text, u.last_sign_in_at,
   coalesce(l.display_name,''), coalesce(l.role,'customer'),
   l.plan, coalesce(l.active,false), l.expires_at
   from auth.users u left join public.inspection_licenses l on l.user_id=u.id
   order by u.created_at desc;
end;
$$;
revoke all on function public.inspection_admin_list_users() from public, anon;
grant execute on function public.inspection_admin_list_users() to authenticated;

create function public.inspection_admin_set_license(
 p_user_id uuid, p_display_name text, p_plan text, p_active boolean, p_expires_at timestamptz
) returns public.inspection_licenses
language plpgsql security definer set search_path = ''
as $$
declare old_row public.inspection_licenses; result_row public.inspection_licenses;
begin
 if not public.inspection_is_admin() then
   raise exception 'Administrator access required' using errcode = '42501';
 end if;
 if p_user_id is null or p_user_id = auth.uid() then
   raise exception 'Cannot change own administrator license';
 end if;
 if p_plan is null or p_plan not in ('trial','monthly','yearly','lifetime','custom')
   or p_active is null then raise exception 'Invalid license'; end if;
 if p_plan <> 'lifetime' and p_expires_at is null then raise exception 'Expiry required'; end if;
 select * into old_row from public.inspection_licenses where user_id=p_user_id for update;
 if old_row.role = 'admin' then raise exception 'Cannot modify administrator license'; end if;
 insert into public.inspection_licenses(user_id,display_name,role,plan,active,expires_at)
 values(p_user_id,coalesce(p_display_name,''),'customer',p_plan,p_active,
 case when p_plan='lifetime' then null else p_expires_at end)
 on conflict(user_id) do update set display_name=excluded.display_name,plan=excluded.plan,
 active=excluded.active,expires_at=excluded.expires_at,updated_at=now()
 where public.inspection_licenses.role='customer'
 returning * into result_row;
 if result_row.user_id is null then raise exception 'Cannot modify administrator license'; end if;
 insert into public.inspection_license_audit(actor_id,customer_id,action,previous_state,new_state)
 values(auth.uid(),p_user_id,'set_license',to_jsonb(old_row),to_jsonb(result_row));
 return result_row;
end;
$$;
revoke all on function public.inspection_admin_set_license(uuid,text,text,boolean,timestamptz) from public, anon;
grant execute on function public.inspection_admin_set_license(uuid,text,text,boolean,timestamptz) to authenticated;
commit;
