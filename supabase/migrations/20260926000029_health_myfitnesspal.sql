-- MyFitnessPal joins the sources a person can connect. Safe to run more than once.
alter table public.health_connections drop constraint if exists health_connections_provider_check;
alter table public.health_connections add constraint health_connections_provider_check check (provider in ('apple-health', 'whoop', 'cronometer', 'myfitnesspal'));
