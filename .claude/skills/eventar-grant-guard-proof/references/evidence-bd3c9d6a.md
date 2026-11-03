anon REFERENCES
anon SELECT
authenticated DELETE
authenticated INSERT
authenticated REFERENCES
authenticated SELECT
authenticated UPDATE
service_role DELETE
service_role INSERT
--- policies
consent_self_read | SELECT | (user_id = auth.uid()) | 
consent_self_insert | INSERT |  | (user_id = auth.uid())
consent_self_withdraw | UPDATE | (user_id = auth.uid()) | (user_id = auth.uid())