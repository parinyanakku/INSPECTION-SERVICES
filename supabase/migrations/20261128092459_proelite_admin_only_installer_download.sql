create or replace function public.inspection_can_download()
returns boolean language sql stable security invoker set search_path = ''
as $$ select public.inspection_is_admin(); $$;
revoke all on function public.inspection_can_download() from public, anon;
grant execute on function public.inspection_can_download() to authenticated;
