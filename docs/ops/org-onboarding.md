# Organisation Onboarding

## Who can do this

Only `eventar_staff` operators (internal platform team).

## Option 1: Server Action (recommended)

Call `provisionOrganisation` from `app/settings/orgActions.ts`. It creates:
1. An `organisations` row
2. A `staff` row for the first admin (`organiser_admin`)
3. An `org_provisioned` audit event

### Parameters

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Organisation display name (1–100 chars) |
| `slug` | Yes | URL slug (2–40 chars, lowercase alphanumeric + hyphens) |
| `jurisdiction` | No | Default `'HK'` |
| `firstAdminEmail` | Yes | Email for the first org admin |

### Example (via Supabase Studio SQL or a quick script)

```sql
-- If you prefer raw SQL over the Server Action:
insert into organisations (name, slug, status, jurisdiction)
values ('Hong Kong College of Physicians', 'hkcp', 'active', 'HK')
returning id;

-- Use the returned org id:
insert into staff (email, role, organisation_id, status)
values ('admin@hkcp.org', 'organiser_admin', '<org-id>', 'active')
returning id;

-- Audit (last):
select write_audit_event(
  'org_provisioned', null, 'eventar_staff', '<org-id>',
  'organisation', '<org-id>',
  jsonb_build_object('first_admin_staff_id', '<staff-id>', 'slug', 'hkcp')
);
```

## After provisioning

1. The first admin signs in via `/login` using the email provided
2. They land on the Programme dashboard
3. They use **Settings > Team** to create invite links for other members
4. Invitees accept via `/invite/[token]`, which creates their staff row automatically

## Notes

- The `slug` must be unique — a duplicate returns a friendly error
- No self-serve org creation exists; this is intentional for the MVP
- The first admin has `organiser_admin` role and can invite both `organiser_admin` and `organiser_member` roles
