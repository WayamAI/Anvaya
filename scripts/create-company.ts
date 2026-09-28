/*
  Bootstrap a company for production use: the tenant, its units of measure,
  the permission catalogue and system roles, and a first administrator.

    npm run company:create -- --code ACME --name "Acme Chemicals" \
      --admin-email ops.lead@acme.in --admin-name "Asha Rao" \
      [--timezone Asia/Kolkata] [--currency INR]

  The administrator gets a random temporary password, printed once, and must
  set their own at first sign-in. Everything else (locations, materials,
  vendors, more users) is then created through the app.

  Safe to re-run: the permission catalogue and system roles are brought up to
  date, and an existing company or user is never overwritten.
*/

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/server/auth/password";
import { PERMISSIONS, ROLES } from "../prisma/seed/master-data";

const UNITS = [
  { code: "KG", name: "Kilogram", dimension: "MASS" },
  { code: "G", name: "Gram", dimension: "MASS" },
  { code: "L", name: "Litre", dimension: "VOLUME" },
  { code: "ML", name: "Millilitre", dimension: "VOLUME" },
  { code: "PCS", name: "Pieces", dimension: "COUNT" },
];

function arg(name: string, required = true): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (required && (!v || v.startsWith("--"))) {
    console.error(`Missing --${name}. See the usage at the top of scripts/create-company.ts.`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const code = arg("code")!.trim().toUpperCase();
  const name = arg("name")!.trim();
  const adminEmail = arg("admin-email")!.trim().toLowerCase();
  const adminName = arg("admin-name")!.trim();
  const timezone = arg("timezone", false) ?? "Asia/Kolkata";
  const currencyCode = (arg("currency", false) ?? "INR").toUpperCase();

  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) throw new Error("--code must be 2–20 letters, digits, '_' or '-'");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) throw new Error("--admin-email is not an email address");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new Error(`--timezone ${timezone} is not an IANA time zone`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const password = `Tmp-${randomBytes(12).toString("base64url")}a7Z`;
    const passwordHash = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.upsert({
        where: { code },
        update: {},
        create: { code, name, legalName: name, timezone, currencyCode },
      });

      for (const u of UNITS) {
        await tx.unitOfMeasure.upsert({
          where: { companyId_code: { companyId: company.id, code: u.code } },
          update: {},
          create: { companyId: company.id, ...u },
        });
      }

      const permissionId = new Map<string, string>();
      for (const p of PERMISSIONS) {
        const [resource, action] = p.code.split(":");
        const row = await tx.permission.upsert({
          where: { code: p.code },
          update: { description: p.description, resource, action },
          create: { code: p.code, resource, action, description: p.description },
        });
        permissionId.set(p.code, row.id);
      }

      let adminRoleId = "";
      for (const r of ROLES) {
        const role = await tx.role.upsert({
          where: { companyId_code: { companyId: company.id, code: r.code } },
          update: { name: r.name, description: r.description, isSystem: r.isSystem },
          create: { companyId: company.id, code: r.code, name: r.name, description: r.description, isSystem: r.isSystem },
        });
        if (r.code === "ADMIN") adminRoleId = role.id;
        const codes = r.permissions === "*" ? [...permissionId.keys()] : r.permissions;
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({ data: codes.map((c) => ({ roleId: role.id, permissionId: permissionId.get(c)! })) });
      }

      const existing = await tx.user.findUnique({ where: { companyId_email: { companyId: company.id, email: adminEmail } } });
      if (existing) return { company, created: false };
      const user = await tx.user.create({
        data: { companyId: company.id, email: adminEmail, name: adminName, passwordHash, mustChangePassword: true },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: adminRoleId } });
      await tx.auditLog.create({
        data: {
          companyId: company.id, action: "CREATE", entityType: "users", entityId: user.id, entityLabel: adminEmail,
          newValues: { email: adminEmail, name: adminName, roles: ["ADMIN"], via: "scripts/create-company" },
        },
      });
      return { company, created: true };
    }, { timeout: 60_000 });

    console.log(`Company ${result.company.code} (${result.company.name}) is ready.`);
    if (result.created) {
      console.log(`Administrator: ${adminEmail}`);
      console.log(`Temporary password (shown once; must be changed at first sign-in): ${password}`);
    } else {
      console.log(`${adminEmail} already exists; its password was not changed. Roles and permissions were brought up to date.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
