-- Own-license lookups now obey the caller's existing row-level security.
alter function public.inspection_has_access() security invoker;
alter function public.inspection_is_admin() security invoker;

-- Internal per-account quota. No buyer access to underlying counter.
create table if not exists inspection_private.ai_report_rate (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null,
 requests integer not null check (requests between 1 and 30)
);
alter table inspection_private.ai_report_rate enable row level security;
revoke all on inspection_private.ai_report_rate from public, anon, authenticated;
create or replace function public.inspection_ai_report_take_slot()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_window timestamptz := pg_catalog.date_trunc('minute',pg_catalog.clock_timestamp()); v_count integer;
begin
 if v_uid is null or not public.inspection_has_access() then return false; end if;
 insert into inspection_private.ai_report_rate as r(user_id,window_start,requests)
 values(v_uid,v_window,1)
 on conflict(user_id) do update set
 window_start=excluded.window_start,
 requests=case when r.window_start < excluded.window_start then 1 else r.requests+1 end
 where r.window_start < excluded.window_start or (r.window_start=excluded.window_start and r.requests<30)
 returning requests into v_count;
 return v_count is not null;
end;
$$;
revoke all on function public.inspection_ai_report_take_slot() from public, anon;
grant execute on function public.inspection_ai_report_take_slot() to authenticated;