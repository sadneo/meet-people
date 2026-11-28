select p.last_beat, d.seconds, d.profile_opens
from usage_private.presence p
join usage_private.daily d on d.user_id = p.user_id and d.day = (now() at time zone 'utc')::date
where p.user_id = (select id from auth.users where email = 'bob@test.dev');