-- HJ GROUPS: refine analytics aggregates and keep actual ad unlocks separate from ad flow events.

create or replace function public.get_hj_admin_analytics(p_start_at timestamptz default null, p_end_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := coalesce(p_start_at, 'epoch'::timestamptz);
  v_end timestamptz := coalesce(p_end_at, 'infinity'::timestamptz);
  v_result jsonb;
begin
  if not public.is_hj_admin() then raise exception 'forbidden'; end if;

  with activity as (
    select * from public.user_activity
    where created_at >= v_start and created_at < v_end
  ),
  overview as (
    select
      (select count(*) from auth.users where created_at >= v_start and created_at < v_end) registered_users,
      (select count(distinct user_id) from activity where user_id is not null) active_logged_in_users,
      (select count(distinct session_id) from activity where session_id is not null) active_anonymous_sessions,
      (select count(*) from activity where event_type='story_view') story_views,
      (select count(*) from activity where event_type='episode_play') episode_plays,
      (select count(distinct user_id) from activity where event_type='episode_play' and user_id is not null) logged_in_episode_viewers,
      (select count(distinct session_id) from activity where event_type='episode_play' and session_id is not null) anonymous_episode_viewers,
      (select count(*) from activity where event_type='episode_complete') episode_completions,
      (select count(*) from activity where event_type='ad_unlock_started') ad_unlock_starts,
      (select count(*) from activity where event_type='ad_unlock_completed') ad_unlock_completions,
      (select count(*) from public.ad_unlocks where created_at >= v_start and created_at < v_end) actual_ad_unlocks,
      (select count(*) from public.purchases where created_at >= v_start and created_at < v_end) premium_vip_accesses
  ),
  story_rows as (
    select s.id,s.title,
      count(a.id) filter(where a.event_type='story_view') story_views,
      count(distinct a.user_id) filter(where a.event_type='story_view' and a.user_id is not null) logged_in_unique_viewers,
      count(distinct a.session_id) filter(where a.event_type='story_view' and a.session_id is not null) anonymous_unique_viewers,
      count(a.id) filter(where a.event_type='episode_play') episode_plays,
      count(distinct a.user_id) filter(where a.event_type='episode_play' and a.user_id is not null) logged_in_episode_viewers,
      count(distinct a.session_id) filter(where a.event_type='episode_play' and a.session_id is not null) anonymous_episode_viewers,
      count(a.id) filter(where a.event_type='episode_complete') episode_completions,
      count(a.id) filter(where a.event_type='ad_unlock_started') ad_unlock_starts,
      count(a.id) filter(where a.event_type='ad_unlock_completed') ad_unlock_completions,
      (select count(*) from public.ad_unlocks u where u.created_at >= v_start and u.created_at < v_end and (u.story_id=s.id or (u.content_type='audio' and u.content_id in (select e.id from public.episodes e where e.story_id=s.id)))) actual_ad_unlocks
    from public.stories s left join activity a on a.story_id=s.id
    group by s.id,s.title
  ),
  episode_rows as (
    select e.id,e.story_id,e.episode_number,e.title,
      count(a.id) filter(where a.event_type='episode_play') total_plays,
      count(distinct a.user_id) filter(where a.event_type='episode_play' and a.user_id is not null) logged_in_unique_viewers,
      count(distinct a.session_id) filter(where a.event_type='episode_play' and a.session_id is not null) anonymous_unique_viewers,
      count(a.id) filter(where a.event_type='episode_complete') completed_plays,
      count(a.id) filter(where a.event_type='ad_unlock_started') ad_unlock_starts,
      count(a.id) filter(where a.event_type='ad_unlock_completed') ad_unlock_completions,
      (select count(*) from public.ad_unlocks u where u.created_at >= v_start and u.created_at < v_end and (
        (u.content_type='audio' and u.content_id=e.id)
        or
        (u.content_type='audio' and u.story_id=e.story_id and u.start_episode_number is not null and u.end_episode_number is not null and e.episode_number between u.start_episode_number and u.end_episode_number)
      )) actual_unlocks
    from public.episodes e left join activity a on a.episode_id=e.id
    group by e.id,e.story_id,e.episode_number,e.title
  ),
  user_rows as (
    select a.user_id,max(a.created_at) last_activity,
      count(*) filter(where a.event_type='episode_play') plays,
      count(*) filter(where a.event_type='episode_complete') completed_episodes,
      count(*) filter(where a.event_type='ad_unlock_completed') ad_unlocks,
      coalesce(p.full_name,'') full_name
    from activity a left join public.profiles p on p.id=a.user_id
    where a.user_id is not null
    group by a.user_id,p.full_name
    order by max(a.created_at) desc limit 250
  ),
  anonymous_rows as (
    select right(a.session_id,8) session_suffix,max(a.created_at) last_activity,
      count(*) filter(where a.event_type='episode_play') plays,
      count(*) filter(where a.event_type='ad_unlock_completed') unlocks
    from activity a where a.session_id is not null
    group by a.session_id
    order by max(a.created_at) desc limit 250
  ),
  ad_activity as (
    select a.id,a.event_type,a.user_id,right(a.session_id,8) session_suffix,a.story_id,a.episode_id,a.created_at
    from activity a
    where a.event_type in('ad_unlock_started','ad_unlock_completed')
    order by a.created_at desc limit 250
  ),
  actual_unlock_rows as (
    select u.id,u.user_id,u.content_type,u.content_id,u.story_id,u.start_episode_number,u.end_episode_number,u.created_at,u.expires_at
    from public.ad_unlocks u
    where u.created_at >= v_start and u.created_at < v_end
    order by u.created_at desc limit 250
  )
  select jsonb_build_object(
    'overview',(select to_jsonb(overview) from overview),
    'stories',coalesce((select jsonb_agg(to_jsonb(story_rows) order by story_rows.title) from story_rows),'[]'::jsonb),
    'episodes',coalesce((select jsonb_agg(to_jsonb(episode_rows) order by episode_rows.story_id,episode_rows.episode_number) from episode_rows),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(to_jsonb(user_rows)) from user_rows),'[]'::jsonb),
    'anonymous_sessions',coalesce((select jsonb_agg(to_jsonb(anonymous_rows)) from anonymous_rows),'[]'::jsonb),
    'ad_activity',coalesce((select jsonb_agg(to_jsonb(ad_activity)) from ad_activity),'[]'::jsonb),
    'actual_unlocks',coalesce((select jsonb_agg(to_jsonb(actual_unlock_rows)) from actual_unlock_rows),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.get_hj_admin_analytics(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_hj_admin_analytics(timestamptz,timestamptz) to authenticated;
