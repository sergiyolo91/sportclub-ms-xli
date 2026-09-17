create or replace function public.set_group_member_role(
  p_group_id uuid,
  p_user_id uuid,
  p_role public.member_role
)
returns public.member_role
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_creator_id uuid;
  v_current_role public.member_role;
begin
  if (select auth.uid()) is null then
    raise exception 'Nicht angemeldet';
  end if;

  if not private.is_group_admin(p_group_id) then
    raise exception 'Nur Gruppen-Admins dürfen Rollen ändern';
  end if;

  select created_by into v_creator_id
  from public.groups
  where id = p_group_id;

  if v_creator_id is null then
    raise exception 'Gruppe nicht gefunden';
  end if;

  if p_user_id = v_creator_id then
    raise exception 'Die Rolle des Gruppenerstellers kann nicht geändert werden';
  end if;

  select role into v_current_role
  from public.group_members
  where group_id = p_group_id and user_id = p_user_id
  for update;

  if v_current_role is null then
    raise exception 'Mitglied nicht gefunden';
  end if;

  update public.group_members
  set role = p_role
  where group_id = p_group_id and user_id = p_user_id;

  return p_role;
end;
$function$;

revoke execute on function public.set_group_member_role(uuid, uuid, public.member_role) from public, anon;
grant execute on function public.set_group_member_role(uuid, uuid, public.member_role) to authenticated;
