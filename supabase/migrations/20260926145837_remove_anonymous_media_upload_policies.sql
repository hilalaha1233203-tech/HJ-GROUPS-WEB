-- HJ GROUPS: anonymous clients must never write to Storage.
-- Remove any legacy anonymous/public INSERT/UPDATE/DELETE/ALL policies on storage.objects.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        'anon' = any(roles)
        or 'public' = any(roles)
      )
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end $$;