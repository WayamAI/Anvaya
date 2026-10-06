-- A work order may no longer complete while its components are issued short
-- of the output. Overriding that, with a reason, is a supervisory act with its
-- own permission. Existing databases get it here, granted to administrators
-- only; new ones also get it from the seed and scripts/create-company.
INSERT INTO "permissions" ("id", "code", "resource", "action", "description", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'work-order:complete-short', 'work-order', 'complete-short', 'complete a work order whose components are issued short, giving a reason', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" = 'ADMIN' AND p."code" = 'work-order:complete-short'
ON CONFLICT DO NOTHING;
