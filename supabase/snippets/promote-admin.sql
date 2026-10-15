-- ═══════════════════════════════════════════════════════════════════════════
-- Promote an account to admin
--
-- Admin is not self-serve: every sign-up creates an ordinary `user`, and the
-- sign-up trigger deliberately ignores client-supplied role metadata. Run
-- these in Supabase Studio's SQL editor (or psql) to grant the console.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Find the account you want to promote.
select p.id, p.username, p.display_name, p.role, u.email, p.created_at
from public.profiles p
join auth.users u on u.id = p.id
order by p.created_at desc;

-- 2. Promote it.
update public.profiles set role = 'admin' where id = '<uuid>';
-- or, by username:
-- update public.profiles set role = 'admin' where username = '<username>';

-- Demote it back to an ordinary user.
-- update public.profiles set role = 'user' where id = '<uuid>';
