-- SECURITY INVOKER reads only the caller's license under the existing own-row policy.
create function public.inspection_can_download()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.inspection_licenses
    where user_id = (select auth.uid()) and active
      and (expires_at is null or expires_at > now())
      and (role = 'admin' or plan in ('monthly','yearly','lifetime','custom'))
  );
$$;
revoke all on function public.inspection_can_download() from public, anon;
grant execute on function public.inspection_can_download() to authenticated;

insert into storage.buckets (id, name, public)
values ('proelite-installers', 'proelite-installers', false);

create policy "Buyers read approved ProElite installers" on storage.objects
for select to authenticated using (
  bucket_id = 'proelite-installers'
  and name in ('approved/ProElite-Inspection.msi', 'approved/ProElite-Inspection.apk')
  and storage.allow_any_operation(array['object.list','object.get_authenticated'])
  and (select public.inspection_can_download())
);
