create or replace function public.get_hj_admin_analytics_v2(
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_grouping text default 'day'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_start timestamptz := coalesce(p_start_at, 'epoch'::timestamptz);
  v_end timestamptz := coalesce(p_end_at, 'infinity'::timestamptz);
  v_grouping text := case when p_grouping in ('day','week','month') then p_grouping else 'day' end;
  v_result jsonb;
  v_timeline jsonb;
begin
  v_result := public.get_hj_admin_analytics(v_start, v_end);
  with activity as (
    select * from public.user_activity where created_at >= v_start and created_at < v_end
  ),
  buckets as (
    select
      case v_grouping
        when 'month' then date_trunc('month', created_at)
        when 'week' then date_trunc('week', created_at)
        else date_trunc('day', created_at)
      end as bucket,
      count(distinct user_id) filter (where user_id is not null) active_users,
      count(distinct session_id) filter (where session_id is not null) anonymous_sessions,
      count(*) filter (where event_type='story_view') story_views,
      count(*) filter (where event_type='episode_play') episode_plays,
      count(*) filter (where event_type='episode_complete') episode_completions,
      count(*) filter (where event_type='ad_unlock_completed') ad_unlocks,
      count(*) filter (where event_type='shortener_unlock_completed') shortener_unlocks
    from activity group by 1
  ),
  new_users as (
    select
      case v_grouping
        when 'month' then date_trunc('month', created_at)
        when 'week' then date_trunc('week', created_at)
        else date_trunc('day', created_at)
      end bucket,
      count(*) new_users
    from auth.users
    where created_at >= v_start and created_at < v_end
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket',to_char(b.bucket,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'active_users',b.active_users,
    'new_users',coalesce(n.new_users,0),
    'returning_users',greatest(b.active_users-coalesce(n.new_users,0),0),
    'anonymous_sessions',b.anonymous_sessions,
    'story_views',b.story_views,
    'episode_plays',b.episode_plays,
    'episode_completions',b.episode_completions,
    'ad_unlocks',b.ad_unlocks,
    'shortener_unlocks',b.shortener_unlocks
  ) order by b.bucket),'[]'::jsonb) into v_timeline
  from buckets b left join new_users n on n.bucket=b.bucket;

  return jsonb_set(v_result,'{timeline}',v_timeline,true);
end;
$function$;

revoke execute on function public.get_hj_admin_analytics_v2(timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.get_hj_admin_analytics_v2(timestamptz,timestamptz,text) to service_role;
