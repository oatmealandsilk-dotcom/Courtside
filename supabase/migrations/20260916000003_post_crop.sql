-- A clip can be cropped without re-encoding: the feed zooms and shifts the
-- picture inside its frame. {"scale": 1.3, "x": 0.05, "y": 0} — x and y are
-- fractions of the frame's width and height.
alter table public.posts add column if not exists crop jsonb;
