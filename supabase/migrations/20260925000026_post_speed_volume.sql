-- Two more edits a clip can carry without being re-encoded: how fast it
-- plays (0.5 is half speed, 2 is double; empty means normal) and how loud
-- its own sound is (0 to 1; empty means full; silence is the muted flag).
-- Safe to run more than once.
alter table public.posts
  add column if not exists speed numeric check (speed is null or (speed > 0 and speed <= 4)),
  add column if not exists volume numeric check (volume is null or (volume >= 0 and volume <= 1));
