-- Scheduled jobs (pg_cron runs in UTC; WAT = UTC+1).

select cron.schedule('process-queues', '* * * * *', $$ select ops.invoke_worker() $$);
select cron.schedule('refresh-scorecard', '0 1 * * *', $$ refresh materialized view concurrently public_read.scorecard $$);
select cron.schedule('sweep-unconfirmed', '0 2 * * *', $$ select core.sweep_unconfirmed() $$);
select cron.schedule('purge-expired', '0 3 * * *', $$ select core.purge_expired() $$);
