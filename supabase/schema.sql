-- MiniCrew Supabase schema (anonymous-access demo mode)
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(trim(name)) between 1 and 120),
    description text,
    members_count integer not null default 0 check (members_count >= 0),
    start_date date,
    end_date date,
    is_favorite boolean not null default false,
    category text not null default '미분류',
    theme_color text not null default '#B95D69' check (theme_color ~* '^#(?:[0-9a-f]{3}){1,2}$'),
    tags text[] not null default '{}',
    visibility text not null default 'private' check (visibility in ('private', 'public')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint projects_date_range check (start_date is null or end_date is null or start_date <= end_date)
);

create table if not exists public.user_profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    email text not null unique,
    full_name text not null default '',
    nickname text not null check (char_length(trim(nickname)) between 1 and 30),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    display_name text not null check (char_length(trim(display_name)) between 1 and 60),
    email text,
    role text not null default 'member' check (role in ('leader', 'member')),
    created_at timestamptz not null default now(),
    unique (project_id, display_name),
    unique (id, project_id)
);

create table if not exists public.project_items (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    item_type text not null check (item_type in ('TASK', 'POST')),
    title text not null check (char_length(trim(title)) between 1 and 200),
    content text not null check (char_length(trim(content)) between 1 and 5000),
    status text check (status in ('REQUEST', 'PROGRESS', 'FEEDBACK', 'REVIEW', 'DONE', 'HOLD', 'ISSUE') or status is null),
    priority text check (priority in ('URGENT', 'HIGH', 'NORMAL', 'LOW') or priority is null),
    progress integer check (progress between 0 and 100 or progress is null),
    category text not null default 'PLANNING',
    start_date date,
    end_date date,
    author_name text not null default '익명',
    comment_count integer not null default 0 check (comment_count >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint project_items_date_range check (start_date is null or end_date is null or start_date <= end_date),
    unique (id, project_id)
);

create table if not exists public.project_item_assignees (
    project_id uuid not null,
    item_id uuid not null,
    member_id uuid not null,
    created_at timestamptz not null default now(),
    primary key (item_id, member_id),
    constraint assignees_item_fk foreign key (item_id, project_id)
        references public.project_items(id, project_id) on delete cascade,
    constraint assignees_member_fk foreign key (member_id, project_id)
        references public.project_members(id, project_id) on delete cascade
);

create table if not exists public.project_invitations (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    invitee_name text not null check (char_length(trim(invitee_name)) between 1 and 60),
    invitee_email text not null check (char_length(trim(invitee_email)) between 5 and 320),
    role text not null default 'member' check (role in ('leader', 'member')),
    status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELED', 'EXPIRED')),
    message text,
    invited_by_name text not null default '관리자',
    created_at timestamptz not null default now(),
    responded_at timestamptz
);

create table if not exists public.project_join_requests (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    requester_name text not null check (char_length(trim(requester_name)) between 1 and 60),
    requester_email text not null check (char_length(trim(requester_email)) between 5 and 320),
    message text,
    status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED')),
    reviewed_by_name text,
    created_at timestamptz not null default now(),
    reviewed_at timestamptz
);

alter table public.project_members add column if not exists email text;
alter table public.project_members add column if not exists role text not null default 'member';

create index if not exists idx_projects_created_at on public.projects (created_at desc);
create unique index if not exists idx_user_profiles_user_id on public.user_profiles (user_id);
create index if not exists idx_project_members_project_id on public.project_members (project_id);
create unique index if not exists idx_project_members_unique_email_per_project on public.project_members (project_id, lower(email)) where email is not null;
create index if not exists idx_project_items_project_id_created_at on public.project_items (project_id, created_at desc);
create index if not exists idx_project_items_status on public.project_items (status);
create index if not exists idx_project_item_assignees_project_id on public.project_item_assignees (project_id);
create index if not exists idx_project_invitations_project_id on public.project_invitations (project_id, created_at desc);
create unique index if not exists idx_project_invitations_pending_unique_email on public.project_invitations (project_id, lower(invitee_email)) where status = 'PENDING';
create index if not exists idx_project_join_requests_project_id on public.project_join_requests (project_id, created_at desc);
create unique index if not exists idx_project_join_requests_pending_unique_email on public.project_join_requests (project_id, lower(requester_email)) where status = 'PENDING';

create or replace function public.sync_project_members_count()
returns trigger
language plpgsql
as $$
declare
    target_project_id uuid;
begin
    target_project_id := coalesce(new.project_id, old.project_id);

    update public.projects
    set members_count = (
        select count(*)
        from public.project_members pm
        where pm.project_id = target_project_id
    )
    where id = target_project_id;

    return null;
end;
$$;

drop trigger if exists trg_projects_set_updated_at on public.projects;
create trigger trg_projects_set_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

drop trigger if exists trg_project_items_set_updated_at on public.project_items;
create trigger trg_project_items_set_updated_at
before update on public.project_items
for each row
execute function public.set_updated_at();

drop trigger if exists trg_project_members_sync_count_insert on public.project_members;
create trigger trg_project_members_sync_count_insert
after insert on public.project_members
for each row
execute function public.sync_project_members_count();

drop trigger if exists trg_project_members_sync_count_delete on public.project_members;
create trigger trg_project_members_sync_count_delete
after delete on public.project_members
for each row
execute function public.sync_project_members_count();

drop trigger if exists trg_project_members_sync_count_update on public.project_members;
create trigger trg_project_members_sync_count_update
after update of project_id on public.project_members
for each row
execute function public.sync_project_members_count();

drop trigger if exists trg_user_profiles_set_updated_at on public.user_profiles;
create trigger trg_user_profiles_set_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.user_profiles enable row level security;
alter table public.project_members enable row level security;
alter table public.project_items enable row level security;
alter table public.project_item_assignees enable row level security;
alter table public.project_invitations enable row level security;
alter table public.project_join_requests enable row level security;

-- Demo mode: allow anon/authenticated full CRUD.
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to anon, authenticated using (true);
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to anon, authenticated with check (true);
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to anon, authenticated using (true) with check (true);
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to anon, authenticated using (true);

drop policy if exists user_profiles_read on public.user_profiles;
create policy user_profiles_read on public.user_profiles for select to anon, authenticated using (true);
drop policy if exists user_profiles_insert on public.user_profiles;
create policy user_profiles_insert on public.user_profiles for insert to anon, authenticated with check (true);
drop policy if exists user_profiles_update on public.user_profiles;
create policy user_profiles_update on public.user_profiles for update to anon, authenticated using (true) with check (true);
drop policy if exists user_profiles_delete on public.user_profiles;
create policy user_profiles_delete on public.user_profiles for delete to anon, authenticated using (true);

drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members for select to anon, authenticated using (true);
drop policy if exists project_members_insert on public.project_members;
create policy project_members_insert on public.project_members for insert to anon, authenticated with check (true);
drop policy if exists project_members_update on public.project_members;
create policy project_members_update on public.project_members for update to anon, authenticated using (true) with check (true);
drop policy if exists project_members_delete on public.project_members;
create policy project_members_delete on public.project_members for delete to anon, authenticated using (true);

drop policy if exists project_items_read on public.project_items;
create policy project_items_read on public.project_items for select to anon, authenticated using (true);
drop policy if exists project_items_insert on public.project_items;
create policy project_items_insert on public.project_items for insert to anon, authenticated with check (true);
drop policy if exists project_items_update on public.project_items;
create policy project_items_update on public.project_items for update to anon, authenticated using (true) with check (true);
drop policy if exists project_items_delete on public.project_items;
create policy project_items_delete on public.project_items for delete to anon, authenticated using (true);

drop policy if exists project_item_assignees_read on public.project_item_assignees;
create policy project_item_assignees_read on public.project_item_assignees for select to anon, authenticated using (true);
drop policy if exists project_item_assignees_insert on public.project_item_assignees;
create policy project_item_assignees_insert on public.project_item_assignees for insert to anon, authenticated with check (true);
drop policy if exists project_item_assignees_update on public.project_item_assignees;
create policy project_item_assignees_update on public.project_item_assignees for update to anon, authenticated using (true) with check (true);
drop policy if exists project_item_assignees_delete on public.project_item_assignees;
create policy project_item_assignees_delete on public.project_item_assignees for delete to anon, authenticated using (true);

drop policy if exists project_invitations_read on public.project_invitations;
create policy project_invitations_read on public.project_invitations for select to anon, authenticated using (true);
drop policy if exists project_invitations_insert on public.project_invitations;
create policy project_invitations_insert on public.project_invitations for insert to anon, authenticated with check (true);
drop policy if exists project_invitations_update on public.project_invitations;
create policy project_invitations_update on public.project_invitations for update to anon, authenticated using (true) with check (true);
drop policy if exists project_invitations_delete on public.project_invitations;
create policy project_invitations_delete on public.project_invitations for delete to anon, authenticated using (true);

drop policy if exists project_join_requests_read on public.project_join_requests;
create policy project_join_requests_read on public.project_join_requests for select to anon, authenticated using (true);
drop policy if exists project_join_requests_insert on public.project_join_requests;
create policy project_join_requests_insert on public.project_join_requests for insert to anon, authenticated with check (true);
drop policy if exists project_join_requests_update on public.project_join_requests;
create policy project_join_requests_update on public.project_join_requests for update to anon, authenticated using (true) with check (true);
drop policy if exists project_join_requests_delete on public.project_join_requests;
create policy project_join_requests_delete on public.project_join_requests for delete to anon, authenticated using (true);
