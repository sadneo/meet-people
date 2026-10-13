select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

select username, display_name, shared_interests, mutual_count, score
from get_suggested_connections(20);