create table inspection_private.native_device_challenges (
 user_id uuid primary key references auth.users(id) on delete cascade,
 nonce text not null check (nonce ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 issued_at timestamptz not null default now()
);
create table inspection_private.native_device_proofs (
 user_id uuid not null references auth.users(id) on delete cascade,
 fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz not null default now(),
 primary key(user_id,fingerprint)
);
alter table inspection_private.native_device_challenges enable row level security;
alter table inspection_private.native_device_proofs enable row level security;
revoke all on inspection_private.native_device_challenges, inspection_private.native_device_proofs from public,anon,authenticated;
create function public.inspection_native_challenge(p_uid uuid,p_nonce text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare n integer;
begin
 if not exists(select 1 from public.inspection_licenses where user_id=p_uid and role='admin' and active and (expires_at is null or expires_at>now())) then return false; end if;
 insert into inspection_private.native_device_challenges as c(user_id,nonce,expires_at,issued_at) values(p_uid,p_nonce,now()+interval '2 minutes',now())
 on conflict(user_id) do update set nonce=excluded.nonce,expires_at=excluded.expires_at,issued_at=excluded.issued_at
 where c.issued_at <= now()-interval '5 seconds';
 get diagnostics n=row_count;return n=1;
end;$$;
create function public.inspection_native_record_proof(p_uid uuid,p_nonce text,p_fingerprint text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare n integer;
begin
 if not exists(select 1 from public.inspection_licenses where user_id=p_uid and role='admin' and active and (expires_at is null or expires_at>now())) then return false; end if;
 delete from inspection_private.native_device_challenges where user_id=p_uid and nonce=p_nonce and expires_at>now();
 get diagnostics n=row_count;
 if n<>1 then return false; end if;
 if not exists(select 1 from inspection_private.native_device_proofs where user_id=p_uid and fingerprint=p_fingerprint)
 and (select count(*) from inspection_private.native_device_proofs where user_id=p_uid)>=20 then return false;end if;
 insert into inspection_private.native_device_proofs(user_id,fingerprint) values(p_uid,p_fingerprint)
 on conflict(user_id,fingerprint) do update set verified_at=excluded.verified_at;
 return true;
end;$$;
revoke all on function public.inspection_native_challenge(uuid,text),public.inspection_native_record_proof(uuid,text,text) from public,anon,authenticated;
grant execute on function public.inspection_native_challenge(uuid,text),public.inspection_native_record_proof(uuid,text,text) to service_role;