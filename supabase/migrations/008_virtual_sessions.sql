-- 008: "virtual" as a session delivery, so a coach can price a live video
-- session differently from an in-person one, private or semi-private.
--
-- Approved by Isaiah on 25 Oct 2026. Widens one check constraint; no rows
-- change. The old values (in_person, remote, in_app_live) all stay valid.

alter table public.session_types drop constraint if exists session_types_delivery_check;
alter table public.session_types add constraint session_types_delivery_check
  check (delivery = any (array['in_person'::text, 'remote'::text, 'in_app_live'::text, 'virtual'::text]));
