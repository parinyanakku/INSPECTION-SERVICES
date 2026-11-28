create table inspection_private.google_desktop_config (
 singleton boolean primary key default true check(singleton),
 client_id text not null check(client_id ~ '^386487455938-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$' and length(client_id)<=256),
 client_secret text not null check(length(client_secret) between 1 and 256 and client_secret ~ '^[A-Za-z0-9_-]+$'),
 updated_at timestamptz not null default now()
);
alter table inspection_private.google_desktop_config enable row level security;
revoke all on inspection_private.google_desktop_config from public,anon,authenticated;
create function public.inspection_google_desktop_config()
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.inspection_has_access() then raise insufficient_privilege; end if;
 return (select jsonb_build_object('client_id',client_id,'client_secret',client_secret) from inspection_private.google_desktop_config where singleton);
end;$$;
create function public.inspection_set_google_desktop_config(p_client_id text,p_client_secret text)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.inspection_is_admin() then raise insufficient_privilege; end if;
 if p_client_id='386487455938-nda2mj55c5f3cdr8pvqmq4pu4o775fv2.apps.googleusercontent.com' then raise exception 'Desktop client required'; end if;
 insert into inspection_private.google_desktop_config(singleton,client_id,client_secret) values(true,p_client_id,p_client_secret)
 on conflict(singleton) do update set client_id=excluded.client_id,client_secret=excluded.client_secret,updated_at=now();
 return true;
end;$$;
revoke all on function public.inspection_google_desktop_config(),public.inspection_set_google_desktop_config(text,text) from public,anon;
grant execute on function public.inspection_google_desktop_config(),public.inspection_set_google_desktop_config(text,text) to authenticated;