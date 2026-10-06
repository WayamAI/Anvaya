-- Lot quality decisions (release, hold, reject) were gated by
-- inventory:update, so whoever could move stock could also release it. They
-- now have their own permission, letting a company give QC decisions to a
-- quality role alone. To change nobody's access on upgrade, every role that
-- holds inventory:update today is granted quality:decide; administrators can
-- then revoke it from roles that should not release stock.
INSERT INTO "permissions" ("id", "code", "resource", "action", "description", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'quality:decide', 'quality', 'decide', 'release, hold or reject a lot (quality decision)', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT rp."roleId", q."id", NOW()
FROM "role_permissions" rp
JOIN "permissions" iu ON iu."id" = rp."permissionId" AND iu."code" = 'inventory:update'
CROSS JOIN "permissions" q
WHERE q."code" = 'quality:decide'
ON CONFLICT DO NOTHING;
