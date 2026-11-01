-- =============================================================================
-- 002_catalogue_rls.sql
--
-- Catalogue data (components + compatibility_rules) must be readable by any
-- visitor and writable only by trusted back-office roles. Instead of granting
-- blanket write access to `anon`, we key writes off the `app_metadata.role`
-- claim so operators can hold that claim via the Auth API.
--
-- Project owners can, of course, always seed through the service_role key
-- (which bypasses RLS entirely) or the SQL editor.
-- =============================================================================

create or replace function public.is_catalogue_editor()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'catalog_editor'),
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- components
-- -----------------------------------------------------------------------------
drop policy if exists "components_editor_insert" on public.components;
create policy "components_editor_insert"
  on public.components for insert
  to authenticated
  with check (public.is_catalogue_editor());

drop policy if exists "components_editor_update" on public.components;
create policy "components_editor_update"
  on public.components for update
  to authenticated
  using (public.is_catalogue_editor())
  with check (public.is_catalogue_editor());

drop policy if exists "components_editor_delete" on public.components;
create policy "components_editor_delete"
  on public.components for delete
  to authenticated
  using (public.is_catalogue_editor());

-- -----------------------------------------------------------------------------
-- compatibility_rules
-- -----------------------------------------------------------------------------
drop policy if exists "rules_editor_insert" on public.compatibility_rules;
create policy "rules_editor_insert"
  on public.compatibility_rules for insert
  to authenticated
  with check (public.is_catalogue_editor());

drop policy if exists "rules_editor_update" on public.compatibility_rules;
create policy "rules_editor_update"
  on public.compatibility_rules for update
  to authenticated
  using (public.is_catalogue_editor())
  with check (public.is_catalogue_editor());

drop policy if exists "rules_editor_delete" on public.compatibility_rules;
create policy "rules_editor_delete"
  on public.compatibility_rules for delete
  to authenticated
  using (public.is_catalogue_editor());

-- -----------------------------------------------------------------------------
-- Grants for editors
-- -----------------------------------------------------------------------------
grant insert, update, delete on public.components, public.compatibility_rules to authenticated;
