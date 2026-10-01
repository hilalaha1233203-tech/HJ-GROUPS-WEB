create index if not exists user_activity_book_id_created_at_idx on public.user_activity (book_id, created_at);
create index if not exists user_activity_video_story_id_created_at_idx on public.user_activity (video_story_id, created_at);
create index if not exists user_activity_video_episode_id_created_at_idx on public.user_activity (video_episode_id, created_at);
