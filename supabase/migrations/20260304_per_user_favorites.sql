-- Per-user favorites: project_favorites junction table
-- Replaces the shared is_favorite column on projects table

-- 1. Create project_favorites table
create table if not exists public.project_favorites (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    project_id uuid not null references public.projects(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (user_id, project_id)
);

-- 2. Index for fast lookups
create index if not exists idx_project_favorites_user_id on public.project_favorites(user_id);
create index if not exists idx_project_favorites_project_id on public.project_favorites(project_id);

-- 3. RLS policies
alter table public.project_favorites enable row level security;

create policy "Users can view own favorites"
    on public.project_favorites for select
    using (auth.uid() = user_id);

create policy "Users can add own favorites"
    on public.project_favorites for insert
    with check (auth.uid() = user_id);

create policy "Users can remove own favorites"
    on public.project_favorites for delete
    using (auth.uid() = user_id);

-- 4. Grant service_role full access
grant all on public.project_favorites to service_role;
grant select, insert, delete on public.project_favorites to authenticated;
