create function public.inspection_admin_prepare_delete(p_user_id uuid,p_confirm_email text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare target_email text; old_row public.inspection_licenses; new_row public.inspection_licenses;
begin
 if auth.uid() is null or not public.inspection_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_user_id is null or p_user_id=auth.uid() then raise exception 'Cannot delete administrator' using errcode='42501'; end if;
 select email into target_email from auth.users where id=p_user_id for update;
 if not found or target_email is null or p_confirm_email is null or lower(btrim(p_confirm_email))<>lower(target_email) then raise exception 'Account confirmation mismatch'; end if;
 select * into old_row from public.inspection_licenses where user_id=p_user_id for update;
 if old_row.role='admin' then raise exception 'Cannot delete administrator' using errcode='42501'; end if;
 insert into public.inspection_licenses(user_id,display_name,role,plan,active,expires_at)
 values(p_user_id,'','customer','trial',false,now())
 on conflict(user_id) do update set active=false,updated_at=now()
 where public.inspection_licenses.role='customer'
 returning * into new_row;
 if new_row.user_id is null then raise exception 'Cannot delete administrator' using errcode='42501'; end if;
 update inspection_private.activation_codes set revoked_at=now()
 where user_id=p_user_id and redeemed_at is null and revoked_at is null;
 insert into public.inspection_license_audit(actor_id,customer_id,action,previous_state,new_state)
 values(auth.uid(),p_user_id,'delete_requested',to_jsonb(old_row),to_jsonb(new_row));
 return true;
end;
$$;
revoke all on function public.inspection_admin_prepare_delete(uuid,text) from public,anon,authenticated;
grant execute on function public.inspection_admin_prepare_delete(uuid,text) to authenticated;