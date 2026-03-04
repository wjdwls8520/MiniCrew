-- MiniCrew Supabase schema (v3.0)
-- 기존 객체를 모두 제거하고 재생성하는 버전입니다.
-- 실행 전: 프로젝트에 저장된 데이터는 완전히 초기화됩니다.

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT CREATE ON SCHEMA public TO service_role;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Utility functions
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
    select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.get_storage_usage_summary()
returns table (
    used_bytes bigint,
    soft_limit_bytes bigint,
    blocked boolean
)
language sql
stable
security definer
set search_path = public, storage
as $$
    with usage as (
        select coalesce(sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)), 0)::bigint as total_size
        from storage.objects o
        where o.bucket_id = 'minicrew-media'
    )
    select
        usage.total_size as used_bytes,
        1020054733::bigint as soft_limit_bytes,
        usage.total_size >= 1020054733::bigint as blocked
    from usage;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.projects (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(trim(name)) between 1 and 120),
    description text,
    members_count integer not null default 0 check (members_count >= 0),
    status text not null default 'REQUEST' check (status in ('REQUEST', 'PROGRESS', 'FEEDBACK', 'REVIEW', 'DONE', 'HOLD', 'ISSUE')),
    start_date date,
    end_date date,
    category text not null default '미분류',
    theme_color text not null default '#B95D69' check (theme_color ~* '^#(?:[0-9a-f]{3}){1,2}$'),
    tags text[] not null default '{}',
    visibility text not null default 'private' check (visibility in ('private', 'public')),
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint projects_date_range check (start_date is null or end_date is null or start_date <= end_date)
);

