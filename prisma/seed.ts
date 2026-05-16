import { AuthMode, OrgPlan, PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;

// ── Credentials ───────────────────────────────────────────────────────────────
const SYSTEM_ORG_SECRET  = "authy-system-org-secret-2026";   // change in production
const SUPER_ADMIN_EMAIL  = "superadmin@authy.system";
const SUPER_ADMIN_PASS   = "SuperAdmin@2026!";
const ADMIN_PASS         = "Admin@2026!";
const DUMMY_PASS         = "DummyPass123@#";

// ── Name pools ────────────────────────────────────────────────────────────────
const firstNames = [
  "Alice", "Bob", "Carol", "David", "Emma", "Frank", "Grace", "Henry",
  "Isla", "James", "Karen", "Liam", "Mia", "Noah", "Olivia", "Paul",
  "Quinn", "Rachel", "Sam", "Tara", "Uma", "Victor", "Wendy", "Xander",
  "Yara", "Zoe", "Aaron", "Bella", "Carlos", "Diana", "Ethan", "Fiona",
  "George", "Hannah", "Ivan", "Julia", "Kevin", "Laura", "Marcus", "Nina",
  "Oscar", "Priya", "Ravi", "Sophia", "Tom", "Ursula", "Vince", "Willa",
];

const lastNames = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Martinez", "Anderson", "Taylor", "Thomas", "Hernandez", "Moore",
  "Martin", "Jackson", "Thompson", "White", "Lopez", "Lee", "Gonzalez",
  "Harris", "Clark", "Lewis", "Robinson", "Walker", "Perez", "Hall",
  "Young", "Allen", "Sanchez", "Wright", "King", "Scott", "Green",
  "Baker", "Adams", "Nelson", "Carter", "Mitchell", "Roberts",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Step 0: wipe all tables ───────────────────────────────────────────────────
async function clearDatabase(): Promise<void> {
  console.log("Clearing all data...");
  // List every table in a single TRUNCATE so PostgreSQL acquires locks
  // simultaneously and resolves FK order automatically.
  await prisma.$executeRawUnsafe(`
    TRUNCATE
      "OAuthAuthCode",
      "WebhookDelivery",
      "OrgWebhook",
      "OrgApiKey",
      "OAuthApp",
      "UserFeature",
      "RoleFeature",
      "UserApp",
      "AppRole",
      "Feature",
      "FeatureSyncRequest",
      "App",
      "Notification",
      "AdminNotificationSub",
      "PasswordHistory",
      "PasswordReset",
      "EmailVerification",
      "RefreshToken",
      "AuditLog",
      "OrgInvitation",
      "OrganizationMember",
      "User",
      "Organization"
    CASCADE
  `);
  console.log("All tables cleared.\n");
}

// ── Step 1: system organization ───────────────────────────────────────────────
async function seedSystemOrganization() {
  console.log("── Seed 1: System Organization ──");
  const secretHash = await bcrypt.hash(SYSTEM_ORG_SECRET, BCRYPT_ROUNDS);
  const org = await prisma.organization.create({
    data: {
      name: "authy-system",
      displayName: "Authy System",
      description: "Default system organization for Authy platform administrators.",
      secretHash,
      authMode: AuthMode.FULL,
      isDefault: true,
      plan: OrgPlan.ENTERPRISE,
    },
  });
  console.log(`  Created org: "${org.displayName}"  id=${org.id}\n`);
  return org;
}

// ── Step 2: super admin + 2 admins ────────────────────────────────────────────
async function seedAdmins(organizationId: string) {
  console.log("── Seed 2: Super Admin + 2 Admins ──");

  const superAdminHash = await bcrypt.hash(SUPER_ADMIN_PASS, BCRYPT_ROUNDS);
  const superAdmin = await prisma.user.create({
    data: {
      email:        SUPER_ADMIN_EMAIL,
      passwordHash: superAdminHash,
      role:         UserRole.ADMIN,
      isVerified:   true,
      isActive:     true,
      firstName:    "Super",
      lastName:     "Admin",
      organizationId,
    },
  });
  console.log(`  Super Admin: ${superAdmin.email}`);

  const adminHash = await bcrypt.hash(ADMIN_PASS, BCRYPT_ROUNDS);
  const adminDefs = [
    { email: "admin1@authy.system", firstName: "Admin", lastName: "One" },
    { email: "admin2@authy.system", firstName: "Admin", lastName: "Two" },
  ];

  for (const def of adminDefs) {
    const admin = await prisma.user.create({
      data: {
        email:        def.email,
        passwordHash: adminHash,
        role:         UserRole.ADMIN,
        isVerified:   true,
        isActive:     true,
        firstName:    def.firstName,
        lastName:     def.lastName,
        organizationId,
      },
    });
    console.log(`  Admin:       ${admin.email}`);
  }

  console.log();
}

// ── Step 3: 200 dummy users ───────────────────────────────────────────────────
async function seedDummyUsers(organizationId: string) {
  console.log("── Seed 3: 200 Dummy Users (inactive + unverified) ──");

  const passwordHash = await bcrypt.hash(DUMMY_PASS, BCRYPT_ROUNDS);

  // Build all records first, then createMany for speed.
  const data = Array.from({ length: 200 }, (_, idx) => {
    const i = idx + 1;
    return {
      email:         `dummy.user${String(i).padStart(3, "0")}@authy.system`,
      passwordHash,
      role:          UserRole.USER  as UserRole,
      isVerified:    false,
      isActive:      false,
      firstName:     pick(firstNames),
      lastName:      pick(lastNames),
      organizationId,
    };
  });

  const result = await prisma.user.createMany({ data });
  console.log(`  Created ${result.count} dummy users.`);
  console.log(`  Email range: dummy.user001@authy.system — dummy.user200@authy.system`);
  console.log(`  All users have isVerified=false, isActive=false.`);
  console.log(`  They can call POST /auth/resend-verification with their email.\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Authy Seed ===\n");

  await clearDatabase();

  const org = await seedSystemOrganization();
  await seedAdmins(org.id);
  await seedDummyUsers(org.id);

  console.log("=== Done ===");
  console.log();
  console.log("  Super Admin   superadmin@authy.system  /  " + SUPER_ADMIN_PASS);
  console.log("  Admin 1       admin1@authy.system       /  " + ADMIN_PASS);
  console.log("  Admin 2       admin2@authy.system       /  " + ADMIN_PASS);
  console.log("  Dummy users   dummy.user001–200@authy.system  /  " + DUMMY_PASS);
  console.log("  Org secret    " + SYSTEM_ORG_SECRET);
}

main()
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
