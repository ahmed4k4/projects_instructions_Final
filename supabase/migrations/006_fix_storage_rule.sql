-- =============================================================================
-- 006_fix_storage_rule.sql
--
-- `storage_motherboard_interface` shipped in migration 001 as `rule_type =
-- 'match'` comparing `storage.specs.interface` (a string like "PCIe 4.0 x4")
-- with `motherboard.specs.m2Slots` (a number). A string/number comparison can
-- never succeed, so every build with a drive and a motherboard raised a bogus
-- "All M.2 slots are occupied" warning.
--
-- The engine now has a dedicated handler for this key, so the rule only needs
-- its type corrected. Idempotent — safe to re-run.
-- =============================================================================
update public.compatibility_rules
set
    rule_type = 'custom',
    message = 'The build uses more M.2 drives than the motherboard has slots.'
where
    rule_key = 'storage_motherboard_interface';