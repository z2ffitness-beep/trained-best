-- 016: remove the September snapshot tables (Isaiah approved, 1 Nov).
-- Copies of profiles and programs taken during fixes on 26 and 29 Sep. Nothing
-- in the app, the database functions or other tables reads them, and they
-- still held people who had since deleted their accounts.
drop table if exists public.profiles_backup_locked_20260929;
drop table if exists public.programs_backup_locked_20260929;
drop table if exists public.programs_backup_20260926;
