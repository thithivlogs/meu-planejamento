-- Execute no editor SQL do Supabase após criar o projeto.
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('task','mind','note','meeting','focus')),
  title text not null check (char_length(title) between 1 and 300),
  body text not null default '',
  status text not null default 'open' check (status in ('open','done')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_user_kind_due_idx on public.items(user_id, kind, due_at);
alter table public.items enable row level security;
drop policy if exists "read own items" on public.items;
create policy "read own items" on public.items for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "insert own items" on public.items;
create policy "insert own items" on public.items for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "update own items" on public.items;
create policy "update own items" on public.items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "delete own items" on public.items;
create policy "delete own items" on public.items for delete to authenticated using (user_id = (select auth.uid()));
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists items_updated_at on public.items;
create trigger items_updated_at before update on public.items for each row execute function public.set_updated_at();
