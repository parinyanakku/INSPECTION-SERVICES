create schema if not exists inspection_private;
revoke all on schema inspection_private from public, anon, authenticated;
create table inspection_private.activation_codes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 code_hash bytea not null unique,
 plan text not null check(plan in ('trial','monthly','yearly','lifetime','custom')),
 duration_days integer,
 issued_at timestamptz not null default now(),
 redeem_by timestamptz not null default now()+interval '7 days',
 redeemed_at timestamptz,
 revoked_at timestamptz,
 check ((plan='lifetime' and duration_days is null) or (plan<>'lifetime' and duration_days is not null and duration_days between 1 and 3650))
);
alter table inspection_private.activation_codes enable row level security;
revoke all on inspection_private.activation_codes from public,anon,authenticated;

create function inspection_private.invalidate_codes_on_license_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 update inspection_private.activation_codes set revoked_at=now()
 where user_id=coalesce(new.user_id,old.user_id) and redeemed_at is null and revoked_at is null;
 return null;
end;
$$;
revoke all on function inspection_private.invalidate_codes_on_license_change() from public,anon,authenticated;
create trigger inspection_invalidate_codes after insert or update or delete on public.inspection_licenses
for each row execute function inspection_private.invalidate_codes_on_license_change();

create function public.inspection_admin_issue_code(p_user_id uuid,p_plan text,p_duration_days integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_code text; v_id uuid; v_until timestamptz; v_role text;
begin
 if auth.uid() is null or not public.inspection_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_plan is null or p_plan not in ('trial','monthly','yearly','lifetime','custom') or
    (p_plan='lifetime' and p_duration_days is not null) or
    (p_plan<>'lifetime' and (p_duration_days is null or p_duration_days not between 1 and 3650))
 then raise exception 'Invalid plan or duration'; end if;
 perform 1 from auth.users where id=p_user_id and email_confirmed_at is not null for update;
 if not found then raise exception 'Confirmed customer account required'; end if;
 select role into v_role from public.inspection_licenses where user_id=p_user_id for update;
 if p_user_id=auth.uid() or v_role='admin' then raise exception 'Cannot issue code for administrator'; end if;
 update inspection_private.activation_codes set revoked_at=now() where user_id=p_user_id and redeemed_at is null and revoked_at is null;
 v_code:='TIP-'||upper(replace(gen_random_uuid()::text,'-',''));
 insert into inspection_private.activation_codes(user_id,code_hash,plan,duration_days)
 values(p_user_id,pg_catalog.sha256(pg_catalog.convert_to(v_code,'UTF8')),p_plan,p_duration_days)
 returning id,redeem_by into v_id,v_until;
 insert into public.inspection_license_audit(actor_id,customer_id,action,new_state)
 values(auth.uid(),p_user_id,'issue_code',jsonb_build_object('code_id',v_id,'plan',p_plan,'duration_days',p_duration_days,'redeem_by',v_until));
 return jsonb_build_object('code',v_code,'redeem_by',v_until,'plan',p_plan,'duration_days',p_duration_days);
end;
$$;
revoke all on function public.inspection_admin_issue_code(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.inspection_admin_issue_code(uuid,text,integer) to authenticated;

create function public.inspection_admin_revoke_codes(p_user_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare n integer;
begin
 if auth.uid() is null or not public.inspection_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 perform 1 from auth.users where id=p_user_id for update;
 update inspection_private.activation_codes set revoked_at=now() where user_id=p_user_id and redeemed_at is null and revoked_at is null;
 get diagnostics n=row_count;
 insert into public.inspection_license_audit(actor_id,customer_id,action,new_state) values(auth.uid(),p_user_id,'revoke_codes',jsonb_build_object('count',n));
 return n;
end;
$$;
revoke all on function public.inspection_admin_revoke_codes(uuid) from public,anon,authenticated;
grant execute on function public.inspection_admin_revoke_codes(uuid) to authenticated;

create function public.inspection_redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_code inspection_private.activation_codes; v_old public.inspection_licenses; v_new public.inspection_licenses; v_expiry timestamptz;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_code is null or upper(btrim(p_code)) !~ '^TIP-[0-9A-F]{32}$' then raise exception 'Invalid or unavailable activation code'; end if;
 perform 1 from auth.users where id=v_user and email_confirmed_at is not null for update;
 if not found then raise exception 'Invalid or unavailable activation code'; end if;
 select * into v_old from public.inspection_licenses where user_id=v_user for update;
 if v_old.role='admin' then raise exception 'Invalid or unavailable activation code'; end if;
 select * into v_code from inspection_private.activation_codes where user_id=v_user
 and code_hash=pg_catalog.sha256(pg_catalog.convert_to(upper(btrim(p_code)),'UTF8'))
 and redeemed_at is null and revoked_at is null and redeem_by>now() for update;
 if not found then raise exception 'Invalid or unavailable activation code'; end if;
 if v_code.plan<>'lifetime' then v_expiry:=now()+make_interval(days=>v_code.duration_days); end if;
 update inspection_private.activation_codes set redeemed_at=now() where id=v_code.id;
 insert into public.inspection_licenses(user_id,display_name,role,plan,active,expires_at)
 values(v_user,coalesce(v_old.display_name,''),'customer',v_code.plan,true,v_expiry)
 on conflict(user_id) do update set plan=excluded.plan,active=true,expires_at=excluded.expires_at,updated_at=now()
 where public.inspection_licenses.role='customer' returning * into v_new;
 if v_new.user_id is null then raise exception 'Invalid or unavailable activation code'; end if;
 insert into public.inspection_license_audit(actor_id,customer_id,action,previous_state,new_state)
 values(v_user,v_user,'redeem_code',to_jsonb(v_old),to_jsonb(v_new));
 return jsonb_build_object('plan',v_new.plan,'expires_at',v_new.expires_at);
end;
$$;
revoke all on function public.inspection_redeem_code(text) from public,anon,authenticated;
grant execute on function public.inspection_redeem_code(text) to authenticated;
