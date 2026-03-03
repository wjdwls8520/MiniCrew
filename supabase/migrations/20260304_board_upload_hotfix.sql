-- MiniCrew board/task attachment hotfix
-- Apply this in Supabase SQL Editor without resetting data.

begin;

-- 1) Remove legacy attachment constraints (1MB limit, mime restrictions) if present.
do $$
declare
    target record;
begin
    for target in
        select c.conname
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'project_item_attachments'
          and c.contype = 'c'
          and (
              pg_get_constraintdef(c.oid) ilike '%file_size_bytes%'
              or pg_get_constraintdef(c.oid) ilike '%mime_type%'
          )
    loop
        execute format(
            'alter table public.project_item_attachments drop constraint if exists %I',
            target.conname
        );
    end loop;
end;
$$;

-- 2) Re-apply 10MB attachment limit.
alter table public.project_item_attachments
    add constraint project_item_attachments_file_size_bytes_check
    check (file_size_bytes > 0 and file_size_bytes <= 10485760);

-- 3) Ensure storage bucket also allows 10MB objects.
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

-- 4) Ensure service_role can write through BFF service client.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

commit;