-- Per-user favorites (replaces shared is_favorite column)
create table public.project_favorites (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    project_id uuid not null references public.projects(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (user_id, project_id)
);

create table public.user_profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    email text not null unique,
    full_name text not null default '',
    nickname text not null check (char_length(trim(nickname)) between 1 and 30),
    phone_number text not null check (char_length(phone_number) between 8 and 20),
    avatar_url text,
    avatar_original_filename text,
    avatar_stored_filename text,
    avatar_storage_path text,
    avatar_size_bytes bigint check (avatar_size_bytes is null or avatar_size_bytes >= 0),
    is_admin boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.project_members (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    display_name text not null check (char_length(trim(display_name)) between 1 and 60),
    user_id uuid references auth.users(id) on delete set null,
    email text,
    role text not null default 'member' check (role in ('leader', 'member')),
    created_at timestamptz not null default now(),
    unique (project_id, display_name),
    unique (id, project_id)
);

create table public.project_items (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    item_type text not null check (item_type in ('TASK', 'POST')),
    title text not null check (char_length(trim(title)) between 1 and 200),
    content text not null check (char_length(trim(content)) between 1 and 5000),
    image_url text,
    image_original_filename text,
    image_stored_filename text,
    image_storage_path text,
    image_size_bytes bigint check (image_size_bytes is null or image_size_bytes >= 0),
    status text check (status in ('REQUEST', 'PROGRESS', 'FEEDBACK', 'REVIEW', 'DONE', 'HOLD', 'ISSUE') or status is null),
    priority text check (priority in ('URGENT', 'HIGH', 'NORMAL', 'LOW') or priority is null),
    progress integer check (progress between 0 and 100 or progress is null),
    category text not null default 'PLANNING',
    start_date date,
    end_date date,
    author_name text not null default '익명',
    author_id uuid references auth.users(id) on delete set null,
    comment_count integer not null default 0 check (comment_count >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint project_items_date_range check (start_date is null or end_date is null or start_date <= end_date),
    unique (id, project_id)
);

create table public.project_item_assignees (
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

create table public.project_item_attachments (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null,
    item_id uuid not null,
    file_url text not null,
    original_filename text not null,
    stored_filename text not null,
    storage_path text not null unique,
    file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
    mime_type text not null,
    created_at timestamptz not null default now(),
    constraint project_item_attachments_item_fk foreign key (item_id, project_id)
        references public.project_items(id, project_id) on delete cascade
);

create table public.project_item_comments (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null,
    item_id uuid not null,
    parent_comment_id uuid references public.project_item_comments(id) on delete cascade,
    author_user_id uuid not null references auth.users(id) on delete cascade,
    author_name text not null check (char_length(trim(author_name)) between 1 and 60),
    body text not null check (char_length(trim(body)) between 1 and 1000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint project_item_comments_item_fk foreign key (item_id, project_id)
        references public.project_items(id, project_id) on delete cascade
);

create table public.project_invitations (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    invitee_name text not null check (char_length(trim(invitee_name)) between 1 and 60),
    invitee_email text not null check (char_length(trim(invitee_email)) between 5 and 320),
    invitee_user_id uuid references auth.users(id) on delete set null,
    inviter_user_id uuid references auth.users(id) on delete set null,
    role text not null default 'member' check (role in ('leader', 'member')),
    status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELED', 'EXPIRED')),
    message text,
    invited_by_name text not null default '관리자',
    created_at timestamptz not null default now(),
    responded_at timestamptz
);

create table public.project_join_requests (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    requester_name text not null check (char_length(trim(requester_name)) between 1 and 60),
    requester_email text not null check (char_length(trim(requester_email)) between 5 and 320),
    requester_user_id uuid references auth.users(id) on delete set null,
    message text,
    status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED')),
    reviewed_by_name text,
    reviewed_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    reviewed_at timestamptz
);

create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    recipient_user_id uuid not null references auth.users(id) on delete cascade,
    actor_user_id uuid references auth.users(id) on delete set null,
    project_id uuid references public.projects(id) on delete cascade,
    related_invitation_id uuid references public.project_invitations(id) on delete set null,
    related_request_id uuid references public.project_join_requests(id) on delete set null,
    type text not null check (
        type in (
            'PROJECT_INVITED',
            'INVITATION_ACCEPTED',
            'INVITATION_DECLINED',
            'JOIN_REQUEST_CREATED',
            'JOIN_REQUEST_APPROVED',
            'JOIN_REQUEST_REJECTED',
            'PROJECT_MEMBER_ROLE_CHANGED',
            'BOARD_TASK_CREATED',
            'BOARD_POST_CREATED',
            'BOARD_COMMENT_CREATED',
            'BOARD_REPLY_CREATED',
            'PROJECT_STATUS_CHANGED',
            'TASK_STATUS_CHANGED'
        )
    ),
    message text not null,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);

create table public.chat_rooms (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique check (char_length(trim(slug)) between 1 and 64),
    title text not null check (char_length(trim(title)) between 1 and 120),
    created_by uuid references auth.users(id) on delete set null,
    room_type text not null default 'public' check (room_type in ('public', 'direct')),
    direct_key text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.chat_room_members (
    room_id uuid not null references public.chat_rooms(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (room_id, user_id)
);

create table public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.chat_rooms(id) on delete cascade,
    sender_user_id uuid not null references auth.users(id) on delete cascade,
    sender_name text not null check (char_length(trim(sender_name)) between 1 and 60),
    body text check (body is null or char_length(trim(body)) between 1 and 1000),
    image_url text,
    image_original_filename text,
    image_stored_filename text,
    image_storage_path text,
    image_size_bytes bigint check (image_size_bytes is null or image_size_bytes >= 0),
    created_at timestamptz not null default now(),
    constraint chat_messages_body_or_image check (
        (
            body is not null
            and char_length(trim(body)) between 1 and 1000
        )
        or image_url is not null
    )
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_projects_created_at on public.projects (created_at desc);
create index idx_projects_visibility on public.projects (visibility);
create index idx_projects_created_by on public.projects (created_by);
create index idx_projects_status on public.projects (status);

create unique index idx_user_profiles_user_id on public.user_profiles (user_id);
create unique index idx_user_profiles_email_lower on public.user_profiles (lower(email));
create index idx_user_profiles_is_admin on public.user_profiles (is_admin) where is_admin = true;

create index idx_project_members_project_id on public.project_members (project_id);
create index idx_project_members_user_id on public.project_members (user_id);
create unique index idx_project_members_unique_user_per_project on public.project_members (project_id, user_id) where user_id is not null;
create unique index idx_project_members_unique_email_per_project on public.project_members (project_id, lower(email)) where email is not null;
create unique index idx_project_members_leader_per_project on public.project_members (project_id) where role = 'leader';

create index idx_project_items_project_id_created_at on public.project_items (project_id, created_at desc);
create index idx_project_items_status on public.project_items (status);

create index idx_project_item_assignees_project_id on public.project_item_assignees (project_id);
create index idx_project_item_assignees_member_id on public.project_item_assignees (member_id);
create index idx_project_item_attachments_project_item on public.project_item_attachments (project_id, item_id, created_at asc);
create index idx_project_item_comments_project_item on public.project_item_comments (project_id, item_id, created_at asc);
create index idx_project_item_comments_parent on public.project_item_comments (parent_comment_id);

create index idx_project_invitations_project_id on public.project_invitations (project_id, created_at desc);
create index idx_project_invitations_invitee_user_id on public.project_invitations (invitee_user_id);
create unique index idx_project_invitations_pending_unique_email on public.project_invitations (project_id, lower(invitee_email)) where status = 'PENDING';

create index idx_project_join_requests_project_id on public.project_join_requests (project_id, created_at desc);
create index idx_project_join_requests_requester_user_id on public.project_join_requests (requester_user_id);
create unique index idx_project_join_requests_pending_unique_email on public.project_join_requests (project_id, lower(requester_email)) where status = 'PENDING';
create unique index idx_project_join_requests_pending_unique_user on public.project_join_requests (project_id, requester_user_id) where status = 'PENDING' and requester_user_id is not null;

create index idx_notifications_recipient on public.notifications (recipient_user_id, is_read, created_at desc);

create unique index idx_chat_rooms_slug on public.chat_rooms (slug);
create unique index idx_chat_rooms_direct_key on public.chat_rooms (direct_key) where direct_key is not null;
create index idx_chat_rooms_room_type on public.chat_rooms (room_type);
create index idx_chat_room_members_user_id on public.chat_room_members (user_id);
create index idx_chat_messages_room_created_at on public.chat_messages (room_id, created_at desc);
create index idx_chat_messages_sender_user_id on public.chat_messages (sender_user_id);

-- ---------------------------------------------------------------------------
-- Access helper functions
-- ---------------------------------------------------------------------------
create or replace function public.is_system_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.user_profiles up
        where up.user_id = target_user_id
          and up.is_admin = true
    );
$$;

create or replace function public.is_project_member(
    target_project_id uuid,
    target_user_id uuid default auth.uid(),
    target_email text default public.current_user_email()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.project_members pm
        where pm.project_id = target_project_id
          and (
              (target_user_id is not null and pm.user_id = target_user_id)
              or (
                  coalesce(target_email, '') <> ''
                  and lower(coalesce(pm.email, '')) = lower(target_email)
              )
          )
    );
$$;

create or replace function public.is_project_leader(
    target_project_id uuid,
    target_user_id uuid default auth.uid(),
    target_email text default public.current_user_email()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.project_members pm
        where pm.project_id = target_project_id
          and pm.role = 'leader'
          and (
              (target_user_id is not null and pm.user_id = target_user_id)
              or (
                  coalesce(target_email, '') <> ''
                  and lower(coalesce(pm.email, '')) = lower(target_email)
              )
          )
    );
$$;

create or replace function public.can_view_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.projects p
        where p.id = target_project_id
          and (
              p.visibility = 'public'
              or p.created_by = auth.uid()
              or public.is_project_member(p.id)
              or public.is_system_admin(auth.uid())
          )
    );
$$;

create or replace function public.can_manage_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select (
        public.is_system_admin(auth.uid())
        or exists (
            select 1
            from public.projects p
            where p.id = target_project_id
              and (
                  p.created_by = auth.uid()
                  or public.is_project_leader(p.id)
              )
        )
    );
$$;

create or replace function public.can_edit_project_item(
    target_project_id uuid,
    target_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select (
        public.is_system_admin(auth.uid())
        or exists (
            select 1
            from public.project_items pi
            where pi.project_id = target_project_id
              and pi.id = target_item_id
              and pi.item_type = 'POST'
              and pi.author_id = auth.uid()
        )
        or exists (
            select 1
            from public.project_items pi
            join public.project_item_assignees pia
              on pia.project_id = pi.project_id
             and pia.item_id = pi.id
            join public.project_members pm
              on pm.project_id = pia.project_id
             and pm.id = pia.member_id
            where pi.project_id = target_project_id
              and pi.id = target_item_id
              and pi.item_type = 'TASK'
              and pm.user_id = auth.uid()
        )
    );
$$;

create or replace function public.can_manage_task_assignees(
    target_project_id uuid,
    target_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select (
        public.is_system_admin(auth.uid())
        or exists (
            select 1
            from public.project_items pi
            where pi.project_id = target_project_id
              and pi.id = target_item_id
              and pi.item_type = 'TASK'
              and pi.author_id = auth.uid()
        )
        or public.can_edit_project_item(target_project_id, target_item_id)
    );
$$;

create or replace function public.can_join_project_via_invitation(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.project_invitations pi
        where pi.project_id = target_project_id
          and pi.status in ('PENDING', 'ACCEPTED')
          and (
              pi.invitee_user_id = auth.uid()
              or lower(pi.invitee_email) = public.current_user_email()
          )
    );
$$;

create or replace function public.is_chat_room_member(
    target_room_id uuid,
    target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.chat_room_members crm
        where crm.room_id = target_room_id
          and crm.user_id = target_user_id
    );
$$;

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

create or replace function public.validate_project_item_comment_parent()
returns trigger
language plpgsql
as $$
declare
    parent_project_id uuid;
    parent_item_id uuid;
    parent_parent_id uuid;
begin
    if new.parent_comment_id is null then
        return new;
    end if;

    if new.parent_comment_id = new.id then
        raise exception '댓글은 자기 자신을 부모로 가질 수 없습니다.';
    end if;

    select
        pic.project_id,
        pic.item_id,
        pic.parent_comment_id
    into
        parent_project_id,
        parent_item_id,
        parent_parent_id
    from public.project_item_comments pic
    where pic.id = new.parent_comment_id;

    if parent_project_id is null or parent_item_id is null then
        raise exception '답글 대상 댓글을 찾을 수 없습니다.';
    end if;

    if parent_project_id <> new.project_id or parent_item_id <> new.item_id then
        raise exception '같은 업무/글의 댓글에만 답글을 작성할 수 있습니다.';
    end if;

    if parent_parent_id is not null then
        raise exception '답글은 1단계까지만 작성할 수 있습니다.';
    end if;

    return new;
end;
$$;

create or replace function public.sync_project_item_comment_count()
returns trigger
language plpgsql
as $$
declare
    target_project_id uuid;
    target_item_id uuid;
begin
    if tg_op = 'UPDATE'
       and (old.project_id is distinct from new.project_id or old.item_id is distinct from new.item_id) then
        update public.project_items pi
        set comment_count = (
            select count(*)
            from public.project_item_comments pic
            where pic.project_id = old.project_id
              and pic.item_id = old.item_id
        )
        where pi.project_id = old.project_id
          and pi.id = old.item_id;
    end if;

    target_project_id := coalesce(new.project_id, old.project_id);
    target_item_id := coalesce(new.item_id, old.item_id);

    update public.project_items pi
    set comment_count = (
        select count(*)
        from public.project_item_comments pic
        where pic.project_id = target_project_id
          and pic.item_id = target_item_id
    )
    where pi.project_id = target_project_id
      and pi.id = target_item_id;

    return null;
end;
$$;

create or replace function public.guard_user_profile_admin_flag()
returns trigger
language plpgsql
as $$
begin
    if auth.role() <> 'service_role' then
        if tg_op = 'INSERT' and coalesce(new.is_admin, false) then
            raise exception 'is_admin은 서버 전용 필드입니다.';
        end if;

        if tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin then
            raise exception 'is_admin은 서버 전용 필드입니다.';
        end if;
    end if;

    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
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

drop trigger if exists trg_project_item_comments_set_updated_at on public.project_item_comments;
create trigger trg_project_item_comments_set_updated_at
before update on public.project_item_comments
for each row
execute function public.set_updated_at();

drop trigger if exists trg_project_item_comments_validate_parent on public.project_item_comments;
create trigger trg_project_item_comments_validate_parent
before insert or update of parent_comment_id, project_id, item_id on public.project_item_comments
for each row
execute function public.validate_project_item_comment_parent();

drop trigger if exists trg_user_profiles_set_updated_at on public.user_profiles;
create trigger trg_user_profiles_set_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_chat_rooms_set_updated_at on public.chat_rooms;
create trigger trg_chat_rooms_set_updated_at
before update on public.chat_rooms
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_profiles_guard_admin_flag on public.user_profiles;
create trigger trg_user_profiles_guard_admin_flag
before insert or update on public.user_profiles
for each row
execute function public.guard_user_profile_admin_flag();

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

drop trigger if exists trg_project_item_comments_sync_count_insert on public.project_item_comments;
create trigger trg_project_item_comments_sync_count_insert
after insert on public.project_item_comments
for each row
execute function public.sync_project_item_comment_count();

drop trigger if exists trg_project_item_comments_sync_count_delete on public.project_item_comments;
create trigger trg_project_item_comments_sync_count_delete
after delete on public.project_item_comments
for each row
execute function public.sync_project_item_comment_count();

drop trigger if exists trg_project_item_comments_sync_count_update on public.project_item_comments;
create trigger trg_project_item_comments_sync_count_update
after update of project_id, item_id on public.project_item_comments
for each row
execute function public.sync_project_item_comment_count();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select
on table
    public.projects,
    public.project_members,
    public.project_items,
    public.project_item_assignees,
    public.project_item_attachments,
    public.project_item_comments
to anon;

grant select, insert, update, delete
on table
    public.projects,
    public.user_profiles,
    public.project_members,
    public.project_items,
    public.project_item_assignees,
    public.project_item_attachments,
    public.project_item_comments,
    public.project_invitations,
    public.project_join_requests,
    public.notifications,
    public.chat_rooms,
    public.chat_room_members,
    public.chat_messages
to authenticated, service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

grant execute on function public.current_user_email() to anon, authenticated, service_role;
grant execute on function public.is_system_admin(uuid) to anon, authenticated, service_role;
grant execute on function public.is_project_member(uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function public.is_project_leader(uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function public.can_view_project(uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_project(uuid) to anon, authenticated, service_role;
grant execute on function public.can_edit_project_item(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_task_assignees(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.can_join_project_via_invitation(uuid) to anon, authenticated, service_role;
grant execute on function public.is_chat_room_member(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.get_storage_usage_summary() to anon, authenticated, service_role;

grant execute on function public.guard_user_profile_admin_flag() to service_role;
grant execute on function public.set_updated_at() to service_role;
grant execute on function public.sync_project_members_count() to service_role;
grant execute on function public.validate_project_item_comment_parent() to service_role;
grant execute on function public.sync_project_item_comment_count() to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.user_profiles enable row level security;
alter table public.project_members enable row level security;
alter table public.project_items enable row level security;
alter table public.project_item_assignees enable row level security;
alter table public.project_item_attachments enable row level security;
alter table public.project_item_comments enable row level security;
alter table public.project_invitations enable row level security;
alter table public.project_join_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_messages enable row level security;

-- projects
create policy p_projects_select
on public.projects
for select
to anon, authenticated
using (public.can_view_project(id));

create policy p_projects_insert
on public.projects
for insert
to authenticated
with check (
    auth.uid() is not null
    and created_by = auth.uid()
);

create policy p_projects_update
on public.projects
for update
to authenticated
using (public.can_manage_project(id))
with check (public.can_manage_project(id));

create policy p_projects_delete
on public.projects
for delete
to authenticated
using (public.is_system_admin(auth.uid()));

-- user_profiles
create policy p_user_profiles_select
on public.user_profiles
for select
to authenticated
using (auth.uid() is not null);

create policy p_user_profiles_insert
on public.user_profiles
for insert
to authenticated
with check (user_id = auth.uid());

create policy p_user_profiles_update
on public.user_profiles
for update
to authenticated
using (
    user_id = auth.uid()
    or public.is_system_admin(auth.uid())
)
with check (
    user_id = auth.uid()
    or public.is_system_admin(auth.uid())
);

create policy p_user_profiles_delete
on public.user_profiles
for delete
to authenticated
using (public.is_system_admin(auth.uid()));

-- project_members
create policy p_project_members_select
on public.project_members
for select
to anon, authenticated
using (public.can_view_project(project_id));

create policy p_project_members_insert
on public.project_members
for insert
to authenticated
with check (
    public.can_manage_project(project_id)
    or (
        auth.uid() is not null
        and user_id = auth.uid()
        and role = 'member'
        and public.can_join_project_via_invitation(project_id)
    )
);

create policy p_project_members_update
on public.project_members
for update
to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));

create policy p_project_members_delete
on public.project_members
for delete
to authenticated
using (
    public.can_manage_project(project_id)
    or public.is_system_admin(auth.uid())
    or (
        auth.uid() is not null
        and user_id = auth.uid()
        and role = 'member'
    )
);

-- project_items
create policy p_project_items_select
on public.project_items
for select
to anon, authenticated
using (public.can_view_project(project_id));

create policy p_project_items_insert
on public.project_items
for insert
to authenticated
with check (
    auth.uid() is not null
    and author_id = auth.uid()
    and (
        public.is_system_admin(auth.uid())
        or public.is_project_member(project_id)
    )
);

create policy p_project_items_update
on public.project_items
for update
to authenticated
using (public.can_edit_project_item(project_id, id))
with check (public.can_edit_project_item(project_id, id));

create policy p_project_items_delete
on public.project_items
for delete
to authenticated
using (public.can_edit_project_item(project_id, id));

-- project_item_assignees
create policy p_project_item_assignees_select
on public.project_item_assignees
for select
to anon, authenticated
using (public.can_view_project(project_id));

create policy p_project_item_assignees_insert
on public.project_item_assignees
for insert
to authenticated
with check (public.can_manage_task_assignees(project_id, item_id));

create policy p_project_item_assignees_update
on public.project_item_assignees
for update
to authenticated
using (public.can_manage_task_assignees(project_id, item_id))
with check (public.can_manage_task_assignees(project_id, item_id));

create policy p_project_item_assignees_delete
on public.project_item_assignees
for delete
to authenticated
using (public.can_manage_task_assignees(project_id, item_id));

-- project_item_attachments
create policy p_project_item_attachments_select
on public.project_item_attachments
for select
to anon, authenticated
using (public.can_view_project(project_id));

create policy p_project_item_attachments_insert
on public.project_item_attachments
for insert
to authenticated
with check (public.can_manage_task_assignees(project_id, item_id));

create policy p_project_item_attachments_update
on public.project_item_attachments
for update
to authenticated
using (public.can_manage_task_assignees(project_id, item_id))
with check (public.can_manage_task_assignees(project_id, item_id));

create policy p_project_item_attachments_delete
on public.project_item_attachments
for delete
to authenticated
using (public.can_manage_task_assignees(project_id, item_id));

-- project_item_comments
create policy p_project_item_comments_select
on public.project_item_comments
for select
to anon, authenticated
using (public.can_view_project(project_id));

create policy p_project_item_comments_insert
on public.project_item_comments
for insert
to authenticated
with check (
    auth.uid() is not null
    and author_user_id = auth.uid()
    and (
        public.is_system_admin(auth.uid())
        or public.is_project_member(project_id)
    )
);

create policy p_project_item_comments_update
on public.project_item_comments
for update
to authenticated
using (
    author_user_id = auth.uid()
    or public.is_system_admin(auth.uid())
)
with check (
    author_user_id = auth.uid()
    or public.is_system_admin(auth.uid())
);

create policy p_project_item_comments_delete
on public.project_item_comments
for delete
to authenticated
using (
    author_user_id = auth.uid()
    or public.is_system_admin(auth.uid())
);

-- project_invitations
create policy p_project_invitations_select
on public.project_invitations
for select
to authenticated
using (
    public.is_system_admin(auth.uid())
    or public.can_manage_project(project_id)
    or invitee_user_id = auth.uid()
    or lower(invitee_email) = public.current_user_email()
);

create policy p_project_invitations_insert
on public.project_invitations
for insert
to authenticated
with check (
    auth.uid() is not null
    and (
        public.can_manage_project(project_id)
        or public.is_system_admin(auth.uid())
    )
    and (
        inviter_user_id is null
        or inviter_user_id = auth.uid()
        or public.is_system_admin(auth.uid())
    )
);

create policy p_project_invitations_update
on public.project_invitations
for update
to authenticated
using (
    public.can_manage_project(project_id)
    or public.is_system_admin(auth.uid())
    or invitee_user_id = auth.uid()
    or lower(invitee_email) = public.current_user_email()
)
with check (
    public.can_manage_project(project_id)
    or public.is_system_admin(auth.uid())
    or invitee_user_id = auth.uid()
    or lower(invitee_email) = public.current_user_email()
);

create policy p_project_invitations_delete
on public.project_invitations
for delete
to authenticated
using (
    public.can_manage_project(project_id)
    or public.is_system_admin(auth.uid())
);

-- project_join_requests
create policy p_project_join_requests_select
on public.project_join_requests
for select
to authenticated
using (
    public.can_manage_project(project_id)
    or public.is_system_admin(auth.uid())
    or requester_user_id = auth.uid()
    or lower(requester_email) = public.current_user_email()
);

create policy p_project_join_requests_insert
on public.project_join_requests
for insert
to authenticated
with check (
    auth.uid() is not null
    and requester_user_id = auth.uid()
    and not public.is_project_member(project_id)
);

create policy p_project_join_requests_update
on public.project_join_requests
for update
to authenticated
using (
    public.can_manage_project(project_id)
    or public.is_system_admin(auth.uid())
    or requester_user_id = auth.uid()
)
with check (
    public.can_manage_project(project_id)
    or public.is_system_admin(auth.uid())
    or requester_user_id = auth.uid()
);

create policy p_project_join_requests_delete
on public.project_join_requests
for delete
to authenticated
using (
    public.can_manage_project(project_id)
    or public.is_system_admin(auth.uid())
    or requester_user_id = auth.uid()
);

-- notifications
create policy p_notifications_select
on public.notifications
for select
to authenticated
using (
    recipient_user_id = auth.uid()
    or public.is_system_admin(auth.uid())
);

create policy p_notifications_insert
on public.notifications
for insert
to authenticated
with check (
    auth.uid() is not null
    and (
        public.is_system_admin(auth.uid())
        or actor_user_id = auth.uid()
        or actor_user_id is null
    )
);

create policy p_notifications_update
on public.notifications
for update
to authenticated
using (
    recipient_user_id = auth.uid()
    or public.is_system_admin(auth.uid())
)
with check (
    recipient_user_id = auth.uid()
    or public.is_system_admin(auth.uid())
);

create policy p_notifications_delete
on public.notifications
for delete
to authenticated
using (
    recipient_user_id = auth.uid()
    or public.is_system_admin(auth.uid())
);

-- chat_rooms
create policy p_chat_rooms_select
on public.chat_rooms
for select
to authenticated
using (
    auth.uid() is not null
    and (
        room_type = 'public'
        or public.is_chat_room_member(id, auth.uid())
        or public.is_system_admin(auth.uid())
    )
);

create policy p_chat_rooms_insert
on public.chat_rooms
for insert
to authenticated
with check (
    auth.uid() is not null
    and created_by = auth.uid()
    and (
        (room_type = 'public' and public.is_system_admin(auth.uid()))
        or (
            room_type = 'direct'
            and direct_key is not null
            and char_length(trim(direct_key)) > 0
        )
    )
);

create policy p_chat_rooms_update
on public.chat_rooms
for update
to authenticated
using (
    public.is_system_admin(auth.uid())
    or created_by = auth.uid()
)
with check (
    public.is_system_admin(auth.uid())
    or created_by = auth.uid()
);

create policy p_chat_rooms_delete
on public.chat_rooms
for delete
to authenticated
using (
    public.is_system_admin(auth.uid())
    or created_by = auth.uid()
);

-- chat_room_members
create policy p_chat_room_members_select
on public.chat_room_members
for select
to authenticated
using (
    auth.uid() is not null
    and (
        user_id = auth.uid()
        or public.is_chat_room_member(room_id, auth.uid())
        or public.is_system_admin(auth.uid())
    )
);

create policy p_chat_room_members_insert
on public.chat_room_members
for insert
to authenticated
with check (
    auth.uid() is not null
    and (
        user_id = auth.uid()
        or public.is_system_admin(auth.uid())
        or exists (
            select 1
            from public.chat_rooms cr
            where cr.id = room_id
              and cr.created_by = auth.uid()
              and cr.room_type = 'direct'
        )
    )
);

create policy p_chat_room_members_update
on public.chat_room_members
for update
to authenticated
using (public.is_system_admin(auth.uid()))
with check (public.is_system_admin(auth.uid()));

create policy p_chat_room_members_delete
on public.chat_room_members
for delete
to authenticated
using (public.is_system_admin(auth.uid()));

-- chat_messages
create policy p_chat_messages_select
on public.chat_messages
for select
to authenticated
using (
    auth.uid() is not null
    and exists (
        select 1
        from public.chat_rooms cr
        where cr.id = room_id
          and (
              cr.room_type = 'public'
              or public.is_chat_room_member(cr.id, auth.uid())
              or public.is_system_admin(auth.uid())
          )
    )
);

create policy p_chat_messages_insert
on public.chat_messages
for insert
to authenticated
with check (
    auth.uid() is not null
    and sender_user_id = auth.uid()
    and (
        (
            body is not null
            and char_length(trim(body)) between 1 and 1000
        )
        or image_url is not null
    )
    and exists (
        select 1
        from public.chat_rooms cr
        where cr.id = room_id
          and (
              cr.room_type = 'public'
              or public.is_chat_room_member(cr.id, auth.uid())
              or public.is_system_admin(auth.uid())
          )
    )
);

create policy p_chat_messages_update
on public.chat_messages
for update
to authenticated
using (
    sender_user_id = auth.uid()
    or public.is_system_admin(auth.uid())
)
with check (
    sender_user_id = auth.uid()
    or public.is_system_admin(auth.uid())
);

create policy p_chat_messages_delete
on public.chat_messages
for delete
to authenticated
using (
    sender_user_id = auth.uid()
    or public.is_system_admin(auth.uid())
);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
    alter publication supabase_realtime add table public.notifications;
exception
    when duplicate_object then null;
    when undefined_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'minicrew-media',
    'minicrew-media',
    true,
    10485760,
    null
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists p_storage_objects_public_read_minicrew_media on storage.objects;
create policy p_storage_objects_public_read_minicrew_media
on storage.objects
for select
to public
using (bucket_id = 'minicrew-media');

drop policy if exists p_storage_objects_insert_minicrew_media on storage.objects;
create policy p_storage_objects_insert_minicrew_media
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'minicrew-media'
    and auth.uid() is not null
    and (owner is null or owner = auth.uid())
);

drop policy if exists p_storage_objects_update_minicrew_media on storage.objects;
create policy p_storage_objects_update_minicrew_media
on storage.objects
for update
to authenticated
using (
    bucket_id = 'minicrew-media'
    and auth.uid() is not null
    and (owner = auth.uid() or public.is_system_admin(auth.uid()))
)
with check (
    bucket_id = 'minicrew-media'
    and auth.uid() is not null
    and (owner = auth.uid() or public.is_system_admin(auth.uid()))
);

drop policy if exists p_storage_objects_delete_minicrew_media on storage.objects;
create policy p_storage_objects_delete_minicrew_media
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'minicrew-media'
    and auth.uid() is not null
    and (owner = auth.uid() or public.is_system_admin(auth.uid()))
);

do $$
begin
    alter publication supabase_realtime add table public.chat_messages;
exception
    when duplicate_object then null;
    when undefined_object then null;
end;
$$;

do $$
begin
    alter publication supabase_realtime add table public.chat_room_members;
exception
    when duplicate_object then null;
    when undefined_object then null;
end;
$$;

do $$
begin
    alter publication supabase_realtime add table public.project_item_comments;
exception
    when duplicate_object then null;
    when undefined_object then null;
end;
$$;

do $$
begin
    alter publication supabase_realtime add table public.project_items;
exception
    when duplicate_object then null;
    when undefined_object then null;
end;
$$;

-- Security-definer function to create direct chat rooms.
-- Bypasses RLS INSERT policies since the function runs as the database owner.
-- The BFF validates user identity before calling this.
create or replace function public.create_direct_chat_room(
    p_slug text,
    p_title text,
    p_created_by uuid,
    p_direct_key text,
    p_member_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_room_id uuid;
    v_room record;
    v_member_id uuid;
begin
    -- Check if room already exists
    select id into v_room_id
    from public.chat_rooms
    where room_type = 'direct' and direct_key = p_direct_key;

    if v_room_id is null then
        -- Create the room
        insert into public.chat_rooms (slug, title, created_by, room_type, direct_key)
        values (p_slug, p_title, p_created_by, 'direct', p_direct_key)
        returning id into v_room_id;

        -- Add members
        foreach v_member_id in array p_member_ids
        loop
            insert into public.chat_room_members (room_id, user_id)
            values (v_room_id, v_member_id)
            on conflict (room_id, user_id) do nothing;
        end loop;
    end if;

    select id, slug, title, room_type
    into v_room
    from public.chat_rooms
    where id = v_room_id;

    return jsonb_build_object(
        'id', v_room.id,
        'slug', v_room.slug,
        'title', v_room.title,
        'room_type', v_room.room_type
    );
end;
$$;

grant execute on function public.create_direct_chat_room(text, text, uuid, text, uuid[]) to authenticated;
