-- Dispatching stock against a sales order is a warehouse action, distinct
-- from editing the order (sales-order:update). Existing databases get the
-- permission and its default grants here; new ones also get them from the seed.
INSERT INTO "permissions" ("id", "code", "resource", "action", "description", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'sales-order:dispatch', 'sales-order', 'dispatch', 'dispatch stock against a sales order', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" IN ('ADMIN', 'INVENTORY') AND p."code" = 'sales-order:dispatch'
ON CONFLICT DO NOTHING;

-- Whoever dispatches must be able to see the orders and customers they ship to.
INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" = 'INVENTORY' AND p."code" IN ('sales-order:read', 'customer:read')
ON CONFLICT DO NOTHING;
