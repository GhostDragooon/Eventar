if 'email' = any(v_fields) and v_reg.user_id is not null then
    raise exception 'linked_registration: this registration belongs to an Eventar account, so its email cannot be changed here'

--- claim_registrations_for_user
  select *
      from public.registrations
      where lower(trim(email)) = v_email
        and user_id is null
      for update

M2: `update_registration_contact` allows an email change on an attended, unlinked registration. ... `claim_registrations_for_user` links by email, so this re-routes the held credit to whoever owns the new email.