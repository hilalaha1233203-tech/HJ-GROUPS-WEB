-- HJ GROUPS: optimized/admin RLS predicate shared by production tables.

create or replace function public.is_hj_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $func$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = lower('hilalaha1233203@gmail.com')
$func$;

revoke all on function public.is_hj_admin() from public;
grant execute on function public.is_hj_admin() to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stories' and policyname='Admin insert stories') then
    create policy "Admin insert stories" on public.stories for insert to authenticated
      with check ((select public.is_hj_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stories' and policyname='Admin update stories') then
    create policy "Admin update stories" on public.stories for update to authenticated
      using ((select public.is_hj_admin())) with check ((select public.is_hj_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stories' and policyname='Admin delete stories') then
    create policy "Admin delete stories" on public.stories for delete to authenticated
      using ((select public.is_hj_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='episodes' and policyname='Admin insert episodes') then
    create policy "Admin insert episodes" on public.episodes for insert to authenticated
      with check ((select public.is_hj_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='episodes' and policyname='Admin update episodes') then
    create policy "Admin update episodes" on public.episodes for update to authenticated
      using ((select public.is_hj_admin())) with check ((select public.is_hj_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='episodes' and policyname='Admin delete episodes') then
    create policy "Admin delete episodes" on public.episodes for delete to authenticated
      using ((select public.is_hj_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='books' and policyname='Admin insert books') then
    create policy "Admin insert books" on public.books for insert to authenticated
      with check ((select public.is_hj_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='books' and policyname='Admin update books') then
    create policy "Admin update books" on public.books for update to authenticated
      using ((select public.is_hj_admin())) with check ((select public.is_hj_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='books' and policyname='Admin delete books') then
    create policy "Admin delete books" on public.books for delete to authenticated
      using ((select public.is_hj_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_stories' and policyname='Admin insert video_stories') then
    create policy "Admin insert video_stories" on public.video_stories for insert to authenticated
      with check ((select public.is_hj_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_stories' and policyname='Admin update video_stories') then
    create policy "Admin update video_stories" on public.video_stories for update to authenticated
      using ((select public.is_hj_admin())) with check ((select public.is_hj_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_stories' and policyname='Admin delete video_stories') then
    create policy "Admin delete video_stories" on public.video_stories for delete to authenticated
      using ((select public.is_hj_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_episodes' and policyname='Admin insert video_episodes') then
    create policy "Admin insert video_episodes" on public.video_episodes for insert to authenticated
      with check ((select public.is_hj_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_episodes' and policyname='Admin update video_episodes') then
    create policy "Admin update video_episodes" on public.video_episodes for update to authenticated
      using ((select public.is_hj_admin())) with check ((select public.is_hj_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_episodes' and policyname='Admin delete video_episodes') then
    create policy "Admin delete video_episodes" on public.video_episodes for delete to authenticated
      using ((select public.is_hj_admin()));
  end if;
end $$;