-- The topic leaderboards (worker/endless.ts topicLeaderboard) read endless_progress by topic; its
-- primary key starts with user_id, so a topic's rows need their own index.
create index endless_progress_topic on endless_progress (topic_id, correct desc);
